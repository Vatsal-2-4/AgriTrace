import React from 'react';
import { Layers, Users, PlusCircle } from 'lucide-react';
import { normalizeProduceLot } from '../../../services/market/marketContracts';

export default function MyLotsTab({ woolLots, onOpenFpoAggregator, onOpenCreateLot }) {
  const cropLots = (woolLots || []).filter(lot => lot.cropId && lot.cropId !== 'WOOL').map(normalizeProduceLot);
  return (
    <div>
      <div className="market-card" style={{ marginBottom: '24px' }}>
        <div className="panel-header-row">
          <h3 className="panel-title">
            <Layers size={20} />
            Produce lots & FPO aggregation
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={onOpenFpoAggregator}>
              <Users size={16} style={{ marginRight: '6px' }} />
              <span>Aggregate FPO lots</span>
            </button>
            <button className="btn-primary" onClick={() => onOpenCreateLot(450)}>
              <PlusCircle size={16} style={{ marginRight: '6px' }} />
              <span>Create sell lot</span>
            </button>
          </div>
        </div>

        <div className="wt-table-wrapper">
          <table className="wt-data-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Seller</th>
                <th>Crop / variety</th>
                <th>Quality assessment</th>
                <th>Total quantity</th>
                <th>Available</th>
                <th>Asking price</th>
                <th>Photos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cropLots.map(lot => (
                <tr key={lot.id}>
                  <td>
                    <strong>{lot.lotNumber}</strong>
                    {lot.isFpoAggregate && (
                      <span style={{ marginLeft: '6px', background: '#DDFF86', color: '#0B120D', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                        FPO BULK
                      </span>
                    )}
                  </td>
                  <td>{lot.sellerName || lot.farmerName || 'You'}{lot.sellerType ? ` (${lot.sellerType})` : ''}</td>
                  <td>{lot.cropName || lot.cropId}{lot.variety ? ` · ${lot.variety}` : ''}</td>
                  <td>
                    {lot.qualityAssessment?.verifiedGrade ? <strong>Inspector verified: {lot.qualityAssessment.verifiedGrade}</strong>
                      : lot.qualityAssessment?.provisionalGrade ? <strong>Provisional AI grade: {lot.qualityAssessment.provisionalGrade}</strong>
                        : <strong>{lot.qualityAssessment?.status || 'Unavailable'} · No grade</strong>}
                    {lot.qualityAssessment?.confidenceCalibrated && Number.isFinite(lot.qualityAssessment.confidence) && <div>{Math.round(lot.qualityAssessment.confidence <= 1 ? lot.qualityAssessment.confidence * 100 : lot.qualityAssessment.confidence)}% confidence</div>}
                    {lot.qualityAssessment?.inspectorVerification && <div>Inspector: {lot.qualityAssessment.inspectorVerification}</div>}
                    {(lot.qualityAssessment?.attributes?.length > 0 || lot.qualityAssessment?.warnings?.length > 0 || lot.qualityAssessment?.modelVersion || lot.qualityAssessment?.assessedAt) && <details><summary>Assessment evidence</summary>
                      {lot.qualityAssessment.attributes?.map((item, index) => <div key={`attribute-${index}`}>{item.label || item.name}: {item.value}</div>)}
                      {lot.qualityAssessment.warnings?.map((warning, index) => <div key={`warning-${index}`}>Warning: {warning}</div>)}
                      {lot.qualityAssessment.modelVersion && <div>Model: {lot.qualityAssessment.modelVersion}</div>}
                      {lot.qualityAssessment.assessedAt && <div>Assessed: {new Date(lot.qualityAssessment.assessedAt).toLocaleString('en-IN')}</div>}
                    </details>}
                  </td>
                  <td>{lot.totalQuantity} {lot.unit || 'KG'}</td>
                  <td><strong>{lot.availableQuantity} {lot.unit || 'KG'}</strong></td>
                  <td style={{ color: '#0B120D', fontWeight: '700' }}>₹{lot.askingPrice}/{lot.unit || 'KG'}</td>
                  <td>
                    {lot.photoReferences?.length || 0} attached
                  </td>
                  <td>
                    <span style={{
                      background: lot.status === 'AVAILABLE' ? '#DDFF86' : lot.status === 'OFFER_RECEIVED' ? '#EDEDCE' : '#BED5E5',
                      color: '#0B120D', padding: '3px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '11px'
                    }}>
                      {lot.status}
                    </span>
                  </td>
                </tr>
              ))}
              {cropLots.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: 28, color: '#64748B' }}>No crop lots yet. Create a lot to see quantity, location and assessment details here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
