# PRD 1: AI quality, price and demand intelligence

**Owner:** Teammate 1 (AI/ML)  
**Priority:** P0  
**Goal:** Deliver honest, measurable AI capabilities for produce quality and regional market intelligence, with explanations the farmer and buyer can inspect.

## Problem

Farmers lack objective quality evidence and timely, local information about likely prices and buyer demand. The current code has a packaged mandi price model, but no regional demand model or image grader; some recommendations are generated from fixed seeded scenarios. This work replaces unsupported claims with data-backed outputs and clear uncertainty.

## User outcome

A farmer can upload suitable crop images and receive a provisional grade with visible evidence and confidence. They can also see a regional demand outlook and a selling-price range whose main contributing signals and data freshness are explained.

## Scope

### In scope

- One image-grade model for a crop chosen by the team based on available labelled images.
- A model adapter that accepts stored image references and returns grade, detected attributes/defects, confidence, model version and warnings.
- Regional demand forecast for a bounded crop/region/horizon using historical buyer demand and transaction/mandi arrival data.
- Price recommendation that combines historic mandi prices, available demand forecast, season, quality grade and supplied transport/storage costs.
- Explainability fields, freshness, uncertainty and model/data version fields.
- A baseline or fallback based on transparent calculations that is explicitly labelled `heuristic`, never labelled AI/model output.
- Evaluation notes and a small repeatable offline evaluation command/notebook only if an existing runtime supports it without adding unnecessary infrastructure.

### Out of scope

- Building a general-purpose model for every crop.
- Direct browser calls to model providers.
- Automatic final certification or automatic change to verified quality.
- Autonomous purchasing, price setting or trade acceptance.
- Adding external paid services before the team selects one and configures it.

## Shared contracts

Teammate 2 owns endpoint validation and persistence. This teammate owns inference/forecast functions and must implement to these stable JSON shapes.

### Quality assessment result

```json
{
  "status": "READY | REVIEW_REQUIRED | UNAVAILABLE",
  "cropId": "TOMATO",
  "grade": "A | B | C | UNDETERMINED",
  "confidence": 0.0,
  "attributes": [{"name": "visible_damage", "value": "low", "confidence": 0.0}],
  "evidence": [{"label": "surface_damage", "imageIndex": 0, "region": null}],
  "warnings": [],
  "modelVersion": "string",
  "assessedAt": "ISO-8601"
}
```

Confidence thresholds belong in server configuration, not copied into UI logic. If the model cannot support the requested crop or image quality, return `REVIEW_REQUIRED` or `UNAVAILABLE`; do not guess a grade.

### Demand forecast result

```json
{
  "cropId": "TOMATO",
  "region": {"district": "...", "state": "..."},
  "horizonDays": 7,
  "expectedDemandQuantity": 0,
  "unit": "kg",
  "changePercent": null,
  "pricePressure": "UP | STABLE | DOWN | UNKNOWN",
  "interval": {"lower": null, "upper": null},
  "confidence": 0.0,
  "drivers": [{"name": "active_buyer_demand", "effect": "UP", "contribution": null}],
  "sourceFreshness": [{"source": "...", "asOf": "ISO-8601"}],
  "modelVersion": "string",
  "generatedAt": "ISO-8601"
}
```

### Price recommendation result

```json
{
  "cropId": "TOMATO",
  "region": {"district": "...", "state": "..."},
  "priceRange": {"low": 0, "high": 0, "unit": "INR/kg"},
  "expectedNetPerUnit": null,
  "recommendation": "SELL | WAIT | COMPARE | INSUFFICIENT_DATA",
  "horizonDays": 7,
  "confidence": 0.0,
  "method": "MODEL | HEURISTIC | INSUFFICIENT_DATA",
  "drivers": [{"name": "quality_grade", "effect": "UP", "explanation": "..."}],
  "sourceFreshness": [{"source": "...", "asOf": "ISO-8601"}],
  "modelVersion": "string",
  "generatedAt": "ISO-8601"
}
```

Numeric values must use a consistent unit and currency. `expectedNetPerUnit` may be null when transport/storage estimates are missing. `confidence` must be bounded 0–1 and calibrated or documented; do not convert arbitrary model scores into confidence.

## Functional requirements

1. Accept only image references returned by the upload layer; validate crop identity and image availability before inference.
2. Return a useful warning for unsupported crop, blurry/occluded image, stale data, insufficient history or model failure.
3. Never replace inspector-entered grade with AI output. Store the AI result as a separate assessment.
4. The demand model must state its region, horizon, units and dataset freshness.
5. The price recommendation must consume real forecast/data inputs. Remove the seeded-string logic from the live recommendation path; preserve the old function only if needed by legacy screens and label it demo-only.
6. Explanations must be derived from actual input features or an explicit rules breakdown, not generated from invented facts.
7. Where insufficient data exists, return `INSUFFICIENT_DATA` rather than a fabricated number.

## Acceptance criteria

- A supported crop/image request returns grade, evidence, confidence, model version and assessed time.
- An unsupported crop or poor-quality image returns a review/unavailable status, not a false grade.
- AI quality is stored separately from a verified inspector result.
- Demand forecast returns regional horizon, demand estimate, uncertainty, drivers and freshness, or an explicit insufficient-data response.
- Price recommendations use actual supplied market/demand/quality/logistics values and list their key drivers.
- The endpoint and UI can distinguish model output from heuristic/demo output.
- Model quality is reported with a simple held-out metric appropriate to the task; dataset limitations are recorded alongside it.

## Ownership and files

Own: `api/ai/**`, new AI-specific service code under `src/services/market/` only if the UI needs a typed client (coordinate with UI owner first), model metadata and an AI evaluation doc under `docs/ai/`.

Do not own: `api/_models/**`, business route handlers, `src/pages/**`, `src/context/GlobalStateContext.jsx`. Send required persisted fields to Teammate 2 and response/UI needs to Teammate 3 before broad implementation.

## Dependencies and integration

- Teammate 2 creates endpoint stubs/contracts for quality assessment, demand forecast and price recommendation.
- Teammate 2 supplies historical records and image references; Teammate 1 must return an explicit data-insufficient outcome until they exist.
- Teammate 3 consumes the response shapes above and renders status, drivers, freshness and uncertainty.

