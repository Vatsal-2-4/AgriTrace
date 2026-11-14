export async function qualityRequest(query = '', body, method = 'POST') {
  const token = localStorage.getItem('agritrace_access_token');
  const response = await fetch(`/api/produce-quality${query}`, { method, headers: { Authorization: `Bearer ${token || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.error?.message || 'Quality request failed');
  return payload.data;
}
export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP photo under 8 MB');
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 16000000) throw new Error('Use a photo under 16 megapixels');
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    if (data.length > 2800000) throw new Error('Photo is too large after compression');
    return data;
  } finally { image.close(); }
}
export const CEDA_STATES = { 'Rajasthan': 8, 'Maharashtra': 27, 'Karnataka': 29, 'Uttar Pradesh': 9, 'Madhya Pradesh': 23, 'Punjab': 3, 'Gujarat': 24, 'Tamil Nadu': 33, 'Andhra Pradesh': 28, 'West Bengal': 19, 'Haryana': 6, 'Bihar': 10, 'Odisha': 21, 'Telangana': 36 };

export function qualitySampleSummary(result) {
  const samples = result.samples || [];
  const threshold = result.reliabilityThreshold ?? 0.65;
  const reliable = samples.filter(sample => sample.confidence >= threshold);
  const counts = result.sampleSummary || {
    ripe: reliable.filter(sample => sample.label === 'ripe').length,
    half_ripe: reliable.filter(sample => sample.label === 'half_ripe').length,
    raw: reliable.filter(sample => sample.label === 'raw').length,
    rotten: reliable.filter(sample => sample.label === 'rotten').length,
    uncertain: samples.length - reliable.length
  };
  return Object.entries(counts).filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label === 'rotten' ? 'possible spoilage' : label.replaceAll('_', '-')}`).join(' · ');
}
