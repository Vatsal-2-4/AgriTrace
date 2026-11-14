import React, { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Info, Upload } from 'lucide-react';
import { getMandiForecast } from '../services/market/mandiForecastService';
import schema from '../services/market/mandiFeatureSchema.json';
import './PredictionAdvisory.css';

const label = name => name.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
const groups = [
  ['Price and arrivals', schema.features.slice(3, 19)],
  ['Weather and season', schema.features.slice(19, 28)],
  ['Volatility and production', schema.features.slice(28)]
];
const reviewLabels = { CONSISTENT: 'Consistent with inputs', CONCERNS: 'Concerns found', INSUFFICIENT_DATA: 'More information needed', UNAVAILABLE: 'Review unavailable' };
const actions = { SELL: 'Consider selling', HOLD: 'Consider holding', CONSIDER_ALTERNATIVE: 'Compare your options' };

export default function PredictionAdvisory({ selectedCommodityId }) {
  const crop = schema.categories.vegetable.find(name => name.toUpperCase() === selectedCommodityId) || '';
  const [inputs, setInputs] = useState({ vegetable: crop });
  const [conditions, setConditions] = useState({});
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const form = useRef(null);
  const requestId = useRef(0);
  const numeric = schema.features.filter(name => !schema.categories[name]);
  const completed = schema.features.filter(name => inputs[name] !== undefined && inputs[name] !== '').length;

  function clearResult() {
    requestId.current += 1;
    setResult(null);
    setError('');
  }
  function updateFeature(name, value) {
    clearResult();
    setInputs(previous => ({ ...previous, [name]: value }));
  }
  function updateCondition(name, value) {
    clearResult();
    setConditions(previous => ({ ...previous, [name]: value }));
  }
  function importInputs(text) {
    try {
      const packet = JSON.parse(text);
      const features = packet.features || packet;
      if (!features || typeof features !== 'object' || Array.isArray(features)) throw new Error('Expected a feature object.');
      const next = {};
      for (const name of schema.features) {
        const value = features[name];
        if (value === null || value === undefined) continue;
        if (schema.categories[name] ? !schema.categories[name].includes(value) : typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`Check ${label(name).toLowerCase()}: use a supported category or a finite number.`);
        }
        next[name] = String(value);
      }
      if (!Object.keys(next).length) throw new Error('No recognized model features found.');
      const context = packet.conditions || {};
      if (typeof context !== 'object' || Array.isArray(context)) throw new Error('Sale conditions must be a JSON object.');
      for (const name of ['shelfLifeDays', 'holdingPeriodDays', 'storageCostPerUnit', 'transportCostPerUnit']) {
        if (context[name] !== undefined && context[name] !== null && (typeof context[name] !== 'number' || !Number.isFinite(context[name]) || context[name] < 0)) {
          throw new Error(`${name} must be a non-negative number.`);
        }
      }
      for (const name of ['priceUnit', 'predictionHorizon', 'notes']) {
        if (context[name] !== undefined && typeof context[name] !== 'string') throw new Error(`${name} must be text.`);
      }
      clearResult();
      setInputs(next);
      setConditions(context);
    } catch (cause) {
      setError(`Could not import features. ${cause.message}`);
    }
  }
  async function submit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    const missing = schema.features.filter(name => inputs[name] === undefined || inputs[name] === '');
    if (missing.length) {
      const field = form.current.elements.namedItem(missing[0]);
      const section = field?.closest('details');
      if (section) section.open = true;
      field?.focus();
      setError(`Complete all 40 features. Missing: ${missing.map(label).join(', ')}.`);
      return;
    }
    const features = Object.fromEntries(schema.features.map(name => [name, schema.categories[name] ? inputs[name] : Number(inputs[name])]));
    if (numeric.some(name => !Number.isFinite(features[name]))) {
      setError('Every numeric feature must be a finite number.');
      return;
    }
    const suppliedConditions = Object.fromEntries(Object.entries(conditions).filter(([, value]) => value !== '' && value !== null));
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await getMandiForecast(features, suppliedConditions);
      if (currentRequest === requestId.current) setResult(response);
    } catch (cause) {
      if (currentRequest === requestId.current) setError(`${cause.message}. Check the inputs and try again.`);
    } finally {
      setLoading(false);
    }
  }

  return <section className="market-card prediction-advisory" aria-labelledby="prediction-title">
    <header className="prediction-header">
      <div>
        <h3 id="prediction-title">Crop prediction &amp; sale advisory</h3>
        <p>Review the model’s price direction against your crop conditions before deciding what to do.</p>
      </div>
      <span className="prediction-scope">Onion · Potato · Tomato</span>
    </header>
    <ol className="prediction-flow" aria-label="Assessment process">
      <li>Prepared features</li><li><ArrowRight size={14} aria-hidden="true" /> LightGBM prediction</li><li><ArrowRight size={14} aria-hidden="true" /> Qwen review &amp; advisory</li>
    </ol>
    <form ref={form} onSubmit={submit} noValidate>
      <fieldset disabled={loading} className="prediction-fieldset">
        <div className="prediction-input-heading"><h4>Model inputs</h4><span>{completed} of 40 supplied</span></div>
        <p className="prediction-help">Use values prepared with the original model’s formulas and units. Raw daily prices cannot replace normalized or monthly features.</p>
        <details className="prediction-import">
          <summary><Upload size={15} aria-hidden="true" /> Import prepared features</summary>
          <label htmlFor="prediction-file">Choose a JSON feature file</label>
          <input id="prediction-file" type="file" accept=".json,application/json" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 100000) { setError('Choose a JSON file smaller than 100 KB.'); return; }
            try { importInputs(await file.text()); } catch { setError('Could not read this file. Try pasting its JSON below.'); }
            event.target.value = '';
          }} />
          <label htmlFor="prediction-json">Or paste a feature object, or an object containing features and conditions</label>
          <textarea id="prediction-json" rows={5} value={importText} onChange={event => setImportText(event.target.value)} placeholder={'{ "features": { "vegetable": "Tomato", … }, "conditions": { … } }'} spellCheck={false} />
          <button className="prediction-secondary" type="button" onClick={() => importInputs(importText)}>Apply feature JSON</button>
        </details>
        <div className="prediction-fields">
          {Object.entries(schema.categories).map(([name, options]) => <label key={name}>
            {name === 'vegetable' ? 'Crop for this assessment' : label(name)}
            <select name={name} value={inputs[name] || ''} onChange={event => updateFeature(name, event.target.value)}>
              <option value="">Select {name === 'vegetable' ? 'crop' : name}</option>
              {options.map(option => <option key={option}>{option}</option>)}
            </select>
          </label>)}
        </div>
        {groups.map(([title, names]) => <details className="prediction-feature-group" key={title}>
          <summary>{title}<span>{names.filter(name => inputs[name] !== undefined && inputs[name] !== '').length}/{names.length} supplied</span></summary>
          <div className="prediction-fields">{names.map(name => <label key={name}>
            {label(name)}<small>{name}</small>
            <input name={name} type="number" step="any" value={inputs[name] ?? ''} onChange={event => updateFeature(name, event.target.value)} />
          </label>)}</div>
        </details>)}
        <h4>Sale conditions <span className="prediction-optional">Optional, but improve the advisory</span></h4>
        <div className="prediction-fields">
          {['shelfLifeDays', 'holdingPeriodDays', 'storageCostPerUnit', 'transportCostPerUnit'].map(name => <label key={name}>
            {{ shelfLifeDays: 'Remaining shelf life (days)', holdingPeriodDays: 'Intended holding period (days)', storageCostPerUnit: 'Storage cost per unit', transportCostPerUnit: 'Transport cost per unit' }[name]}
            <input type="number" min="0" step="any" value={conditions[name] ?? ''} onChange={event => updateCondition(name, event.target.value === '' ? '' : Number(event.target.value))} />
          </label>)}
          <label>Price and cost unit<input value={conditions.priceUnit || ''} placeholder="e.g. INR/kg" onChange={event => updateCondition('priceUnit', event.target.value)} /></label>
          <label>Model prediction horizon, if known<input value={conditions.predictionHorizon || ''} placeholder="Use the original target horizon" onChange={event => updateCondition('predictionHorizon', event.target.value)} /></label>
        </div>
        <label className="prediction-notes">Other conditions<textarea rows={2} value={conditions.notes || ''} placeholder="Available buyer offers, cash needs, storage access or recent crop conditions" onChange={event => updateCondition('notes', event.target.value)} /></label>
        <div className="prediction-submit"><button type="submit" className="prediction-primary">{loading ? 'Predicting and reviewing…' : 'Predict & review'}<ArrowRight size={16} aria-hidden="true" /></button><span>LightGBM + Qwen 3.8 27B</span></div>
      </fieldset>
    </form>
    {loading && <p role="status" className="prediction-message">Running the trained model and reviewing its output with your supplied conditions…</p>}
    {error && <p role="alert" className="prediction-message prediction-error"><Info size={17} aria-hidden="true" />{error}</p>}
    {result && <div className="prediction-result" aria-live="polite">
      <header className="prediction-result-heading"><h4>Assessment for {result.inputFeatures.vegetable}</h4><span>{result.inputFeatures.state} · {result.inputFeatures.season}</span></header>
      <div className="prediction-result-grid">
        <section aria-label="Model prediction"><h4>LightGBM prediction</h4><p className="prediction-direction">{ { UP: 'Price direction: Up', DOWN: 'Price direction: Down', STABLE: 'Price direction: Stable' }[result.direction]}</p>
          <dl className="prediction-probabilities">{Object.entries(result.classProbabilities).map(([direction, score]) => <div key={direction}><dt>{label(direction.toLowerCase())}</dt><dd><meter min="0" max="1" value={score} aria-label={`${direction} probability`} /><span>{(score * 100).toFixed(1)}%</span></dd></div>)}</dl>
          <p className="prediction-help">Model probabilities are not calibrated confidence or a future price estimate.</p>
        </section>
        <section aria-label="LLM review"><h4>Qwen review</h4><p className={`prediction-review-status ${result.review.status === 'CONSISTENT' ? 'is-consistent' : ''}`}>{result.review.status === 'CONSISTENT' ? <CheckCircle2 size={17} /> : <Info size={17} />}{reviewLabels[result.review.status]}</p>
          <p>{result.review.rationale || result.review.reason}</p>
          {result.review.concerns?.length > 0 && <><h5>Concerns</h5><ul>{result.review.concerns.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
          {result.review.missingInformation?.length > 0 && <><h5>Information to check</h5><ul>{result.review.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
        </section>
      </div>
      {result.review.featureChecks?.length > 0 && <details className="prediction-feature-group" open><summary>Why this review?</summary><ul className="prediction-checks">{result.review.featureChecks.map((check, i) => <li key={i}><div><strong>{label(check.feature)}</strong><span>{check.assessment === 'SUPPORTS' ? 'Supports direction' : check.assessment === 'CONTRADICTS' ? 'Opposes direction' : 'Context'} · {result.inputFeatures[check.feature]}</span></div><p>{check.explanation}</p></li>)}</ul></details>}
      <section className="prediction-advice" aria-label="User advisory"><h4>{result.advisory ? actions[result.advisory.recommendation] : 'Advisory withheld'}</h4>
        {result.advisory ? <><p>{result.advisory.summary}</p><p><strong>Next step:</strong> {result.advisory.suggestedAction}</p></> : <p>Resolve the review concerns or provide the missing information, then run the assessment again. A prediction alone is not an approved sale recommendation.</p>}
      </section>
      <details className="prediction-feature-group"><summary>Inputs and limitations</summary><p>These are the exact values used for this assessment.</p><dl className="prediction-input-record">{Object.entries(result.inputFeatures).map(([name, value]) => <div key={name}><dt>{label(name)}</dt><dd>{String(value)}</dd></div>)}</dl>
        <h5>Sale conditions supplied</h5><pre>{JSON.stringify(result.inputConditions, null, 2)}</pre>
        <ul>{[...new Set([...(result.limitations || []), ...(result.advisory?.limitations || [])])].map((item, i) => <li key={i}>{item}</li>)}</ul>
        <p className="prediction-help">{result.modelVersion} · {result.reviewModel} · {new Date(result.generatedAt).toLocaleString()}</p>
      </details>
    </div>}
    <p className="prediction-footer">The LLM checks consistency with supplied inputs. It cannot verify future market outcomes.</p>
  </section>;
}
