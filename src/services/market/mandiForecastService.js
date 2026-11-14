export async function getMandiForecast(observations = []) {
  if (!Array.isArray(observations) || observations.length < 31) return null;
  const response = await fetch('/api/ai/mandi-forecast', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observations })
  });
  if (!response.ok) throw new Error(`Mandi model unavailable (${response.status})`);
  const payload = await response.json();
  if (!payload.success) throw new Error(payload.message || 'Mandi model unavailable');
  return {
    ...payload,
    method: 'MODEL',
    status: 'READY',
    units: payload.units || 'INR/quintal',
    sourceFreshness: observations.reduce((latest, observation) => {
      const date = new Date(observation.price_date);
      return Number.isNaN(date.getTime()) || date <= latest ? latest : date;
    }, new Date(0)).toISOString(),
    limitations: ['Forecast is for the next reported mandi observation, not a fixed number of calendar days.']
  };
}
