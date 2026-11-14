/**
 * Crop marketplace view models. These shapes are the UI boundary for the
 * marketplace and can be backed by PRD 2 endpoints when those routes land.
 * Fixtures are explicitly demo data; they are never presented as live AI.
 */
export const MARKET_DATA_MODE = 'demo';
const UNIT_KG = { KG: 1, KILOGRAM: 1, QUINTAL: 100, TONNE: 1000, 'BAG (50KG)': 50, 'CRATE (25KG)': 25, 'BOX (20KG)': 20, 'BALE (170KG)': 170, 'BALE (100KG)': 100 };
export const unitKgFactor = unit => UNIT_KG[String(unit || 'KG').toUpperCase()] || 1;
export const quantityInKg = (quantity, unit) => Number(quantity || 0) * unitKgFactor(unit);
export const pricePerKg = (price, unit) => Number(price || 0) / unitKgFactor(unit);

export const QUALITY_STATES = Object.freeze({
  UPLOADING: 'Uploading',
  ASSESSING: 'Assessing',
  REVIEW_REQUIRED: 'Review required',
  PROVISIONAL: 'Provisional grade',
  VERIFIED: 'Verified grade',
  UNAVAILABLE: 'Unavailable'
});

export function normalizeProduceLot(lot) {
  const sourceAssessment = lot.qualityAssessment || {};
  const attributes = Array.isArray(sourceAssessment.attributes)
    ? sourceAssessment.attributes
    : Object.entries(sourceAssessment.attributes || {}).map(([label, value]) => ({ label, value }));
  const warnings = Array.isArray(sourceAssessment.warnings)
    ? sourceAssessment.warnings
    : sourceAssessment.warnings ? [sourceAssessment.warnings] : [];
  return {
    ...lot,
    id: lot.id,
    cropId: lot.cropId,
    cropName: lot.cropName,
    variety: lot.variety || '',
    unit: lot.unit || 'kg',
    totalQuantity: Number(lot.totalQuantity || 0),
    availableQuantity: Number(lot.availableQuantity ?? lot.totalQuantity ?? 0),
    harvestDate: lot.harvestDate || null,
    location: lot.location || lot.origin || '',
    photoReferences: Array.isArray(lot.photoReferences) ? lot.photoReferences : [],
    provisionalGrade: lot.qualityAssessment?.provisionalGrade || null,
    verifiedGrade: lot.qualityAssessment?.verifiedGrade || null,
    qualityAssessment: { ...sourceAssessment, attributes, warnings, status: sourceAssessment.status || QUALITY_STATES.UNAVAILABLE },
    askingPrice: Number(lot.askingPrice || 0),
    status: lot.status || 'AVAILABLE'
  };
}

export const DEMO_MARKET_CONTEXT = Object.freeze({
  isDemo: true,
  source: 'Illustrative marketplace fixture',
  updatedAt: '2026-11-14T00:00:00.000Z',
  confidence: null,
  confidenceLabel: 'No calibrated forecast confidence supplied',
  drivers: ['Illustrative crop price baseline', 'Transport estimate', 'Storage estimate']
});
