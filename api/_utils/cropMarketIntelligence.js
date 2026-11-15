import { MARKET_CROPS, CEDA_STATES } from '../../shared/marketCrops.js';
import { producePriceRecommendation } from './producePricing.js';
import { reviewMarketEvidence } from '../_handlers/market-advisor.js';

export function validateMarketRequest(body) {
  const cropId = String(body.cropId || '').toUpperCase();
  if (!Object.hasOwn(MARKET_CROPS, cropId) || CEDA_STATES[body.state] !== body.stateId) throw new Error('Choose a listed crop and matching state.');
  for (const key of ['transportCostPerKg', 'storageCostPerKg']) if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < 0) throw new Error('Enter non-negative transport and storage costs per kg.');
  for (const key of ['shelfLifeDays', 'holdingPeriodDays']) if (body[key] !== undefined && (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < 0)) throw new Error('Shelf life and holding days must be non-negative numbers.');
  return cropId;
}

export function buildMarketEvidence(market) {
  return [
    { id: 'mandi', type: 'observed_price', label: 'Observed mandi median', value: { pricePerKg: market.mandiMedian, latestDate: market.latestDate, records: market.observations, commodity: market.sourceCommodity }, source: 'CEDA Agmarknet daily snapshot' },
    { id: 'trend', type: 'historical_trend', label: 'Observed historical direction', value: market.observedTrend, source: 'Dated daily price averages from the same snapshot' },
    { id: 'costs', type: 'net_reference', label: 'Cost-adjusted reference', value: { farmGateRange: market.farmGateRange, transportCostPerKg: market.transportCostPerKg, storageCostPerKg: market.storageCostPerKg }, source: 'Observed quartiles less user-supplied costs; INR/kg' },
    { id: 'demand', type: 'buyer_demand', label: 'Recorded regional buyer demand', value: market.demand, source: 'AgriTrace open buyer demands' },
    { id: 'season', type: 'historical_seasonality', label: 'Same-month prior-year prices', value: market.seasonalReference, source: 'CEDA history; null means unavailable' }
  ];
}

export async function getCropMarketIntelligence(body, ownerId, dependencies) {
  const cropId = validateMarketRequest(body);
  const market = await producePriceRecommendation({ cropId, state: body.state, stateId: body.stateId, transportCostPerKg: body.transportCostPerKg, storageCostPerKg: body.storageCostPerKg, ownerId }, dependencies);
  const response = { ...market, method: 'OBSERVED_MARKET_HISTORY', advisory: null, reviewStatus: 'NOT_REQUESTED' };
  if (body.review !== true) return response;
  if (market.status !== 'READY') return { ...response, reviewStatus: 'INSUFFICIENT_DATA' };
  const evidence = buildMarketEvidence(market);
  try {
    const advisory = await reviewMarketEvidence({ cropId, state: body.state, shelfLifeDays: body.shelfLifeDays, holdingPeriodDays: body.holdingPeriodDays,
      instructions: 'Only observed history is supplied, not a trained prediction for this crop. Never claim these trends predict the future or were produced by LightGBM. Do not invent quality premiums, demand multipliers or seasonal forecasts. Treat the reference as indicative. Recommend HOLD only if remaining shelf life, intended holding period and both costs are known, and holding does not exceed shelf life.' }, evidence);
    if (advisory.recommendation === 'HOLD' && (body.shelfLifeDays === undefined || body.holdingPeriodDays === undefined || body.holdingPeriodDays > body.shelfLifeDays)) return { ...response, evidence, reviewStatus: 'REVIEW_REQUIRED', reviewReason: 'Holding advice requires a holding period within the remaining shelf life.' };
    return { ...response, evidence, reviewModel: 'qwen/qwen3.8-27b', reviewStatus: advisory.recommendation === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'READY', advisory };
  } catch { return { ...response, reviewStatus: 'UNAVAILABLE', reviewReason: 'Qwen could not complete the review. The observed market evidence is still available.' }; }
}
