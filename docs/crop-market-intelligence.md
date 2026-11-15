# Crop market intelligence

The farmer Market intelligence overview supports Wheat, Rice, Potato, Tomato,
Onion, Mustard, Cotton, Apple and Chickpea (CEDA Bengal Gram Whole). The shared
catalog in `shared/marketCrops.js` maps each crop to its CEDA commodity ID.
Quotes are commodity-level, not variety-specific.

Choose a crop and state and enter transport and total storage costs per kg.
Load market evidence to read observed mandi history, the recent median,
quartiles less the supplied costs, same-month prior-year prices when present,
and actual open regional buyer demand. Historical movement is descriptive,
not a forecast. Empty or stale observations withhold price guidance.

The authenticated POST `/api/ai/intelligence/market` accepts `cropId`, `state`,
`stateId`, `transportCostPerKg`, and `storageCostPerKg`. Optional
`shelfLifeDays` and `holdingPeriodDays` support holding advice. Set `review:true`
to request an evidence-grounded Groq Qwen review. Reasons must cite supplied
evidence IDs. Holding advice is withheld when the holding period is unknown or
exceeds remaining shelf life. Provider failure leaves observed evidence usable.

CEDA snapshots reuse the existing persistent daily cache per endpoint and
filters, refreshing on first use once per India calendar day. Failed and empty
refreshes are cached too. Opening the overview does not fetch CEDA; loading
evidence requires an explicit action. Qwen review reuses that daily snapshot.

The supplied LightGBM weights still cover only Tomato, Potato and Onion. Their
prepared-feature prediction remains an advanced option. The other crops use
observed market intelligence and Qwen advice, not an untrained LightGBM model.

Verification without provider requests:

```sh
node api/_utils/cropMarketIntelligence.selfcheck.js
node api/_utils/producePricing.selfcheck.js
node api/_utils/cedaDailyCache.selfcheck.js
node api/ai/intelligence.selfcheck.js
```
