import base64
import importlib.util
import io
import unittest
import os
import json
import threading
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
from PIL import Image

spec = importlib.util.spec_from_file_location('quality', Path(__file__).with_name('infer.py'))
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)

class QualityChecks(unittest.TestCase):
    def setUp(self):
        output = io.BytesIO()
        Image.new('RGB', (48, 48), 'white').save(output, 'JPEG')
        self.photo = base64.b64encode(output.getvalue()).decode()

    def test_invalid_image_rejected(self):
        self.assertFalse(quality.run({'cropId': 'TOMATO', 'imageBase64': 'not-a-photo'})['success'])

    def test_potato_is_not_misrepresented_as_trained_grader(self):
        result = quality.evaluate({'cropId': 'POTATO', 'imageBase64': self.photo})
        self.assertEqual(result['status'], 'MANUAL_REVIEW_REQUIRED')
        self.assertIsNone(result['grade'])

    def test_no_produce_means_no_grade(self):
        result = quality.evaluate({'cropId': 'TOMATO', 'imageBase64': self.photo})
        self.assertEqual(result['status'], 'MANUAL_REVIEW_REQUIRED')
        self.assertIsNone(result['grade'])
        self.assertEqual(result['samples'], [])

class SampleAggregationChecks(unittest.TestCase):
    def test_one_uncertain_sample_does_not_block_nineteen_reliable_samples(self):
        samples = [{'label': 'ripe', 'confidence': .95}] * 19 + [{'label': 'rotten', 'confidence': .59}]
        result = quality.summarize_samples(samples)
        self.assertEqual(result['grade'], 'A')
        self.assertEqual(result['sampleSummary']['uncertain'], 1)
        self.assertEqual(result['reliableSampleCount'], 19)
        self.assertFalse(result['spoilageDetected'])

    def test_reliable_spoilage_is_not_hidden_by_majority(self):
        samples = [{'label': 'ripe', 'confidence': .95}] * 18 + [{'label': 'rotten', 'confidence': .90}, {'label': 'ripe', 'confidence': .59}]
        result = quality.summarize_samples(samples)
        self.assertEqual(result['grade'], 'REJECT')
        self.assertTrue(result['spoilageDetected'])

    def test_mostly_uncertain_photo_abstains(self):
        result = quality.summarize_samples([{'label': 'ripe', 'confidence': .9}] + [{'label': 'raw', 'confidence': .5}] * 9)
        self.assertIsNone(result['grade'])
        self.assertIn('1 of 10', result['reason'])
        self.assertNotIn('No tomatoes', result['reason'])

    def test_no_detections_has_its_own_message(self):
        result = quality.summarize_samples([])
        self.assertIsNone(result['grade'])
        self.assertIn('No tomatoes detected', result['reason'])

class HttpServiceChecks(unittest.TestCase):
    def setUp(self):
        self.token = patch.dict(os.environ, {'QUALITY_SERVICE_TOKEN': 'test-service-secret'})
        self.token.start()
        self.server = quality.HTTPServer(('127.0.0.1', 0), quality.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.token.stop()

    def test_health_does_not_require_token(self):
        with urlopen(self.url + '/health') as response:
            self.assertEqual(json.load(response)['status'], 'ok')

    def test_inference_requires_service_token(self):
        request = Request(self.url, data=b'{}', method='POST')
        with self.assertRaises(HTTPError) as caught:
            urlopen(request)
        self.assertEqual(caught.exception.code, 401)

    def test_authenticated_photo_validation(self):
        request = Request(self.url, data=json.dumps({'cropId': 'TOMATO', 'imageBase64': 'bad-photo'}).encode(), headers={'Authorization': 'Bearer test-service-secret'}, method='POST')
        with urlopen(request) as response:
            self.assertFalse(json.load(response)['success'])

if __name__ == '__main__':
    unittest.main()
