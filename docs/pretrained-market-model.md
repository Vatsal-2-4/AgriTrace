# Pretrained crop prediction and LLM advisory

## Runtime flow

`POST /api/ai/mandi-forecast` validates prepared inputs, loads the pretrained
LightGBM classifier and returns UP, DOWN or STABLE with class probabilities. It
then sends the exact features, the original prediction and every supplied sale
condition to Qwen 3.8 27B on Groq (`qwen/qwen3.8-27b`) for consistency review.
There is no training on submitted inputs and no Gemini fallback.

The system prompt is `REVIEW_SYSTEM_PROMPT` in `api/ai/mandi-forecast.py`. It asks
for scope/context checks, material supporting and opposing feature signals,
missing information, and a practical advisory grounded in sale conditions.
Unknown normalization formulas and units remain unknown. The LLM must cite exact
feature names, preserve the model output and never claim to verify the future.

## Artifacts and configuration

Keep these trusted artifacts together in `model/`:

- `lgbm_final.txt`: trained direction classifier.
- `le_target.pkl`: class decoding (DOWN, STABLE, UP).
- `cat_mappings.pkl`: ordered categories for state, vegetable and season.
- `feature_cols.csv`: exact input order; checked against the model at load time.

The supplied model requires **40 features**, not 38. Supported crops are Onion,
Potato and Tomato. Wool and other commodities are unsupported by these weights.

Install `python -m pip install -r requirements.txt` and configure the server's
`GROQ_API_KEY`. scikit-learn is pinned to 1.6.1, matching the saved encoder.
For `npm run dev`, the Vite bridge starts a Python process. Optionally set
`PYTHON_EXECUTABLE` to a virtual environment's Python. Production uses the Python
serverless handler and includes `model/**` in its function bundle.

## Request and response

Send a JSON object with `features` and optional `conditions`. Features must contain
all columns in `model/feature_cols.csv`. Numeric values must be finite JSON numbers.
Categories use original case-sensitive names rather than encoded IDs. Input key
order is irrelevant. Missing values and unsupported categories return HTTP 400.

Conditions can include non-negative numeric `shelfLifeDays`, `holdingPeriodDays`,
`storageCostPerUnit` and `transportCostPerUnit`, plus text `priceUnit`,
`predictionHorizon` and `notes`. Additional JSON context is passed to Qwen.

Responses preserve `direction`, `classProbabilities`, `modelVersion` and
`featureCount`, and include `inputFeatures`, `inputConditions` and `reviewModel`
so the exact assessment can be inspected. No numeric price or delta is invented.

- Consistent review with a valid advisory: `status = READY`.
- Concerns, insufficient information or provider failure: `status = REVIEW_REQUIRED`
  and `advisory = null`; the model output remains available.
- Model load/inference failure: HTTP 503.

The review includes `rationale`, `featureChecks`, `concerns` and
`missingInformation`. Feature checks use exact input names and SUPPORTS,
CONTRADICTS or CONTEXT assessments. Unknown feature references are rejected.
A contradictory feature check prevents a CONSISTENT review from passing.
Holding advice requires shelf life, intended holding period, storage and transport
costs, and the price/cost unit. Holding beyond the remaining shelf life is blocked.
The original prediction is never replaced with an LLM prediction.

## Farmer UI

Open **Farmer / Market intelligence** (`/farmer/market/overview`). The Crop
prediction & sale advisory panel accepts manual entry of all features or a JSON
file/paste import. JSON may be a bare feature object or an object containing
`features` and optional `conditions`. Inputs start empty; no synthetic values are
used in production. The UI schema is derived from the artifacts and tested for
agreement with their feature order and category lists.

The panel shows input completeness, sale conditions, loading/error states, the
model direction and class probabilities, the Qwen review and cited feature checks,
concerns/missing information, and either the user advisory or its withheld state.
Inputs and limitations are expandable. Editing inputs clears previous results.

## Preprocessing dependency

Raw daily history cannot reliably produce these 40 inputs yet. The original
training feature formulas, normalization statistics, units and target horizon are
still needed, especially for `price_norm`, `arrival_norm` and
`month_norm_in_veg`. Weather, arrivals and cross-crop production inputs must also
be supplied. Prepared features can already be submitted through the UI or API.

## Verification

Run `python api/ai/mandi-forecast.selfcheck.py` for actual-weight inference,
feature/schema validation, mocked Groq orchestration, feature citations and
advisory gating. These checks do not evaluate predictive accuracy or call the
live provider. Browser checks use synthetic fixtures to exercise UI states.

The previous preset sale-window recommendation is removed from the active market
overview so it cannot bypass the reviewed advisory.

## Once-daily CEDA updates

All calls through `fetchCedaApi` now use `cedaDailyCache.js`. Each distinct endpoint,
method and filter set is fetched at most once per India calendar day, on first use.
Subsequent requests reuse its snapshot. Empty successful results are cached too.
Concurrent requests share one fetch; failed or interrupted refreshes are not
retried automatically that day. Query key ordering does not create extra fetches.
This is an on-demand daily refresh, not a background scheduler.

Local snapshots persist under ignored `artifacts/ceda-cache/` across restarts.
On Vercel, shared MongoDB collection `ceda_daily_snapshots` provides atomic refresh
claims across instances. Production requires a reachable `MONGO_URI` and fails
closed if durable cache storage is unavailable, preventing uncontrolled API use.
Run `node api/_utils/cedaDailyCache.selfcheck.js`; it makes no external API calls.

Live-data attempt: CEDA returned HTTP 200 and "No data exists" for Tomato (78),
Rajasthan (8), November 1-14, 2026. That empty response is cached for the day. No
model prediction or LLM advisory was produced from empty or fabricated data.
