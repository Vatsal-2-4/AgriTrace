import { quantityInKg, pricePerKg } from './marketContracts.js';

/**
 * Crop-Agnostic Farmer ↔ Buyer Matching Engine
 * SIH 2026 PS 26132 - Multi-Commodity Algorithmic Compatibility with Explainability
 */

export function calculateMatchScore(lotOrBatch, buyerDemand) {
  let score = 0;
  const breakdown = [];
  const warnings = [];

  const lotCrop = (lotOrBatch.cropId || lotOrBatch.cropName || lotOrBatch.woolType || '').toUpperCase();
  const demandedCrop = (buyerDemand.cropId || buyerDemand.cropName || buyerDemand.woolType || buyerDemand.commodity || '').toUpperCase();

  // 1. Commodity & Quality Compatibility (30%)
  let qualityPts = 0;
  if (!demandedCrop || demandedCrop === 'ALL' || lotCrop.includes(demandedCrop) || demandedCrop.includes(lotCrop)) {
    qualityPts += 15;
    breakdown.push('Commodity type (' + (lotOrBatch.cropName || lotOrBatch.woolType || 'Produce') + ') aligns with buyer procurement requirement.');
  } else {
    warnings.push('Crop type differs from buyer demand specification.');
  }

  const lotGrade = lotOrBatch.qualityAssessment?.verifiedGrade || lotOrBatch.qualityAssessment?.provisionalGrade || lotOrBatch.qualityGrade || lotOrBatch.grade || null;
  const demandedGrade = buyerDemand.minGrade || buyerDemand.requiredGrade || buyerDemand.grade || null;

  if (!lotGrade || !demandedGrade) {
    qualityPts += 6;
    warnings.push(!lotGrade ? 'Lot has no provisional or inspector verified grade yet.' : 'Buyer has not specified a minimum grade.');
  } else if (lotGrade === demandedGrade) {
    qualityPts += 15;
    breakdown.push('Quality grade exactly matches required Grade ' + demandedGrade + ' (100% grade match).');
  } else if ((lotGrade === 'A+' && demandedGrade === 'A') || (lotGrade === 'A' && demandedGrade === 'B')) {
    qualityPts += 13;
    breakdown.push('Quality grade (' + lotGrade + ') exceeds minimum requested grade (' + demandedGrade + ').');
  } else {
    qualityPts += 6;
    warnings.push('Lot is Grade ' + lotGrade + ', buyer requested Grade ' + demandedGrade + '.');
  }
  score += qualityPts;

  // 2. Quantity & FPO Aggregation (20%)
  const lotQty = Number(lotOrBatch.availableQuantity ?? lotOrBatch.quantity ?? lotOrBatch.quantityKg ?? 0);
  const lotQtyKg = quantityInKg(lotQty, lotOrBatch.unit);
  const demandQty = Number(buyerDemand.quantityRequired ?? buyerDemand.minQuantity ?? 0);
  const demandQtyKg = quantityInKg(demandQty, buyerDemand.unit);
  const minRequired = buyerDemand.minQuantity ? quantityInKg(buyerDemand.minQuantity, buyerDemand.unit) : (demandQtyKg ? demandQtyKg * 0.3 : 100);
  const maxRequired = buyerDemand.maxQuantity ? quantityInKg(buyerDemand.maxQuantity, buyerDemand.unit) : (demandQtyKg ? demandQtyKg * 1.5 : 10000);

  let quantityPts = 0;
  if (lotQtyKg >= minRequired && lotQtyKg <= maxRequired) {
    quantityPts = 20;
    breakdown.push('Available lot quantity (' + lotQty + ' ' + (lotOrBatch.unit || 'KG') + ') meets buyer procurement lot requirement.');
  } else if (lotQtyKg < minRequired) {
    const ratio = Math.max(0.3, lotQtyKg / minRequired);
    quantityPts = Math.round(20 * ratio);
    warnings.push('Lot (' + lotQty + ' ' + (lotOrBatch.unit || 'KG') + ') is below the buyer minimum (' + minRequired.toLocaleString('en-IN') + ' kg after unit conversion). Consider FPO aggregation.');
  } else {
    quantityPts = 17;
    breakdown.push('Lot (' + lotQty + ' ' + (lotOrBatch.unit || 'KG') + ') can fulfill buyer demand with partial dispatch.');
  }
  score += quantityPts;

  // 3. Location & Freight Corridor (15%)
  const buyerLocation = buyerDemand.deliveryLocation || buyerDemand.location || '';
  const lotLocation = lotOrBatch.origin || lotOrBatch.location || '';
  const isSameRegion = buyerLocation.toLowerCase().includes('punjab') && lotLocation.toLowerCase().includes('punjab') ||
                       buyerLocation.toLowerCase().includes('karnataka') && lotLocation.toLowerCase().includes('karnataka') ||
                       buyerLocation.toLowerCase().includes('maharashtra') && lotLocation.toLowerCase().includes('maharashtra') ||
                       buyerLocation.toLowerCase().includes('rajasthan') && lotLocation.toLowerCase().includes('rajasthan') ||
                       buyerLocation.toLowerCase().includes('himachal') && lotLocation.toLowerCase().includes('himachal') ||
                       buyerLocation.toLowerCase().includes('gujarat') && lotLocation.toLowerCase().includes('gujarat');

  let locationPts = 0;
  if (isSameRegion) {
    locationPts = 15;
    breakdown.push('Intra-state logistics corridor minimizes freight lead time and transit expenses.');
  } else {
    locationPts = 10;
    breakdown.push('Delivery location differs; confirm freight cost and transit time with the buyer.');
  }
  score += locationPts;

  // 4. Price Compatibility (20%)
  const targetPrice = pricePerKg(lotOrBatch.askingPrice || lotOrBatch.targetPrice || 30, lotOrBatch.unit);
  const buyerMaxPrice = buyerDemand.maxPricePerKg || pricePerKg(buyerDemand.maxPrice || buyerDemand.budgetPrice || (targetPrice * 1.1), buyerDemand.unit);
  const buyerMinPrice = buyerDemand.minPricePerKg || (buyerDemand.minPrice ? pricePerKg(buyerDemand.minPrice, buyerDemand.unit) : buyerMaxPrice * 0.85);

  let pricePts = 0;
  if (targetPrice <= buyerMaxPrice && targetPrice >= buyerMinPrice) {
    pricePts = 20;
    breakdown.push('Asking price (₹' + targetPrice.toFixed(2) + '/kg) fits the buyer budget (₹' + buyerMinPrice.toFixed(2) + '–₹' + buyerMaxPrice.toFixed(2) + '/kg; both prices converted from their stated units).');
  } else if (targetPrice < buyerMinPrice) {
    pricePts = 20;
    breakdown.push('Farmer asking price is highly competitive for buyer procurement team.');
  } else {
    const diffPct = ((targetPrice - buyerMaxPrice) / buyerMaxPrice) * 100;
    if (diffPct <= 8) {
      pricePts = 14;
      breakdown.push('Price difference is within negotiable margin (~' + diffPct.toFixed(1) + '%).');
    } else {
      pricePts = 6;
      warnings.push('Asking price (₹' + targetPrice.toFixed(2) + '/kg after unit conversion) is ' + diffPct.toFixed(1) + '% above buyer indicative budget.');
    }
  }
  score += pricePts;

  // 5. Delivery Timing & Reliability (15%)
  let timingPts = 15;
  if (buyerDemand.deliveryWindowDays) {
    breakdown.push('Delivery window (' + buyerDemand.deliveryWindowDays + ' days) compatible with instant dispatch.');
  } else {
    breakdown.push('Standard delivery schedule approved.');
  }
  score += timingPts;

  const totalScore = Math.min(100, Math.max(0, score));

  return {
    score: totalScore,
    matchTier: totalScore >= 85 ? 'HIGH_MATCH' : totalScore >= 65 ? 'MEDIUM_MATCH' : 'LOW_MATCH',
    breakdown,
    components: { cropAndQuality: qualityPts, quantity: quantityPts, location: locationPts, price: pricePts, delivery: timingPts },
    warnings,
    summary: totalScore >= 85
      ? 'Strong commercial compatibility across quality specifications, pricing bracket, and logistics corridor.'
      : totalScore >= 65
      ? 'Good commercial match with slight negotiation or volume aggregation needed.'
      : 'Partial compatibility; consider counter-offering or aggregating with other farmer batches.'
  };
}

export function findMatchingBuyers(lotOrBatch, buyersList = []) {
  return buyersList
    .map(buyer => {
      const matchResult = calculateMatchScore(lotOrBatch, buyer);
      return {
        ...buyer,
        matchResult
      };
    })
    .sort((a, b) => b.matchResult.score - a.matchResult.score);
}
