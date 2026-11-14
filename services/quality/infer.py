"""CPU YOLO inference. CLI for development; authenticated HTTP service for deployment."""
import base64
import io
import json
import os
import sys
import hmac
from functools import lru_cache
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer

os.environ['YOLO_AUTOINSTALL'] = 'false'
from PIL import Image, ImageOps
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[2]
Image.MAX_IMAGE_PIXELS = 16000000
POLICY = {'ripe': 'A', 'half_ripe': 'B', 'raw': 'C', 'rotten': 'REJECT'}

@lru_cache(maxsize=4)
def model(name):
    return YOLO(str(ROOT / 'yolo_best_weights' / name))

def evaluate(packet):
    crop = str(packet.get('cropId', '')).upper()
    raw = base64.b64decode(packet['imageBase64'], validate=True)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('Image must be under 2 MB')
    with Image.open(io.BytesIO(raw)) as source:
        if source.format not in {'JPEG', 'PNG', 'WEBP'} or source.width * source.height > 16000000:
            raise ValueError('Use JPEG, PNG or WebP under 16 megapixels')
        image = ImageOps.exif_transpose(source).convert('RGB')
    image.thumbnail((1600, 1600))
    limitations = ['Visual sample estimate only, not a laboratory or whole-lot certificate.',
                   'A/B/C is a provisional ripeness policy: ripe/half-ripe/raw; rotten samples are flagged REJECT.']
    if crop != 'TOMATO':
        return {'status': 'MANUAL_REVIEW_REQUIRED', 'grade': None, 'confidence': None,
                'reason': 'Supplied potato weights have COCO labels and cannot grade potatoes.' if crop == 'POTATO' else 'No trained quality model supplied for this crop.', 'samples': [], 'limitations': limitations}
    try:
        return classify_tomato(image, limitations)
    except Exception:
        return {'status': 'MANUAL_REVIEW_REQUIRED', 'grade': None, 'confidence': None,
                'reason': 'Photo validated, but the tomato model is unavailable. Manual inspection is required.',
                'samples': [], 'limitations': limitations}


def summarize_samples(samples):
    threshold = 0.65
    reliable = [sample for sample in samples if sample['confidence'] >= threshold]
    counts = {label: sum(sample['label'] == label for sample in reliable) for label in POLICY}
    counts['uncertain'] = len(samples) - len(reliable)
    coverage = len(reliable) / len(samples) if samples else 0
    # A coverage rule for provisional sampling, not a calibrated accuracy estimate.
    sufficient = bool(samples) and coverage >= 0.60
    grade = max((POLICY[sample['label']] for sample in reliable), key=lambda value: ['A', 'B', 'C', 'REJECT'].index(value)) if sufficient else None
    if not samples:
        reason = 'No tomatoes detected. Upload a clearer close-up or request partner inspection.'
    elif not sufficient:
        reason = f"Only {len(reliable)} of {len(samples)} detected tomatoes meet the 65% model-score threshold; too few reliable samples to assign a visual grade. Upload a closer photo or request partner inspection."
    else:
        reason = f"Visual estimate from {len(reliable)} of {len(samples)} detected tomatoes. Uncertain detections excluded: {counts['uncertain']}; partner review remains required."
    return {'status': 'ESTIMATED' if grade else 'MANUAL_REVIEW_REQUIRED', 'grade': grade,
            'confidence': min((sample['confidence'] for sample in reliable), default=None),
            'confidenceMeaning': 'lowest qualifying sample score, not overall photo accuracy',
            'reason': reason, 'sampleSummary': counts, 'totalSampleCount': len(samples),
            'reliableSampleCount': len(reliable), 'sampleCoverage': coverage,
            'reliabilityThreshold': threshold, 'spoilageDetected': counts['rotten'] > 0,
            'warnings': ['Potential spoilage detected in a qualifying sample; partner inspection required.'] if counts['rotten'] else []}


def classify_tomato(image, limitations):
    detector = model('detector_yolo26s_best.pt')
    classifier = model('ripeness_yolo26s-cls_best.pt')
    if set(detector.names.values()) != {'tomato'} or set(classifier.names.values()) != set(POLICY):
        raise ValueError('Unexpected model classes; grading disabled')
    result = detector.predict(image, device='cpu', conf=0.4, max_det=20, verbose=False)[0]
    samples = []
    for box in result.boxes:
        xyxy = [int(value) for value in box.xyxy[0].tolist()]
        region = image.crop(tuple(xyxy))
        if region.width < 8 or region.height < 8:
            continue
        classified = classifier.predict(region, device='cpu', verbose=False)[0]
        label = classifier.names[classified.probs.top1]
        confidence = float(classified.probs.top1conf)
        samples.append({'label': label, 'confidence': confidence, 'box': xyxy})
    return {**summarize_samples(samples),
            'samples': samples, 'imageSize': list(image.size), 'modelVersion': 'tomato-yolo26s-ripeness-v2',
            'gradePolicy': 'visual-ripeness-v2', 'limitations': limitations}

def run(packet):
    try:
        return {'success': True, 'data': evaluate(packet)}
    except Exception as error:
        return {'success': False, 'message': str(error)[:240]}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        token = os.environ.get('QUALITY_SERVICE_TOKEN', '')
        if not token or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
            self.send_error(401); return
        size = int(self.headers.get('Content-Length', 0))
        if size <= 0 or size > 3000000:
            self.send_error(413); return
        try:
            response = run(json.loads(self.rfile.read(size)))
        except ValueError:
            self.send_error(400); return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps(response).encode())

if __name__ == '__main__':
    if '--serve' in sys.argv:
        HTTPServer(('127.0.0.1', int(os.environ.get('QUALITY_PORT', '8091'))), Handler).serve_forever()
    else:
        # Libraries may print startup information; JSON alone belongs on stdout.
        from contextlib import redirect_stdout
        with redirect_stdout(sys.stderr):
            response = run(json.load(sys.stdin))
        print(json.dumps(response))
