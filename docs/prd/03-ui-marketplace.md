# PRD 3: Farmer and buyer marketplace experience

**Owner:** Teammate 3 (UI)  
**Priority:** P0  
**Goal:** Give farmers and buyers a clear, crop-first marketplace that makes quality evidence, price information, matches and bulk bids understandable and actionable.

## Problem

Current screens expose crop choices, but still show wool-specific labels and depend on browser shared state. The farmer can see price comparisons and buyer information, while the buyer can publish demand and make offers; neither flow presents a real image assessment or a trustworthy demand/price forecast yet.

## User outcome

A farmer can create a produce lot, submit photos, understand its provisional/verified grade, compare net price outcomes and choose buyers or bids. A retailer, wholesaler or processor can state their demand and find suitable lots with clear match explanations.

## Scope

### In scope

- Farmer lot creation and detail for crop, variety, quantity/unit, harvest date, location and image references.
- Image upload/capture UI, preview, removal, upload progress and clear retry/error states.
- Quality result display: provisional grade, confidence, evidence/attributes, warnings, model version/time and inspector verification state.
- Price discovery screen: mandi references, price range, net realization, transport/storage deductions, source freshness, confidence and recommendation drivers.
- Farmer view of ranked buyer demands and match explanations.
- Buyer organization profile type and demand creation.
- Buyer view of matching crop lots, minimum grade, available quantity and delivery location.
- Bulk bid or offer form with quantity, unit, price, total, close time and current status.
- Accessible responsive layouts, empty/loading/error/offline states.
- Remove wool-only wording from changed crop flows while leaving unrelated legacy screens intact.

### Out of scope

- Implementing API persistence, matching algorithms or model inference.
- Putting provider/model credentials in frontend code.
- Promising an AI grade or forecast where API says review required/insufficient data.
- Redesigning the entire app or replacing role/auth foundations.

## Screens and user journeys

### Farmer

1. Open My Produce/Market and create a crop lot.
2. Add crop photos with capture guidance for the supported crop.
3. See assessment state: `Uploading`, `Assessing`, `Review required`, `Provisional grade`, `Verified grade`, or `Unavailable`.
4. Open Price Intelligence and see mandi reference, recommended range, estimated net per unit, demand trend, confidence and source timestamps.
5. Review matches; open a match explanation showing what aligned and what did not (crop, grade, quantity, location, price, delivery).
6. Submit or respond to a bulk bid; see partial/full quantity and updated available amount.

### Buyer

1. Select organization type: retailer, wholesaler or food processor.
2. Publish demand for crop/variety, quantity/unit, minimum grade, budget and delivery location/date.
3. Review matched lots and quality evidence.
4. Bid for all or part of a lot and see the calculated total and closing time.
5. Track offer/bid outcome and resulting transaction.

## API assumptions

Consume the resource endpoints and response envelopes in [PRD 2](02-backend-domain.md) and the AI schemas in [PRD 1](01-ai-intelligence.md). If backend routes are not ready, build typed adapter functions and local mock fixtures matching those shapes; never shape the product components around the old generic `MarketRecord` envelope.

UI needs the following fields to render without hidden assumptions:

- Lot: crop, variety, unit, total/available quantity, location, photo references, provisional and verified grade separately.
- Quality: status, grade, confidence, attributes/evidence, warnings, model version and time.
- Forecast/recommendation: price range, action, confidence, horizon, method, drivers and source timestamps.
- Match: score plus named component breakdown and warnings.
- Bid: unit price, quantity/unit, server total, close time and status.

## UX and accessibility requirements

- Never show a grade without labelling whether it is provisional AI output or inspector verified.
- Show confidence as a percentage only when supplied by the backend and calibrated; pair it with plain-language uncertainty.
- Explain unit conversion explicitly; never mix ₹/kg with ₹/quintal in the same display without conversion labels.
- Show the timestamp/source beside market references; distinguish stale data from live/current data.
- Keep the recommendation secondary to the evidence; the farmer must be able to compare options and choose.
- Forms use labels, keyboard-operable controls, visible focus and field-level validation.
- Mobile layout supports taking/uploading photos and reading key price/bid information without horizontal scrolling.

## Acceptance criteria

- Farmer can create/edit a crop lot using crop-neutral fields and see upload progress/errors.
- AI states are rendered faithfully; review required and insufficient-data states do not resemble a successful grade/recommendation.
- Farmer sees price range, net costs, source freshness, confidence and readable drivers.
- A match card shows the main score breakdown, including warning factors, not only a percentage.
- Buyer can publish demand and bid for partial quantity with visible unit and calculated total.
- Existing navigation/auth roles remain intact; no new role required for retailer/wholesaler/processor.
- Empty, loading, API failure and offline states exist for marketplace and intelligence views.
- UI components consume adapters/contracts and avoid adding product logic to `GlobalStateContext.jsx`.

## Ownership and integration

Own: `src/pages/**`, relevant `src/components/**`, and minimal API clients under `src/services/market/` (coordinate a file before creating one that overlaps existing adapters). Avoid editing `api/**` or AI model code.

Candidate existing screens to reuse: `src/pages/farmer/Market.jsx`, `src/pages/farmer/market_tabs/PriceDiscoveryTab.jsx`, `BuyerDiscoveryTab.jsx`, `src/pages/buyer/BuyerWorkspace.jsx`, and `src/pages/seller/Bids.jsx`. Replace or adapt, rather than duplicate, where practical.

## Integration sequence

Start with adapters/types and mock fixtures from the contracts. Wire API when Teammate 2 lands stubs. Integrate model results when Teammate 1 provides the quality/forecast responses. Keep any mock indicator visible so demo data cannot be mistaken for live market or AI output.

