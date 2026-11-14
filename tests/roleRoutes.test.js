import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoleHome } from '../src/utils/roleRoutes.js';

test('role homes route platform accounts to their workspaces', () => {
  assert.equal(getRoleHome('FARMER'), '/farmer');
  assert.equal(getRoleHome('SELLER'), '/buyer');
  assert.equal(getRoleHome('QUALITY_INSPECTOR'), '/quality');
  assert.equal(getRoleHome('WAREHOUSE'), '/storage');
  assert.equal(getRoleHome('TRANSPORT'), '/logistics');
  assert.equal(getRoleHome('ADMIN'), '/admin');
});

test('legacy processing role and unknown roles have safe routes', () => {
  assert.equal(getRoleHome('PROCESSING_UNIT'), '/buyer');
  assert.equal(getRoleHome('unknown'), '/farmer');
});
