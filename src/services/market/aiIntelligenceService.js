const endpoint = kind => `/api/ai/intelligence/${kind}`;

async function postIntelligence(kind, input) {
  const response = await fetch(endpoint(kind), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('agritrace_access_token') || ''}` },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const error = new Error(payload.message || `Market intelligence unavailable (${response.status})`);
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export function getRegionalDemandForecast(input) {
  return postIntelligence('demand', input);
}

export function getMarketPriceRecommendation(input) {
  return postIntelligence('price', input);
}

export function getCropMarketIntelligence(input) {
  return postIntelligence('market', input);
}
