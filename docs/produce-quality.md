# Produce photo assessment and partner approval

## Farmer flow

Farmer / Sell lots / Create sell lot supports up to five JPEG, PNG or WebP photos.
The browser strips metadata and resizes images to at most 1600 pixels on the long
edge, then uploads them to authenticated `/api/produce-quality`. Photos are saved
in MongoDB with their owner, crop and assessment. Unpublished photos expire after
seven days; publishing binds them to the lot and removes that expiry.

The asking-price field remains editable. Get price reference uses once-daily CEDA
snapshots, a 30-day observed mandi price distribution, same-month prior-year price
history where available, open regional buyer demand, same-month prior-year buyer
demand where recorded, and the supplied transport cost per kg. Prices convert
INR/quintal to INR/kg before transport deductions. The suggested farm-gate band
uses the observed 25th-75th percentile; its midpoint can fill the asking-price field.
Empty data or prices older than 14 days withhold the price recommendation. This is
a transparent indicative reference, not a trained price forecast or guaranteed sale.
No speculative quality premium or seasonal-demand multiplier is added. A visual
REJECT result blocks a sale-price reference until partner inspection.

## Supplied weights and limitations

`yolo_best_weights/detector_yolo26s_best.pt` detects tomatoes. Each detected tomato
crop is passed to `ripeness_yolo26s-cls_best.pt`, whose labels are `raw`, `half_ripe`,
`ripe`, and `rotten`. A provisional visual policy maps ripe to A, half-ripe to B,
raw to C, and rotten to REJECT; the most conservative detected sample determines
the provisional image grade among qualifying samples. This policy is an application rule, not a validated commercial
or statutory grading standard. Individual samples below 0.65 abstain; photos abstain when reliable coverage is insufficient or detections are absent.
At least 60% of detected samples must meet the 0.65 score threshold for an
image grade. Lower-scoring samples are counted as uncertain and excluded from
ripeness counts and grading; a single uncertain sample no longer blocks all other
samples. Any qualifying rotten sample still raises a spoilage warning and blocks
a sale-price reference. No detections and insufficient sample coverage have distinct
messages. This v2 coverage rule is a provisional policy, not calibrated accuracy.
Existing stored v1 assessments remain unchanged; re-upload photos to reassess.
Photos represent only visible samples; no internal defects, residues, food safety,
whole-lot uniformity or laboratory measurements are certified.

The supplied `yolo11n.pt` and `yolo11s.pt` have standard 80-class COCO labels and
are **not trained potato-quality weights**. Potato photos are uploaded and sent to
manual review, with no fabricated AI grade. Replace these with genuine trained
potato quality/defect weights and their class definitions to enable potato grading.

## Partner review

The quality-partner dashboard shows a produce-review queue separate from the
existing batch inspection requests. Every attached photo can be opened full size.
The reviewer chooses an independent grade and supplies findings. Approve requires
the selected grade to match every model estimate; unavailable/different estimates
use the independent/corrected decision. Reject requires REJECT and cancels the lot.
Review requires explicit photo-inspection confirmation. The signed actor, decision,
notes and time are recorded and the original AI output remains unchanged.
Only quality-inspector roles may verify; other farmers cannot retrieve private
photos or attach another farmer's assessments. Duplicate review is rejected.

The photo review is distinct from an in-person inspection or a laboratory certificate.

## Development and deployment

Install `python -m pip install -r services/quality/requirements.txt` in the Python
environment specified by `PYTHON_EXECUTABLE`. Local Vite invokes the CPU worker
as a subprocess. Main app dependencies remain separate from the heavy YOLO stack.

For deployment, run `python services/quality/infer.py --serve` on a Python CPU
host beside the weights. It listens on localhost port 8091 (`QUALITY_PORT`),
requires `QUALITY_SERVICE_TOKEN`, and serializes inference to limit memory usage.
Expose it only through your authenticated HTTPS service/reverse proxy; set the
web backend's `QUALITY_INFERENCE_URL` and matching `QUALITY_SERVICE_TOKEN`.
Vercel does not attempt to bundle PyTorch and these weights into a Node function.
The web API has a 120-second execution budget; the inference timeout is 90 seconds.
MongoDB is required for durable photos, lot binding and partner review.

A validated photo with an unavailable model remains in manual review. If the
image-validation service itself is unavailable, upload fails visibly without storing
an unvalidated file. A failed upload/storage
operation is surfaced and does not silently publish missing photo evidence.

## Checks

- `python services/quality/infer.selfcheck.py`: invalid image, potato abstention,
  and no-produce abstention using the actual detector.
- `node api/_utils/producePricing.selfcheck.js`: unit conversion, quartiles,
  transport deductions, empty/stale/future evidence.
- Live local API test used an isolated test seller: stored real-photo YOLO inference,
  publish, cross-owner rejection, private image access, inspector queue, seller-role
  verification denial, corrected partner grade, original AI preservation and
  duplicate-review protection. Lot binding and grade updates use MongoDB transactions
  so photos, assessments and lot state cannot be partially committed. Test identities and records are removed afterward.

The external test photo is Tomato je.jpg by Softeis, CC BY-SA 3.0:
https://commons.wikimedia.org/wiki/File:Tomato_je.jpg
https://creativecommons.org/licenses/by-sa/3.0/
It is kept in ignored `artifacts/quality/` solely for testing, not shipped as a
farmer photo. The model's mixed ripe/raw output on this sample is an inference
result, not an accuracy or grading validation claim.

Repeat the isolated live API check with `node scripts/check_produce_quality.mjs
<tomato-photo.jpg>`. It requires the local server and MongoDB; its own temporary
records are removed in a finally block. No CEDA calls are made by this check.

## Workspace account switching

The workspace dropdown signs in to the selected existing demo account through
`/api/login` before navigation. Both account identity and access token are replaced
together. It no longer changes a farmer's displayed role while keeping a farmer
token. Non-demo accounts must sign in with credentials authorized for the target
workspace. API inspector authorization remains mandatory.

On page reload, stored preview-only roles are reconciled with the existing token;
missing/expired tokens or mismatched account identities require a new sign-in.
Client-only login fallback has been removed so failed credentials cannot create a
fake account session or inherit another account's token.

Run `node src/utils/accountSession.selfcheck.mjs` for session regression checks.
Live browser verification confirmed the reported Tomato lot appears after switching
from the farmer demo account to the quality-partner account, including its private
photo. The test did not approve or modify the farmer's assessment.
