import { fetchCedaApi } from './ceda.js';
import BuyerDemand from '../_models/BuyerDemand.js';
import MarketIntelligence from '../_models/MarketIntelligence.js';
import { MARKET_CROPS, CEDA_STATES } from '../../shared/marketCrops.js';

export function summarizePrices(rows, transportCostPerKg, today = new Date()) {
  const dated = rows.map(row => ({ date: row.date, price: Number(row.modal_price), min: Number(row.min_price), max: Number(row.max_price) }))
    .filter(row => row.date && Number.isFinite(Date.parse(row.date)) && Number.isFinite(row.price) && row.price > 0 && Date.parse(row.date) <= today.getTime()).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!dated.length) return { status: 'INSUFFICIENT_DATA', reason: 'CEDA returned no usable observed mandi prices.', farmGateRange: null };
  const latest = dated.at(-1);
  if (today.getTime() - Date.parse(latest.date) > 14 * 86400000) return { status: 'STALE_DATA', latestDate: latest.date, farmGateRange: null, reason: 'Latest mandi price is older than 14 days.' };
  const recent = dated.filter(row => Date.parse(latest.date) - Date.parse(row.date) <= 30 * 86400000);
  const prices = recent.map(row => row.price / 100).sort((a, b) => a - b);
  const quantile = fraction => prices[Math.floor((prices.length - 1) * fraction)];
  const reference = quantile(0.5);
  const month = new Date(latest.date).getUTCMonth();
  const seasonal = dated.filter(row => new Date(row.date).getUTCMonth() === month && new Date(row.date).getUTCFullYear() === new Date(latest.date).getUTCFullYear() - 1);
  const seasonalAverage = seasonal.length ? seasonal.reduce((sum, row) => sum + row.price / 100, 0) / seasonal.length : null;
  const days = new Map();
  for (const row of recent) { const date = new Date(row.date).toISOString().slice(0, 10); const values = days.get(date) || []; values.push(row.price / 100); days.set(date, values); }
  const priceHistory = [...days].map(([date, prices]) => ({ date, price: Number((prices.reduce((sum, value) => sum + value, 0) / prices.length).toFixed(2)), observations: prices.length }));
  const split = Math.floor(priceHistory.length / 2);
  const average = rows => rows.reduce((sum, row) => sum + row.price, 0) / rows.length;
  const changePercent = split ? Number(((average(priceHistory.slice(split)) / average(priceHistory.slice(0, split)) - 1) * 100).toFixed(2)) : null;
  return { status: 'READY', source: 'CEDA Agmarknet', units: 'INR/kg', latestDate: latest.date, observations: recent.length,
    priceHistory, observedTrend: { changePercent, direction: changePercent === null ? 'INSUFFICIENT_DATA' : changePercent > 1 ? 'UP' : changePercent < -1 ? 'DOWN' : 'STABLE', meaning: 'Observed recent versus earlier daily averages; not a future-price forecast.' },
    mandiMedian: reference, transportCostPerKg,
    farmGateRange: { low: Math.max(0, quantile(0.25) - transportCostPerKg), high: Math.max(0, quantile(0.75) - transportCostPerKg) },
    seasonalReference: seasonalAverage === null ? null : { sameMonthPriorYearAverage: seasonalAverage, observationCount: seasonal.length },
    limitations: ['Indicative farm-gate range from observed mandi quartiles minus supplied transport cost; not a guaranteed sale price.', 'No automatic quality premium: commercial grade and quality premiums require verified evidence.'] };
}

export async function producePriceRecommendation({ cropId, stateId, state, transportCostPerKg, storageCostPerKg = 0, assessmentIds = [], ownerId }, { fetchPrices = fetchCedaApi } = {}) {
  const crop = Object.hasOwn(MARKET_CROPS, cropId) ? MARKET_CROPS[cropId] : null;
  if (!crop || CEDA_STATES[state] !== stateId || !Number.isFinite(transportCostPerKg) || transportCostPerKg < 0 || !Number.isFinite(storageCostPerKg) || storageCostPerKg < 0) throw new Error('Choose a listed crop, matching state and non-negative costs per kg');
  const today = new Date();
  const toDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today);
  const from = new Date(toDate); from.setUTCDate(from.getUTCDate() - 400);
  const assessments = await MarketIntelligence.find({ kind: 'QUALITY_ASSESSMENT', recordId: { $in: Array.isArray(assessmentIds) ? assessmentIds.slice(0, 5) : [] }, cropId, evaluatorId: ownerId }).lean();
  const grades = assessments.map(item => item.inspectorVerification?.verifiedGrade || item.result?.grade).filter(Boolean);
  const visualGrade = grades.length ? grades.sort((a, b) => ['A+', 'A', 'B', 'C', 'REJECT'].indexOf(b) - ['A+', 'A', 'B', 'C', 'REJECT'].indexOf(a))[0] : null;
  if (visualGrade === 'REJECT' || assessments.some(item => item.result?.spoilageDetected)) return { status: 'QUALITY_REVIEW_REQUIRED', farmGateRange: null, reason: 'Visible spoilage or rejected quality: obtain partner inspection before recommending a sale price.', quality: { grade: visualGrade, approved: assessments.every(item => !!item.inspectorVerification) } };
  const payload = await fetchPrices('/prices', { method: 'POST', body: { commodity_id: crop.commodityId, state_id: stateId, from_date: from.toISOString().slice(0, 10), to_date: toDate } });
  const result = summarizePrices(payload.output?.data || payload.data || [], transportCostPerKg, today);
  const demands = await BuyerDemand.find({ cropId, status: 'OPEN', 'deliveryLocation.state': state, unit: 'kg', deliveryBy: { $gte: today } }).select('quantity').lean();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth() + 1, 1));
  const priorDemands = await BuyerDemand.find({ cropId, status: { $ne: 'CANCELLED' }, 'deliveryLocation.state': state, unit: 'kg', deliveryBy: { $gte: monthStart, $lt: monthEnd } }).select('quantity').lean();
  return { ...result, cropId, sourceCommodity: crop.name, trainedForecastAvailable: !!crop.lightgbm, storageCostPerKg,
    ...(result.farmGateRange ? { farmGateRange: { low: Math.max(0, result.farmGateRange.low - storageCostPerKg), high: Math.max(0, result.farmGateRange.high - storageCostPerKg) } } : {}),
    quality: { grade: visualGrade, approved: grades.length > 0 && assessments.every(item => !!item.inspectorVerification), priceAdjustment: null, explanation: 'Grade reviewed for sale suitability; no uncalibrated quality premium or discount added.' }, region: state, demand: { openDemandCount: demands.length, quantityKg: demands.reduce((sum, row) => sum + row.quantity, 0), source: 'Open buyer demand in selected state', seasonalHistory: priorDemands.length ? { sameMonthPriorYearQuantityKg: priorDemands.reduce((sum, item) => sum + item.quantity, 0), records: priorDemands.length } : null, seasonality: 'Seasonal buyer-demand history is descriptive; no calibrated demand forecast or demand price adjustment is available.' } };
}
