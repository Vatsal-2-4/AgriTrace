import React, { useState } from 'react';
import { useAuth } from '../../context/useAuth.js';
import { marketplaceApi, marketplaceErrorMessage } from '../../services/market/marketplaceApi';

export default function MarketplaceContactConsent() {
  const { user, updateMarketContactConsent } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = user?.marketContactConsent === true;
  const update = async event => {
    const nextValue = event.target.checked;
    setBusy(true); setError('');
    try {
      const result = await marketplaceApi.setContactConsent(nextValue);
      updateMarketContactConsent(result.marketContactConsent);
    } catch (requestError) { setError(marketplaceErrorMessage(requestError)); }
    finally { setBusy(false); }
  };
  return <div style={{ border: '1px solid #D7E4D3', background: '#F8FCF6', borderRadius: 10, padding: '10px 12px', margin: '12px 0', fontSize: 13 }}>
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><input type="checkbox" checked={enabled} disabled={busy} onChange={update}/><span>Share my name, email, and mobile (if provided) with the other party after a bid is accepted, so we can coordinate fulfilment.</span></label>
    {error && <p role="alert" style={{ color: '#B42318', margin: '6px 0 0' }}>{error}</p>}
  </div>;
}
