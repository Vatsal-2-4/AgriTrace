# Marketplace API v1

The crop neutral marketplace APIs use `api/_models/ProduceLot.js`, `BuyerDemand.js`, `BulkBid.js`, and `MarketIntelligence.js`. Wool data remains in `WoolBatch`; lot search adapts legacy wool records to the new read shape when `cropId=WOOL`.

All new endpoints return `{ "success": true, "data": ..., "meta": { "version": "v1" } }` or `{ "success": false, "error": { "code": "...", "message": "..." }, "meta": { "version": "v1" } }`. Mutations require the bearer token returned by `POST /api/login`. Tokens expire after 12 hours. Set the server-side `JWT_SECRET`; the server falls back to `MONGO_URI` when it is not set.

## Lots and demand

- `GET /api/market/lots?cropId=WHEAT&state=Karnataka&district=Mysuru&grade=A&minQuantity=100&page=1&limit=20`
- `POST /api/market/lots` creates a lot for the authenticated seller. Required fields: `cropId`, `cropName`, positive `quantity`, supported `unit` (`kg`, `g`, `tonne`, `quintal`, `piece`, `crate`, `bag`), and `location.district` / `location.state`. Optional image references must be `storage://` references from an approved storage flow (maximum 20). `sellerId` and `sellerType` are taken from the token.
- `GET /api/market/demands?cropId=WHEAT&state=Karnataka&status=OPEN&page=1&limit=20`
- `POST /api/market/demands` creates demand for the authenticated buyer organization. Required fields: `cropId`, positive `quantity`, `unit`, non-negative `maxPrice`, `priceUnit`, `deliveryLocation.district`, `deliveryLocation.state`, and future `deliveryBy`. The buyer's `organizationType` (`retailer`, `wholesaler`, `processor`, or `other`) comes from the profile.

Both list endpoints return `{ items, pagination: { page, limit, total, pages } }` inside `data`.

## Matching, bids, and quality

- `GET /api/market/lots/:id/matches` returns ranked buyer demand with score breakdown and evidence warnings.
- `POST /api/market/lots/:id/bids` accepts `pricePerUnit`, `quantity`, `unit`, and optional `message`. The server reserves quantity atomically, checks lot owner and closing time, and calculates `totalAmount`.
- `PATCH /api/market/lots/:id/bids/:bidId` lets the authenticated seller accept or reject a pending bid. An accepted bid may provide `fulfilledQuantity` to accept a smaller quantity; the server recalculates the fulfilled total and returns the unused quantity to the lot.
- `POST /api/market/quality-assessments` accepts `lotId`, `cropId`, and approved `imageRefs[]`; it persists a `PENDING_INFERENCE` assessment with explicit insufficient-data status.
- `GET /api/market/quality-assessments/:id` returns AI evidence and inspector verification separately.
- `PATCH /api/market/quality-assessments/:id/verification` accepts `verifiedGrade` and optional `notes`; only an authenticated quality inspector can call it. Each verification is recorded with inspector ID and time.

The app has no image upload endpoint yet. Clients must pass storage references issued by the separately configured upload integration; arbitrary public URLs are rejected.

## Market intelligence

- `POST /api/market/price-observations` persists a validated observation. It is restricted to a server-provisioned `MARKET_ADMIN` account.
- `GET /api/market/demand-forecast?cropId=WHEAT&district=Mysuru&state=Karnataka&horizonDays=30`
- `GET /api/market/price-recommendation?cropId=WHEAT&district=Mysuru&state=Karnataka&grade=A&quantity=500`

Forecast and recommendation responses persist model version, evidence, source freshness, uncertainty, and status. They report `INSUFFICIENT_DATA` until an inference provider supplies a result; this backend does not train or run models.

Existing CEDA routes, `/api/market-records`, `/api/bidding`, `/api/qa`, and wool batch records remain present during migration. Writes to legacy lot and demand market records now require a bearer token and are scoped to the authenticated owner.
