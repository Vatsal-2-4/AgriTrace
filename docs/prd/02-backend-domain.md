# PRD 2: Crop marketplace backend and domain

**Owner:** Teammate 2 (backend)  
**Priority:** P0  
**Goal:** Provide a durable, validated, crop-neutral backend that supports lots, buyer demand, quality evidence, matching, bidding and market intelligence without breaking existing wool records.

## Problem

The app has useful market concepts, but much of the shared lot/demand/offer state is represented as generic market records and is coordinated in browser state. Data fields and APIs retain wool-specific assumptions. AI needs persistent, auditable inputs and the UI needs stable contracts it can use independently.

## User outcome

Farmers, FPOs, retailers, wholesalers and processors can use durable marketplace records and see consistent lot, quality, demand, bid and recommendation state across sessions and devices.

## Scope

### In scope

- Crop-neutral lot and buyer-demand fields with backward-compatible wool reads.
- Explicit validated persistence for quality assessments, price observations, demand forecasts and price recommendations.
- Buyer organization type/profile fields for retailer, wholesaler, processor and other.
- API contracts for image reference upload integration, quality assessment, demand and price forecasts.
- Server-side authorization/ownership validation for listing, demand and bidding mutations.
- Bulk bid quantity, partial fulfilment, closing time and server-calculated totals.
- Versioned response envelope and consistent errors.
- Preserve existing routes and data during the transition; no destructive rename/drop.

### Out of scope

- Training/inference implementation (Teammate 1).
- React screen implementation (Teammate 3).
- Real payment settlement or escrow provider.
- Nationwide data ingestion platform; expose the seams needed for a later scheduler.

## Domain model

Add crop-neutral fields to the existing lot/batch model or introduce a new `ProduceLot` model after checking call sites. Do not rename/delete `WoolBatch` while legacy flows use it.

### Lot

`id`, `sellerId`, `sellerType`, `cropId`, `cropName`, `variety`, `quantity`, `availableQuantity`, `unit`, `harvestedAt`, `origin`, `location {lat,lng,district,state}`, `imageRefs[]`, `askingPrice`, `priceUnit`, `qualityAssessmentId`, `verifiedGrade`, `status`, `createdAt`, `updatedAt`.

Maintain compatibility: read `woolType` when `cropId`/`cropName` are absent. New writes use crop-neutral fields. Do not assume `verified: true` when evidence does not exist.

### Buyer demand

`buyerId`, `organizationType`, `cropId`, `variety`, `quantity`, `unit`, `minimumGrade`, `maxPrice`, `priceUnit`, `deliveryLocation`, `deliveryBy`, `status`, timestamps.

### AI and market records

Persist the shapes in [PRD 1](01-ai-intelligence.md), with `lotId`/region/crop indexes, `modelVersion`, `sourceFreshness`, and immutable creation time. An AI assessment and an inspector-verified grade are separate fields/records.

### Bids

`listingId`, `buyerId`, `pricePerUnit`, `quantity`, `unit`, `status`, `createdAt`. Enforce positive finite price and quantity, available quantity limits, end-time checks, and server-calculated totals. Never trust a client-supplied total or buyer/seller identity.

## API contract

Use `/api/market/...` naming consistent with current handlers. All requests return `{success:true,data:...}` or `{success:false,error:{code,message,details?}}`. Teammate 1 owns model/inference functions; Teammate 2 owns request validation, persistence, authorization and response envelope.

| Method/path | Purpose | Contract summary |
|---|---|---|
| `GET /api/market/lots` | Search lots | Query by crop, region, grade, quantity and status; paginated results |
| `POST /api/market/lots` | Create lot | Authenticated seller; crop, quantity/unit, location and optional image references |
| `GET /api/market/demands` | Find buyer demand | Filter by crop, region and open status |
| `POST /api/market/demands` | Publish buyer demand | Authenticated buyer organization; validate quantity, max price and delivery data |
| `GET /api/market/lots/:id/matches` | Explain matching | Ranked demand/buyer matches with score breakdown and warnings |
| `POST /api/market/lots/:id/bids` | Place bulk bid | Authenticated buyer; price, quantity and optional message |
| `POST /api/market/quality-assessments` | Request AI assessment | `lotId`, `cropId`, `imageRefs[]`; returns persisted assessment status/result |
| `GET /api/market/quality-assessments/:id` | Read assessment | Returns AI evidence and separate inspector verification if present |
| `GET /api/market/demand-forecast` | Read regional demand | `cropId`, district/state, `horizonDays` |
| `GET /api/market/price-recommendation` | Read price recommendation | `cropId`, region, grade, quantity, optional location/transport inputs |

If route count needs to stay small for Vercel, keep a dispatcher but preserve these resource paths and validation semantics. Do not replace existing `/api/bidding`, `/api/qa`, `/api/market-records` handlers in one breaking change; adapt them or add the new routes and migrate callers incrementally.

## Security and integrity requirements

- Validate all untrusted body/query fields; cap pagination and image count/size at the upload boundary.
- Verify seller owns lot; buyer owns demand/bid; inspector role is required to verify grade.
- Keep AI credentials and storage credentials server-side.
- Do not accept a public image URL blindly; allow only storage references issued by the upload flow.
- Use atomic updates for available quantity and bid/listing state to avoid overselling or concurrent bid corruption.
- Record who changed a grade/status and when.
- Public certificate endpoints expose only intended lot/grade evidence, never private user contact details.

## Acceptance criteria

- Existing wool records remain readable and current wool routes continue to work.
- New crop lots and buyer demands survive reload and can be queried by relevant filters.
- Invalid units, negative amounts, oversized requests, unauthorized mutations and bids after close are rejected consistently.
- Server calculates bid totals and prevents quantity over-allocation.
- AI results and human verification persist independently with model/evaluator metadata.
- Forecast/recommendation endpoints expose explicit freshness, uncertainty and insufficient-data status.
- UI owner can integrate against stable JSON without importing `GlobalStateContext` business rules.

## Ownership and integration

Own: `api/_models/**`, `api/*.js` business handlers, `server/handlers/**`, `api/_utils/**` when needed for validation. Do not edit `src/**` or model internals in `api/ai/**`.

Publish the endpoint stubs and schema names early. AI owner calls the adapter functions from its existing files; UI owner uses the contracts here and in PRD 1. Keep one short contract update in this PRD if a shape changes, and inform both teammates before landing the change.

