// Workspace names are presentation aliases; API authorization always uses the signed token.
export const normalizeWorkspaceRole = role => ['PROCESSING_UNIT', 'BUYER'].includes(role) ? 'SELLER' : role;
export const DEMO_WORKSPACES = {
  FARMER: 'farmer@khetsetu.in', SELLER: 'buyer@khetsetu.in',
  QUALITY_INSPECTOR: 'quality@khetsetu.in', WAREHOUSE: 'storage@khetsetu.in', TRANSPORT: 'logistics@khetsetu.in'
};

export function restoreAuthenticatedUser(storage) {
  try {
    const user = JSON.parse(storage.getItem('khetsetu_user') || storage.getItem('wooltrace_user') || 'null');
    const token = storage.getItem('agritrace_access_token');
    if (!user || !token) return null;
    const claims = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
    if (String(claims.sub) !== String(user.id) || !claims.role || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) return null;
    // Repair old preview-only role changes without changing token permissions or identity.
    return { ...user, role: normalizeWorkspaceRole(claims.role) };
  } catch { return null; }
}

export async function authenticateAccount(identifier, password, expectedRole, fetcher = fetch) {
  const response = await fetcher('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  const data = await response.json();
  if (!response.ok || !data.user || !data.accessToken) throw new Error(data.message || 'Sign-in failed. A valid server session is required.');
  const user = { ...data.user, role: normalizeWorkspaceRole(data.user.role) };
  if (expectedRole && user.role !== expectedRole) throw new Error('This account does not have access to the selected workspace.');
  return { user, accessToken: data.accessToken };
}
