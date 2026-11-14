import React, { useEffect, useState } from 'react';
import { qualityRequest, qualitySampleSummary } from '../services/market/produceQualityService';
import './ProduceQuality.css';

function ProtectedPhoto({ imageRef }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let blobUrl;
    const id = imageRef.split('/').at(-1);
    fetch(`/api/produce-quality?image=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('agritrace_access_token') || ''}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Photo unavailable'); return response.blob(); })
      .then(blob => { blobUrl = URL.createObjectURL(blob); if (!controller.signal.aborted) setUrl(blobUrl); else URL.revokeObjectURL(blobUrl); })
      .catch(error => { if (error.name !== 'AbortError') setFailed(true); });
    return () => { controller.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [imageRef]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Farmer uploaded produce sample; open full-size photo" /></a> : <p>{failed ? 'Photo could not be loaded. Do not approve until you can inspect it.' : 'Loading photo…'}</p>;
}
function ReviewLot({ records, onReviewed }) {
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState('CORRECTED');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = records[0];
  const refs = [...new Set(records.flatMap(item => item.imageRefs))];
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await fetch(`/api/market/quality-assessments/${encodeURIComponent(first.recordId)}/verification`, { method: 'PATCH', headers: { Authorization: `Bearer ${localStorage.getItem('agritrace_access_token') || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ verifiedGrade: grade, decision, notes, photosReviewed: confirmed }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || 'Review could not be saved');
      onReviewed();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <article className="produce-quality">
    <h3>{first.cropId} · {first.lotId}</h3><p>Inspect every photo. Record your independent grade; model ripeness is only an estimate.</p>
    <div className="produce-review-images">{refs.map(ref => <ProtectedPhoto key={ref} imageRef={ref} />)}</div>
    {records.map(record => <div key={record.recordId} className="produce-quality-note"><strong>AI estimate: {record.result?.grade || 'Unavailable'}</strong><p>{record.result?.reason}</p><p>{qualitySampleSummary(record.result || {})}</p></div>)}
    <form onSubmit={submit}>
      <div className="produce-quality-fields"><label>Your independently assessed grade<select required value={grade} onChange={event => setGrade(event.target.value)}><option value="">Select grade</option>{['A+', 'A', 'B', 'C', 'REJECT'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Review decision<select value={decision} onChange={event => { setDecision(event.target.value); if (event.target.value === 'REJECTED') setGrade('REJECT'); }}><option value="CORRECTED">Record independent / corrected grade</option><option value="APPROVED">Approve model grade</option><option value="REJECTED">Reject produce quality</option></select></label></div>
      <label>Manual findings and reasons<textarea required minLength={3} maxLength={1000} rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Describe visible defects, ripeness, photo limitations, and any checks needed in person." /></label>
      <label><span><input type="checkbox" style={{ width: 'auto', marginRight: 8 }} required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I inspected every attached photo and recorded my own assessment.</span></label>
      {error && <p role="alert" className="produce-quality-error">{error}</p>}
      <button type="submit" disabled={busy || !confirmed}>{busy ? 'Saving review…' : 'Save partner review'}</button>
    </form>
  </article>;
}
export default function ProduceQualityReview() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError('');
    try { setRecords((await qualityRequest('?action=queue', undefined, 'GET')).items); }
    catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const lots = Object.groupBy(records, item => item.lotId);
  return <section className="produce-review"><h2>Produce photo quality review</h2><p>Approve or correct farmer-uploaded crop assessments. Your signed review becomes the lot’s verified grade.</p>
    <button type="button" className="btn-secondary" disabled={loading} onClick={load}>Refresh review queue</button>
    {loading && <p role="status">Loading produce assessments…</p>}
    {error && <p role="alert" className="produce-quality-error">{error}</p>}
    {!loading && !error && records.length === 0 && <p>No produce photos awaiting review.</p>}
    {Object.values(lots).map(items => <ReviewLot key={items[0].lotId} records={items} onReviewed={load} />)}
  </section>;
}
