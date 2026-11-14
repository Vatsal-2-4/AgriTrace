import { handleCors } from '../_utils/http.js';

const DEMAND_MODEL_VERSION = 'regional-demand-heuristic-v1';
const PRICE_MODEL_VERSION = 'market-price-heuristic-v1';
const GRADE_ADJUSTMENTS = { 'A+': 0.08, A: 0.04, B: 0, C: -0.08 };

const asFinite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const nonNegative = value => {
  const parsed = asFinite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};
const isoDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function demandForecast(body) {
  const cropId = String(body.cropId || '').trim().toUpperCase();
  const district = String(body.region?.district || '').trim();
  const state = String(body.region?.state || '').trim();
  const horizonDays = asFinite(body.horizonDays);
  const observations = body.observations;

  if (!cropId || !district || !state || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 30) {
    return { error: 'cropId, region.district, region.state and horizonDays (1–30) are required' };
  }
  if (!Array.isArray(observations) || observations.length < 2) {
    return { insufficient: true, data: {
      cropId, region: { district, state }, horizonDays,
      expectedDemandQuantity: null, unit: 'kg', changePercent: null,
      pricePressure: 'UNKNOWN', interval: { lower: null, upper: null }, confidence: 0,
      drivers: [], sourceFreshness: [], modelVersion: DEMAND_MODEL_VERSION,
      generatedAt: new Date().toISOString(), status: 'INSUFFICIENT_DATA'
    } };
  }

  const rows = observations.filter(row => row && typeof row === 'object').map(row => ({
    quantity: asFinite(row?.quantityKg),
    asOf: isoDate(row?.asOf),
    source: String(row?.source || 'buyer demand')
  })).filter(row => row.quantity !== null && row.quantity >= 0 && row.asOf);
  if (rows.length < 2) return { error: 'At least two dated non-negative quantityKg observations are required' };
  rows.sort((a, b) => a.asOf.localeCompare(b.asOf));

  const recent = rows.slice(-Math.ceil(rows.length / 2));
  const previous = rows.slice(0, rows.length - recent.length);
  const average = values => values.reduce((sum, row) => sum + row.quantity, 0) / values.length;
  const recentAverage = average(recent);
  const previousAverage = previous.length ? average(previous) : null;
  const changePercent = previousAverage > 0 ? ((recentAverage - previousAverage) / previousAverage) * 100 : null;
  const expectedDemandQuantity = Math.max(0, recentAverage * (1 + (changePercent || 0) / 100 * Math.min(horizonDays / 7, 1)));
  const deviations = recent.map(row => Math.abs(row.quantity - recentAverage));
  const meanDeviation = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;
  const interval = { lower: Math.max(0, expectedDemandQuantity - meanDeviation), upper: expectedDemandQuantity + meanDeviation };
  const latest = recent[recent.length - 1];
  const pressure = changePercent === null ? 'UNKNOWN' : changePercent > 5 ? 'UP' : changePercent < -5 ? 'DOWN' : 'STABLE';

  return { data: {
    cropId, region: { district, state }, horizonDays,
    expectedDemandQuantity: Math.round(expectedDemandQuantity), unit: 'kg',
    changePercent: changePercent === null ? null : Number(changePercent.toFixed(1)),
    pricePressure: pressure,
    interval: { lower: Math.round(interval.lower), upper: Math.round(interval.upper) },
    confidence: Math.min(0.75, Number((rows.length / 20).toFixed(2))),
    confidenceMeaning: 'uncalibrated_sample_size_indicator',
    drivers: [{ name: 'observed_buyer_demand', effect: pressure, contribution: changePercent === null ? null : Number(changePercent.toFixed(1)) }],
    sourceFreshness: [{ source: latest.source, asOf: latest.asOf }],
    modelVersion: DEMAND_MODEL_VERSION, generatedAt: new Date().toISOString(), status: 'READY'
  } };
}

function priceRecommendation(body) {
  const cropId = String(body.cropId || '').trim().toUpperCase();
  const district = String(body.region?.district || '').trim();
  const state = String(body.region?.state || '').trim();
  const grade = String(body.grade || '').trim().toUpperCase();
  const horizonDays = asFinite(body.horizonDays ?? 7);
  const observations = body.observations;

  if (!cropId || !district || !state || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 30) {
    return { error: 'cropId, region.district, region.state and horizonDays (1–30) are required' };
  }
  if (!Array.isArray(observations) || observations.length < 2) {
    return { data: {
      cropId, region: { district, state },
      priceRange: { low: null, high: null, unit: String(body.priceUnit || 'INR/kg') },
      expectedNetPerUnit: null, recommendation: 'INSUFFICIENT_DATA', horizonDays,
      confidence: 0, method: 'INSUFFICIENT_DATA', drivers: [], sourceFreshness: [],
      modelVersion: PRICE_MODEL_VERSION, generatedAt: new Date().toISOString()
    } };
  }

  const rows = observations.filter(row => row && typeof row === 'object').map(row => ({
    price: asFinite(row?.price), asOf: isoDate(row?.asOf),
    source: String(row?.source || 'market observation')
  })).filter(row => row.price !== null && row.price > 0 && row.asOf);
  if (rows.length < 2) return { error: 'At least two dated positive price observations are required' };
  rows.sort((a, b) => a.asOf.localeCompare(b.asOf));

  const recent = rows.slice(-Math.ceil(rows.length / 2));
  const previous = rows.slice(0, rows.length - recent.length);
  const mean = values => values.reduce((sum, row) => sum + row.price, 0) / values.length;
  const current = recent[recent.length - 1].price;
  const recentMean = mean(recent);
  const previousMean = previous.length ? mean(previous) : null;
  const trendPct = previousMean > 0 ? ((recentMean - previousMean) / previousMean) * 100 : 0;
  const gradeAdjustment = GRADE_ADJUSTMENTS[grade] || 0;
  const transportCost = nonNegative(body.transportCostPerUnit);
  const storageCost = nonNegative(body.storageCostPerUnit);
  if ((body.transportCostPerUnit !== undefined && transportCost === null) || (body.storageCostPerUnit !== undefined && storageCost === null)) {
    return { error: 'transportCostPerUnit and storageCostPerUnit must be non-negative numbers' };
  }
  if (body.demandForecast?.pricePressure && !['UP', 'STABLE', 'DOWN', 'UNKNOWN'].includes(body.demandForecast.pricePressure)) {
    return { error: 'demandForecast.pricePressure must be UP, STABLE, DOWN or UNKNOWN' };
  }
  const demandPressure = body.demandForecast?.pricePressure;
  const demandAdjustment = demandPressure === 'UP' ? 0.03 : demandPressure === 'DOWN' ? -0.03 : 0;
  const expected = Math.max(0, current * (1 + Math.max(-0.15, Math.min(0.15, trendPct / 100)) + gradeAdjustment + demandAdjustment));
  const spread = recent.length > 1 ? recent.reduce((sum, row) => sum + Math.abs(row.price - recentMean), 0) / recent.length : 0;
  const low = Math.max(0, Math.round(expected - spread));
  const high = Math.round(expected + spread);
  const net = transportCost === null || storageCost === null ? null : Math.max(0, expected - transportCost - storageCost);
  const latest = recent[recent.length - 1];
  const drivers = [
    { name: 'observed_price_trend', effect: trendPct > 1 ? 'UP' : trendPct < -1 ? 'DOWN' : 'STABLE', explanation: `Recent observations changed ${trendPct.toFixed(1)}% versus the earlier period.` },
    ...(gradeAdjustment ? [{ name: 'quality_grade', effect: gradeAdjustment > 0 ? 'UP' : 'DOWN', explanation: `Grade ${grade} adjustment is applied to the observed reference price.` }] : []),
    ...(demandPressure === 'UP' || demandPressure === 'DOWN' ? [{ name: 'regional_demand', effect: demandPressure, explanation: `The supplied regional demand forecast reports ${demandPressure.toLowerCase()} price pressure.` }] : []),
    ...(transportCost ? [{ name: 'transport_cost', effect: 'DOWN', explanation: `Transport estimate deducts ${transportCost} per unit from expected net.` }] : []),
    ...(storageCost ? [{ name: 'storage_cost', effect: 'DOWN', explanation: `Storage estimate deducts ${storageCost} per unit from expected net.` }] : []),
    ...(transportCost === null || storageCost === null ? [{ name: 'logistics_costs', effect: 'UNKNOWN', explanation: 'Net realization is unavailable because transport and storage estimates are both required.' }] : [])
  ];

  return { data: {
    cropId, region: { district, state },
    priceRange: { low, high, unit: String(body.priceUnit || 'INR/kg') },
    expectedNetPerUnit: net === null ? null : Number(net.toFixed(2)),
    recommendation: trendPct > 3 ? 'WAIT' : trendPct < -3 ? 'SELL' : 'COMPARE',
    horizonDays, confidence: Math.min(0.7, Number((rows.length / 20).toFixed(2))), confidenceMeaning: 'uncalibrated_sample_size_indicator',
    method: 'HEURISTIC', drivers,
    sourceFreshness: [{ source: latest.source, asOf: latest.asOf }],
    modelVersion: PRICE_MODEL_VERSION, generatedAt: new Date().toISOString()
  } };
}

export default function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const kind = String(req.query?.kind || req.body?.kind || '').toLowerCase();
  const body = req.body || {};
  const result = kind === 'demand' ? demandForecast(body) : kind === 'price' ? priceRecommendation(body) : { error: 'kind must be demand or price' };
  if (result.error) return res.status(400).json({ success: false, message: result.error });
  return res.status(200).json({ success: true, data: result.data });
}
