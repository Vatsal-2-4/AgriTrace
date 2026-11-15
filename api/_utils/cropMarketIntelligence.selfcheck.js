import assert from 'node:assert/strict';
import { MARKET_CROPS } from '../../shared/marketCrops.js';
import { COMMODITIES } from '../../src/services/market/cropCommodityRegistry.js';
import { getCropMarketIntelligence, validateMarketRequest } from './cropMarketIntelligence.js';
import { summarizePrices } from './producePricing.js';
import BuyerDemand from '../_models/BuyerDemand.js';
import MarketIntelligence from '../_models/MarketIntelligence.js';

assert.deepEqual(Object.keys(MARKET_CROPS).sort(), COMMODITIES.filter(crop => crop.category !== 'FIBER').map(crop => crop.id).sort());
const base = { state: 'Karnataka', stateId: 29, transportCostPerKg: 2, storageCostPerKg: 1 };
for (const body of [{ ...base, cropId: 'UNKNOWN' }, { ...base, cropId: 'WHEAT', stateId: 8 }, { ...base, cropId: 'WHEAT', storageCostPerKg: -1 }]) assert.throws(() => validateMarketRequest(body));
const oldAssessmentFind = MarketIntelligence.find, oldDemandFind = BuyerDemand.find, oldFetch = global.fetch, oldKey = process.env.GROQ_API_KEY;
MarketIntelligence.find = () => ({ lean: async () => [] });
BuyerDemand.find = () => ({ select: () => ({ lean: async () => [{ quantity: 500 }] }) });
let calls = 0;
const today = new Date();
const day = offset => new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);
try {
  for (const [cropId, crop] of Object.entries(MARKET_CROPS)) {
    const result = await getCropMarketIntelligence({ ...base, cropId }, 'test-only', { fetchPrices: async (endpoint, options) => {
      calls++; assert.equal(endpoint, '/prices'); assert.equal(options.body.commodity_id, crop.commodityId);
      return { output: { data: [{ date: day(2), modal_price: 2000 }, { date: day(1), modal_price: 3000 }] } };
    } });
    assert.equal(result.cropId, cropId); assert.equal(result.status, 'READY'); assert.equal(result.trainedForecastAvailable, !!crop.lightgbm);
    assert.deepEqual(result.farmGateRange, { low: 17, high: 17 });
    assert.equal(result.priceHistory.length, 2); assert.equal(result.observedTrend.direction, 'UP');
    assert.equal(result.advisory, null); assert.equal(result.demand.quantityKg, 500);
  }
  assert.equal(calls, 9);
  const oneDay = summarizePrices([{ date: day(1), modal_price: 2000 }, { date: day(1), modal_price: 4000 }], 0);
  assert.equal(oneDay.priceHistory.length, 1); assert.equal(oneDay.observedTrend.direction, 'INSUFFICIENT_DATA');
  process.env.GROQ_API_KEY = 'selfcheck-not-a-real-key';
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ recommendation: 'HOLD', confidence: 'LOW', summary: 'Test only', suggestedAction: 'Test only', reasons: [{ text: 'Test evidence', evidenceIds: ['mandi'] }], limitations: [] }) } }] }) });
  const fetchPrices = async () => ({ output: { data: [{ date: day(2), modal_price: 2000 }, { date: day(1), modal_price: 3000 }] } });
  const gated = await getCropMarketIntelligence({ ...base, cropId: 'WHEAT', review: true }, 'test-only', { fetchPrices });
  assert.equal(gated.reviewStatus, 'REVIEW_REQUIRED'); assert.equal(gated.advisory, null);
  global.fetch = async () => { throw new Error('Provider unavailable'); };
  const unavailable = await getCropMarketIntelligence({ ...base, cropId: 'APPLE', review: true }, 'test-only', { fetchPrices });
  assert.equal(unavailable.status, 'READY'); assert.equal(unavailable.reviewStatus, 'UNAVAILABLE');
  const empty = await getCropMarketIntelligence({ ...base, cropId: 'COTTON', review: true }, 'test-only', { fetchPrices: async () => ({ output: { data: [] } }) });
  assert.equal(empty.reviewStatus, 'INSUFFICIENT_DATA'); assert.equal(empty.farmGateRange, null);
  console.log('PASS: all nine crop mappings, costs, actual demand, daily aggregation, empty data, model scope, hold gating, and provider failure. No external requests or daily cache writes.');
} finally {
  MarketIntelligence.find = oldAssessmentFind; BuyerDemand.find = oldDemandFind; global.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey;
}
