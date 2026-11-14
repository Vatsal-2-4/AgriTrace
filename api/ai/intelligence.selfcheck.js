import assert from 'node:assert/strict';
import handler from './intelligence.js';

function request(kind, body) {
  const req = { method: 'POST', query: { kind }, body, headers: {} };
  const res = {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; }
  };
  handler(req, res);
  return res;
}

const base = { cropId: 'tomato', region: { district: 'Kota', state: 'Rajasthan' }, horizonDays: 7 };
const noHistory = request('demand', base);
assert.equal(noHistory.statusCode, 200);
assert.equal(noHistory.payload.data.status, 'INSUFFICIENT_DATA');
assert.equal(noHistory.payload.data.expectedDemandQuantity, null);

const observations = [
  { quantityKg: 100, asOf: '2026-01-01' },
  { quantityKg: 110, asOf: '2026-01-02' },
  { quantityKg: 150, asOf: '2026-01-03' },
  { quantityKg: 160, asOf: '2026-01-04' }
];
const demand = request('demand', { ...base, observations });
assert.equal(demand.payload.data.cropId, 'TOMATO');
assert.equal(demand.payload.data.pricePressure, 'UP');
assert.equal(demand.payload.data.unit, 'kg');

const badCost = request('price', {
  ...base,
  observations: observations.map(row => ({ price: row.quantityKg, asOf: row.asOf })),
  transportCostPerUnit: -1
});
assert.equal(badCost.statusCode, 400);

const price = request('price', {
  ...base,
  observations: observations.map(row => ({ price: row.quantityKg, asOf: row.asOf })),
  grade: 'A', transportCostPerUnit: 5, storageCostPerUnit: 2,
  demandForecast: { pricePressure: 'UP' }
});
assert.equal(price.payload.data.method, 'HEURISTIC');
assert.equal(price.payload.data.expectedNetPerUnit !== null, true);
assert.equal(price.payload.data.confidenceMeaning, 'uncalibrated_sample_size_indicator');

console.log('AI intelligence self-check passed');
