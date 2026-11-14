const API = '/api/market';

async function request(path, options = {}) {
  const token = localStorage.getItem('agritrace_access_token');
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error?.message || payload.message || `Marketplace request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload.data ?? payload;
}

export const marketplaceApi = {
  listLots: (filters = {}) => {
    const query = new URLSearchParams(filters);
    return request(`/lots${query.size ? `?${query}` : ''}`).then(result => result.items || []);
  },
  listDemands: (filters = {}) => {
    const query = new URLSearchParams(filters);
    return request(`/demands${query.size ? `?${query}` : ''}`).then(result => result.items || []);
  },
  createLot: data => request('/lots', { method: 'POST', body: JSON.stringify(data) }),
  createDemand: data => request('/demands', { method: 'POST', body: JSON.stringify(data) }),
  listMatches: lotId => request(`/lots/${encodeURIComponent(lotId)}/matches`).then(result => result.matches || []),
  placeBid: (lotId, data) => request(`/lots/${encodeURIComponent(lotId)}/bids`, { method: 'POST', body: JSON.stringify(data) }),
  listBids: (lotId) => request(lotId ? `/lots/${encodeURIComponent(lotId)}/bids` : '/bids').then(result => result.items || []),
  sendBidMessage: (bidId, message) => request(`/bids/${encodeURIComponent(bidId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  setContactConsent: marketContactConsent => request('/contact-consent', { method: 'PATCH', body: JSON.stringify({ marketContactConsent }) }),
  resolveBid: (lotId, bidId, data) => request(`/lots/${encodeURIComponent(lotId)}/bids/${encodeURIComponent(bidId)}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export function marketplaceErrorMessage(error) {
  if (error?.status === 401) return 'Your marketplace session is not authenticated. Please sign in again.';
  if (error?.status === 403) return 'This account does not have permission for that marketplace action.';
  return error?.message || 'Marketplace request failed. Please try again.';
}
