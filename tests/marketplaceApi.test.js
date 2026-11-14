import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { marketplaceApi, marketplaceErrorMessage } from '../src/services/market/marketplaceApi.js';

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; });

test('marketplace requests include the saved bearer token and return lot items', async () => {
  globalThis.localStorage = { getItem: key => key === 'agritrace_access_token' ? 'test-token' : null };
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ success: true, data: { items: [{ lotId: 'LOT-1' }] } }) };
  };
  assert.deepEqual(await marketplaceApi.listLots(), [{ lotId: 'LOT-1' }]);
  assert.equal(request.url, '/api/market/lots');
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
});

test('marketplace bid list uses the bids endpoint', async () => {
  globalThis.localStorage = { getItem: () => null };
  let requestedUrl;
  globalThis.fetch = async url => { requestedUrl = url; return { ok: true, json: async () => ({ success: true, data: { items: [] } }) }; };
  assert.deepEqual(await marketplaceApi.listBids(), []);
  assert.equal(requestedUrl, '/api/market/bids');
});

test('marketplace errors explain expired auth and preserve server messages', () => {
  assert.equal(marketplaceErrorMessage({ status: 401 }), 'Your marketplace session is not authenticated. Please sign in again.');
  assert.equal(marketplaceErrorMessage(new Error('Failed to fetch')), 'Failed to fetch');
});
