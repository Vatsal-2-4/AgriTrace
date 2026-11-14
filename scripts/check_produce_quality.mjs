/** Live local integration check; creates and removes only its own isolated records. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEnv } from 'vite';
import mongoose from 'mongoose';
import { issueAccessToken } from '../api/_utils/market.js';
import ProduceLot from '../api/_models/ProduceLot.js';
import ProduceImage from '../api/_models/ProduceImage.js';
import MarketIntelligence from '../api/_models/MarketIntelligence.js';
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/check_produce_quality.mjs <tomato-photo.jpg>');
Object.assign(process.env, loadEnv('development', process.cwd(), ''));
const sellerId = `QUALITY-REGRESSION-${Date.now()}`;
const seller = issueAccessToken({ _id: sellerId, role: 'FARMER' });
const other = issueAccessToken({ _id: sellerId + '-other', role: 'FARMER' });
const inspector = issueAccessToken({ _id: sellerId + '-partner', role: 'QUALITY_INSPECTOR' });
const base = process.env.QUALITY_TEST_BASE_URL || 'http://127.0.0.1:5175';
async function request(path, token, body, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(110000) });
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer() };
}
try {
  const upload = await request('/api/produce-quality', seller, { action: 'analyze', cropId: 'TOMATO', imageData: 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64') });
  assert.equal(upload.status, 201, JSON.stringify(upload));
  const photo = upload.body.data;
  const create = { cropId: 'TOMATO', cropName: 'Isolated integration test', quantity: 1, unit: 'kg', location: { district: 'TEST ONLY', state: 'Rajasthan' }, askingPrice: 1, priceUnit: 'INR/kg', imageRefs: [photo.imageRef], qualityAssessmentIds: [photo.assessmentId] };
  assert.equal((await request('/api/market/lots', other, create)).status, 400);
  const lot = await request('/api/market/lots', seller, create);
  assert.equal(lot.status, 201, JSON.stringify(lot));
  assert.equal((await request('/api/market/lots', seller, create)).status, 400);
  const imageUrl = '/api/produce-quality?image=' + photo.imageRef.split('/').at(-1);
  assert.equal((await request(imageUrl, other, undefined, 'GET')).status, 404);
  const image = await request(imageUrl, inspector, undefined, 'GET');
  assert.equal(image.status, 200);
  assert.ok(image.body instanceof ArrayBuffer);
  assert.equal(new Uint8Array(image.body)[0], 255);
  const queue = await request('/api/produce-quality?action=queue', inspector, undefined, 'GET');
  assert.ok(queue.body.data.items.some(item => item.lotId === lot.body.data.lotId));
  const verification = { verifiedGrade: 'A', decision: 'CORRECTED', notes: 'Integration test of independent correction; not a commercial inspection.', photosReviewed: true };
  const path = '/api/market/quality-assessments/' + photo.assessmentId + '/verification';
  assert.equal((await request(path, seller, verification, 'PATCH')).status, 403);
  assert.equal((await request(path, inspector, { ...verification, photosReviewed: false }, 'PATCH')).status, 400);
  const verified = await request(path, inspector, verification, 'PATCH');
  assert.equal(verified.status, 200, JSON.stringify(verified));
  assert.deepEqual(verified.body.data.result, photo.result);
  assert.equal(verified.body.data.inspectorVerification.verifiedGrade, 'A');
  assert.equal((await request(path, inspector, verification, 'PATCH')).status, 409);
  console.log('PASS: live upload/inference, transactional lot binding, ownership, private image bytes, complete review queue, inspector authorization, confirmed manual correction, preserved AI result and duplicate-review protection.');
} finally {
  await mongoose.connect(process.env.MONGO_URI);
  await ProduceLot.deleteMany({ sellerId });
  await ProduceImage.deleteMany({ ownerId: sellerId });
  await MarketIntelligence.deleteMany({ evaluatorId: sellerId });
  await mongoose.disconnect();
}
