import React, { useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CEDA_STATES, MARKET_CROPS } from '../../shared/marketCrops.js';
import { useAuth } from '../context/useAuth.js';
import { getCropMarketIntelligence } from '../services/market/aiIntelligenceService.js';
import './PredictionAdvisory.css';

const money = value => value === null || value === undefined ? 'Unavailable' : `₹${Number(value).toFixed(2)}`;
const actions = { SELL: 'Consider selling', HOLD: 'Consider holding', CONSIDER_ALTERNATIVE: 'Compare your options', INSUFFICIENT_DATA: 'More information needed' };

export default function CropMarketIntelligence({ cropId }) {
  const { user } = useAuth();
  const crop = MARKET_CROPS[cropId];
  const [form, setForm] = useState({ state: CEDA_STATES[user?.state] ? user.state : '', transportCostPerKg: '', storageCostPerKg: '', shelfLifeDays: '', holdingPeriodDays: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); setResult(null); setError(''); };

  async function load(review = false) {
    if (!form.state || form.transportCostPerKg === '' || form.storageCostPerKg === '') { setError('Choose a state and enter both costs. Enter zero when a cost does not apply.'); return; }
    setBusy(true); setError('');
    try {
      const input = { cropId, state: form.state, stateId: CEDA_STATES[form.state], review };
      for (const key of ['transportCostPerKg', 'storageCostPerKg', 'shelfLifeDays', 'holdingPeriodDays']) if (form[key] !== '') input[key] = Number(form[key]);
      setResult(await getCropMarketIntelligence(input));
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  if (!crop) return null;
  return <section className="market-card prediction-advisory crop-market-intelligence" aria-labelledby="crop-market-title">
    <header className="prediction-header"><div><h3 id="crop-market-title">{crop.name} market intelligence</h3><p>Compare observed mandi prices, regional buyer demand, and your selling costs before requesting an advisory.</p></div><span className="prediction-scope">All {Object.keys(MARKET_CROPS).length} listed crops</span></header>
    <form onSubmit={event => { event.preventDefault(); load(); }}>
      <fieldset disabled={busy} className="prediction-fieldset">
        <div className="prediction-fields">
          <label>Market state<select value={form.state} onChange={event => change('state', event.target.value)} required><option value="">Select state</option>{Object.keys(CEDA_STATES).map(state => <option key={state}>{state}</option>)}</select></label>
          <label>Transport cost (INR/kg)<input type="number" min="0" step="0.01" value={form.transportCostPerKg} onChange={event => change('transportCostPerKg', event.target.value)} required placeholder="Enter cost; zero is allowed" /></label>
          <label>Total storage cost (INR/kg)<input type="number" min="0" step="0.01" value={form.storageCostPerKg} onChange={event => change('storageCostPerKg', event.target.value)} required placeholder="For the intended holding period" /></label>
          <label>Remaining shelf life (days)<input type="number" min="0" step="1" value={form.shelfLifeDays} onChange={event => change('shelfLifeDays', event.target.value)} placeholder="Optional; required for holding advice" /></label>
          <label>Intended holding period (days)<input type="number" min="0" step="1" value={form.holdingPeriodDays} onChange={event => change('holdingPeriodDays', event.target.value)} placeholder="Optional; required for holding advice" /></label>
        </div>
        <div className="prediction-submit"><button type="submit" className="prediction-primary">{busy ? 'Loading and checking evidence…' : 'Load market evidence'}</button><button type="button" className="prediction-secondary" disabled={result?.status !== 'READY'} onClick={() => load(true)}>Review with Qwen</button></div>
      </fieldset>
    </form>
    {busy && <p role="status" className="prediction-help">Using the daily cached snapshot. Loading a new crop and state can take up to a minute.</p>}
    {error && <p role="alert" className="prediction-message prediction-error">{error}</p>}
    {result && <div className="prediction-result" aria-live="polite">
      <header className="prediction-result-heading"><h4>Market evidence for {result.sourceCommodity || crop.name}</h4><span>{result.region || form.state} · {result.latestDate ? `Latest observation ${result.latestDate}` : 'No current price observations'}</span></header>
      {result.status === 'READY' ? <>
        <div className="prediction-result-grid"><section><h4>Indicative farm-gate range</h4><p className="prediction-direction">{money(result.farmGateRange.low)}–{money(result.farmGateRange.high)} / kg</p><p>Observed mandi median: {money(result.mandiMedian)}/kg. Transport: {money(result.transportCostPerKg)}/kg; storage: {money(result.storageCostPerKg)}/kg deducted.</p><p className="prediction-help">{result.observations} price records. Commodity-level reference; no variety-specific price or quality premium is assumed.</p></section><section><h4>Observed price movement</h4><p className="prediction-direction">{result.observedTrend.direction === 'INSUFFICIENT_DATA' ? 'More dated observations needed' : result.observedTrend.direction === 'UP' ? 'Rising' : result.observedTrend.direction === 'DOWN' ? 'Falling' : 'Broadly stable'}</p><p>{result.observedTrend.changePercent === null ? '' : `${result.observedTrend.changePercent}% recent versus earlier average. `}This describes the recorded history, not a prediction of future prices.</p></section></div>
        {result.priceHistory?.length > 0 && <div style={{ height: 240, width: '100%', marginTop: 20 }} role="img" aria-label={`${crop.name} observed daily mandi prices`}><ResponsiveContainer width="100%" height="100%"><LineChart data={result.priceHistory} margin={{ top: 10, right: 12, left: 0, bottom: 6 }}><XAxis dataKey="date" tickFormatter={date => date.slice(5)} minTickGap={35} tick={{ fontSize: 11 }} /><YAxis width={45} tick={{ fontSize: 11 }} /><Tooltip formatter={value => [`₹${Number(value).toFixed(2)}/kg`, 'Daily mean']} /><Line dataKey="price" stroke="#285a3c" strokeWidth={2.5} dot={result.priceHistory.length < 10} /></LineChart></ResponsiveContainer></div>}
      </> : <p className="prediction-message">{result.reason || 'Current price evidence is insufficient. No price or sale recommendation was generated.'}</p>}
      {result.demand && <div className="prediction-result-grid"><section><h4>Recorded buyer demand</h4><p>{result.demand.openDemandCount} open demands · {result.demand.quantityKg.toLocaleString('en-IN')} kg requested in {result.region}.</p><p className="prediction-help">Actual platform requests, not an estimate of total market demand.</p></section><section><h4>Seasonal reference</h4><p>{result.seasonalReference ? `${money(result.seasonalReference.sameMonthPriorYearAverage)}/kg average in the same month of the prior year.` : 'No comparable prior-year price observations available.'}</p><p className="prediction-help">Historical context only; no seasonal price multiplier is applied.</p></section></div>}
      {result.advisory && <section className="prediction-advice" aria-label="Market advisory"><h4>{actions[result.advisory.recommendation]}</h4><p>{result.advisory.summary}</p><p><strong>Next step:</strong> {result.advisory.suggestedAction}</p><details><summary>Evidence behind this advisory</summary><ul>{result.advisory.reasons.map((reason, i) => <li key={i}>{reason.text} <small>({reason.evidenceIds.join(', ')})</small></li>)}</ul></details></section>}
      {['UNAVAILABLE', 'REVIEW_REQUIRED', 'INSUFFICIENT_DATA'].includes(result.reviewStatus) && <p className="prediction-message">{result.reviewReason || 'Advisory withheld until there is sufficient current evidence.'}</p>}
    </div>}
    <p className="prediction-footer">CEDA snapshots refresh on first use once per India calendar day for each crop and state. Qwen reviews supplied evidence; it cannot verify future prices.{!crop.lightgbm && ' The supplied LightGBM weights do not cover this crop; the evidence above does not use a trained direction forecast.'}</p>
  </section>;
}
