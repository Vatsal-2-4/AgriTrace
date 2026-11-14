# PS 4.2 teammate PRDs

These three PRDs divide the agricultural marketplace work so three teammates can work in parallel. They describe the target PS 4.2 product, not a claim that the current application already implements every capability.

## Ownership and integration order

| PRD | Owner | Owns | Consumes |
|---|---|---|---|
| [AI and intelligence](01-ai-intelligence.md) | Teammate 1 | `api/ai/**`, forecasting/quality model adapters, AI-specific data contracts, evaluation notes | Stable request/response schemas defined in PRD 2 |
| [Backend and domain](02-backend-domain.md) | Teammate 2 | `api/_models/**`, `api/**` business handlers, `server/handlers/**`, persistence and server validation | AI service contracts from PRD 1; no UI ownership |
| [UI and marketplace](03-ui-marketplace.md) | Teammate 3 | `src/**` product screens, navigation, form and presentation logic | API contracts from PRD 2; AI result shapes from PRD 1 |

The interface contracts below are the shared seam. Teammate 2 should create the schemas and endpoint stubs first, then tell the other two that they are stable. This is a short coordination handoff, not a blocker: each teammate can begin their own pure service/UI work immediately against the documented shapes.

## Repo facts everyone should know

- The app is React/Vite with Vercel-style request handlers and MongoDB/Mongoose.
- The existing marketplace mixes crop and wool concepts. Preserve old wool records while adding crop-neutral fields; avoid destructive renames or migrations that discard existing data.
- `src/context/GlobalStateContext.jsx` is a large, shared state module. Keep new market calculations and API calls out of it where practical; update it only for wiring existing screens to new endpoints.
- `src/services/market/matchingEngine.js` has a rule-based, explainable score; `marketIntelligenceService.js` contains net-realization logic; `mandiForecastService.js` calls the current price model.
- `api/ai/mandi-forecast.py` loads the packaged mandi model and expects at least 31 observations. It is a price forecast, not a regional demand forecast.
- `priceforecastService.js` currently synthesizes seeded recommendation inputs and must not be presented as a model-backed forecast.
- Existing quality is wool-inspector entered; lot images are only URL strings. Image-based produce grading is new work.
- `api/market-records` stores generic records and is not sufficient as the long-term integrity boundary for bids, assessments or recommendations.

## Parallel-work rules

1. Do not edit another owner's files. Changes that cross ownership should be expressed as a short interface note or coordinated before implementation.
2. Use `cropId`/`cropName` as the new domain vocabulary. Keep legacy `woolType` readable for existing data while the UI migrates.
3. AI output is provisional evidence. It must never overwrite a human-verified grade or silently fabricate fallback prices, demand or confidence.
4. Keep AI calculations server-side. Never expose provider credentials or model files through browser environment variables.
5. Every response that gives a price, forecast or match needs source/freshness and uncertainty fields, even if the MVP marks them unavailable.
6. For the demo, scope computer vision to one selected crop and one region unless the team supplies suitable evaluation data for more.

