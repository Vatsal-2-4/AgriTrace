import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ClipboardList, Handshake, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { COMMODITIES } from '../../services/market/marketIntelligenceService';
import { marketplaceApi, marketplaceErrorMessage } from '../../services/market/marketplaceApi';
import MarketplaceContactConsent from '../market/MarketplaceContactConsent';
import './BuyerWorkspace.css';

const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const unitMap = { KG: 'kg', QUINTAL: 'quintal', TONNE: 'tonne' };
const splitLocation = value => {
  const [district, ...stateParts] = String(value || '').split(',').map(part => part.trim());
  return { district, state: stateParts.join(', ') || district };
};

export default function BuyerWorkspace() {
  const { pathname } = useLocation();
  const view = pathname.split('/').pop() === 'buyer' ? 'overview' : pathname.split('/').pop();
  const { user } = useAuth();
  const [lots, setLots] = useState([]);
  const [demands, setDemands] = useState([]);
  const [bids, setBids] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [offerInputs, setOfferInputs] = useState({});
  const [messageDrafts, setMessageDrafts] = useState({});
  const [demand, setDemand] = useState({ cropId: 'WHEAT', quantity: '1000', unit: 'kg', grade: 'A', maxPrice: '31', priceUnit: 'INR/kg', location: user?.state || '' , deliveryBy: '' });
  const refresh = useCallback(async () => {
    try {
      const [nextLots, nextDemands, nextBids] = await Promise.all([marketplaceApi.listLots(), marketplaceApi.listDemands(), marketplaceApi.listBids()]);
      setLots(nextLots.filter(lot => lot.lotId && lot.cropId !== 'WOOL'));
      setDemands(nextDemands);
      setBids(nextBids);
      setMessage('');
    } catch (error) { setMessage(marketplaceErrorMessage(error)); }
  }, []);
  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const postDemand = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const location = splitLocation(demand.location);
      const saved = await marketplaceApi.createDemand({ cropId: demand.cropId, quantity: Number(demand.quantity), unit: demand.unit, minimumGrade: demand.grade, maxPrice: Number(demand.maxPrice), priceUnit: demand.priceUnit, deliveryLocation: location, deliveryBy: demand.deliveryBy || new Date(Date.now() + 14 * 86400000).toISOString() });
      setMessage(`${saved.cropId} demand published for ${user?.organizationType || 'your buyer account'}. Farmers can now discover it.`);
      await refresh();
    } catch (error) { setMessage(marketplaceErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const placeBid = async lot => {
    const quantity = Number(offerInputs[lot.lotId]?.quantity || Math.min(lot.availableQuantity, 1000));
    const pricePerUnit = Number(offerInputs[lot.lotId]?.price || lot.askingPrice || 0);
    setBusy(true);
    try {
      const saved = await marketplaceApi.placeBid(lot.lotId, { quantity, pricePerUnit, unit: lot.unit, message: offerInputs[lot.lotId]?.message || undefined });
      setMessage(`Bid ${saved.bidId} submitted. Server calculated total: ${money(saved.totalAmount)}.`);
      await refresh();
    } catch (error) { setMessage(marketplaceErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const sendMessage = async bid => {
    const message = messageDrafts[bid.bidId]?.trim();
    if (!message) return;
    try { await marketplaceApi.sendBidMessage(bid.bidId, message); setMessageDrafts(previous => ({ ...previous, [bid.bidId]: '' })); await refresh(); }
    catch (error) { setMessage(marketplaceErrorMessage(error)); }
  };
  const messageIsError = /failed|error|not authenticated|permission|could not|unavailable/i.test(message);
  const card = { background: '#FFFFFF', border: '1px solid #E2E8E0', borderRadius: 14, padding: 18 };
  return <div className="buyer-workspace" style={{ padding: 'clamp(16px, 4vw, 32px)', maxWidth: 1320, margin: '0 auto' }}>
    <div style={{ marginBottom: 24 }}><p style={{ margin: 0, color: '#55705B', fontWeight: 700, fontSize: 13 }}>Buyer workspace · {user?.organizationType || 'buyer'}</p><h1 style={{ margin: '4px 0 8px', fontSize: 'clamp(24px, 4vw, 32px)' }}>{view === 'demand' ? 'Publish procurement demand' : view === 'lots' ? 'Available produce lots' : view === 'offers' ? 'Your bids' : 'Procurement marketplace'}</h1><p style={{ margin: 0, color: '#64748B' }}>Listings, demands, and bids sync through the AgriTrace marketplace.</p></div>
    <MarketplaceContactConsent />
    {message && <div role={messageIsError ? 'alert' : 'status'} style={{ background: messageIsError ? '#FFF1EF' : '#EAF6E7', border: `1px solid ${messageIsError ? '#E5A89F' : '#9BCE95'}`, color: messageIsError ? '#8B2F25' : '#215A27', padding: 12, borderRadius: 10, marginBottom: 16 }}>{message}</div>}
    {(view === 'overview' || view === 'lots') && <><div style={{ display: 'flex', gap: 12, marginBottom: 16 }}><div style={card}><ClipboardList size={20}/><p>Open produce lots</p><strong>{lots.length}</strong></div><div style={card}><Handshake size={20}/><p>Active demands</p><strong>{demands.length}</strong></div></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>{lots.map(lot => <div key={lot.lotId} style={card}><p>{lot.location?.district}, {lot.location?.state} · {lot.status}</p><h2>{lot.cropName}{lot.variety ? ` · ${lot.variety}` : ''}</h2><p>{lot.availableQuantity} {lot.unit} available · {lot.verifiedGrade ? `Verified grade ${lot.verifiedGrade}` : 'No verified grade'}</p><strong>{money(lot.askingPrice)}/{lot.priceUnit || lot.unit}</strong><label>Quantity ({lot.unit})<input type="number" min="0.01" max={lot.availableQuantity} value={offerInputs[lot.lotId]?.quantity ?? Math.min(lot.availableQuantity, 1000)} onChange={e => setOfferInputs({ ...offerInputs, [lot.lotId]: { ...offerInputs[lot.lotId], quantity: e.target.value } })}/></label><label>Offer per {lot.unit}<input type="number" min="0.01" step="any" value={offerInputs[lot.lotId]?.price ?? lot.askingPrice ?? ''} onChange={e => setOfferInputs({ ...offerInputs, [lot.lotId]: { ...offerInputs[lot.lotId], price: e.target.value } })}/></label><label>Message to farmer (optional)<textarea maxLength={500} value={offerInputs[lot.lotId]?.message || ''} onChange={e => setOfferInputs({ ...offerInputs, [lot.lotId]: { ...offerInputs[lot.lotId], message: e.target.value } })} placeholder="Delivery timing, collection, or other offer details"/></label><p>Estimated total {money(Number(offerInputs[lot.lotId]?.quantity ?? Math.min(lot.availableQuantity, 1000)) * Number(offerInputs[lot.lotId]?.price ?? lot.askingPrice ?? 0))}</p><button className="btn-primary" disabled={busy} onClick={() => placeBid(lot)}>Place partial or full bid</button></div>)}{lots.length === 0 && <div style={card}>No open produce lots are listed yet.</div>}</div></>}
    {(view === 'overview' || view === 'demand') && <form onSubmit={postDemand} style={{ ...card, maxWidth: 720, display: 'grid', gap: 12, marginTop: 20 }}><h2 style={{ margin: 0 }}>Publish a buyer demand</h2><label>Crop<select value={demand.cropId} onChange={e => setDemand({ ...demand, cropId: e.target.value })}>{COMMODITIES.filter(c => c.id !== 'WOOL' && c.category !== 'FIBER').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Required quantity<input required type="number" min="0.01" step="any" value={demand.quantity} onChange={e => setDemand({ ...demand, quantity: e.target.value })}/></label><label>Unit<select value={demand.unit} onChange={e => setDemand({ ...demand, unit: e.target.value, priceUnit: `INR/${e.target.value}` })}>{Object.entries(unitMap).map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Maximum price ({demand.priceUnit})<input required min="0.01" type="number" step="any" value={demand.maxPrice} onChange={e => setDemand({ ...demand, maxPrice: e.target.value })}/></label><label>Minimum grade<select value={demand.grade} onChange={e => setDemand({ ...demand, grade: e.target.value })}><option>A+</option><option>A</option><option>B</option></select></label><label>Delivery district, state<input required placeholder="Kota, Rajasthan" value={demand.location} onChange={e => setDemand({ ...demand, location: e.target.value })}/></label><label>Delivery by<input type="date" value={demand.deliveryBy} onChange={e => setDemand({ ...demand, deliveryBy: e.target.value ? new Date(`${e.target.value}T23:59:00`).toISOString() : '' })}/></label><button className="btn-primary" disabled={busy}><Plus size={16}/>Publish demand</button></form>}
    {(view === 'overview' || view === 'offers') && <section style={{ ...card, marginTop: 20 }}><h2>Your buyer bids</h2>{bids.length ? bids.map(bid => <div key={bid.bidId} style={{ borderTop: '1px solid #E2E8E0', padding: '12px 0' }}><strong>{bid.lotId}</strong> · {bid.quantity} {bid.unit} at {money(bid.pricePerUnit)}/{bid.unit} · {bid.status} · total {money(bid.totalAmount)}{bid.message && <p>Offer note: {bid.message}</p>}{(bid.messages || []).map((item, index) => <p key={`${bid.bidId}-${index}`}><strong>{item.senderId === user?.id ? 'You' : 'Farmer'}:</strong> {item.body}</p>)}{bid.counterparty && <p>Farmer contact: {bid.counterparty.name} · <a href={`mailto:${bid.counterparty.email}`}>{bid.counterparty.email}</a>{bid.counterparty.mobile && <> · <a href={`tel:${bid.counterparty.mobile}`}>{bid.counterparty.mobile}</a></>}</p>}<div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input aria-label={`Message for bid ${bid.bidId}`} maxLength={500} value={messageDrafts[bid.bidId] || ''} onChange={e => setMessageDrafts({ ...messageDrafts, [bid.bidId]: e.target.value })} placeholder="Message the farmer"/><button type="button" className="btn-secondary" onClick={() => sendMessage(bid)}>Send</button></div></div>) : <p>No bids placed yet.</p>}</section>}
  </div>;
}
