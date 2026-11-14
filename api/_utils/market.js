import crypto from 'node:crypto';

export const API_VERSION = 'v1';
export const UNITS = new Set(['kg', 'g', 'tonne', 'quintal', 'piece', 'crate', 'bag']);
export const ORGANIZATION_TYPES = new Set(['retailer', 'wholesaler', 'processor', 'other']);

export function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data, meta: { version: API_VERSION } });
}

export function sendError(res, status, code, message, details) {
  return res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) }, meta: { version: API_VERSION } });
}

export function validString(value, max = 160) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

export function validPositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function tokenSecret() {
  return process.env.JWT_SECRET || process.env.MONGO_URI || '';
}

export function issueAccessToken(user) {
  const secret = tokenSecret();
  if (!secret) throw new Error('JWT_SECRET or MONGO_URI must be configured');
  const issuedAt = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: String(user._id), role: user.role, organizationType: user.organizationType || null, iat: issuedAt, exp: issuedAt + 43200 })}`;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function authenticate(req) {
  const token = String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const secret = tokenSecret();
  if (!token || !secret) return null;
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra) return null;
  const body = `${header}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.sub || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) return null;
    return { id: String(claims.sub), role: String(claims.role || '').toUpperCase(), organizationType: claims.organizationType || null };
  } catch { return null; }
}

export function isSeller(user) {
  return ['FARMER', 'SELLER', 'FPO', 'PROCESSOR'].includes(user.role);
}

export function isBuyer(user) {
  return ['BUYER', 'RETAILER', 'WHOLESALER', 'PROCESSOR'].includes(user.role) && ORGANIZATION_TYPES.has(user.organizationType);
}

export function asId(value) {
  return String(value || '').trim();
}

export function isStorageReference(value) {
  return typeof value === 'string' && /^storage:\/\/[A-Za-z0-9._/-]{1,500}$/.test(value) && !value.includes('..');
}

