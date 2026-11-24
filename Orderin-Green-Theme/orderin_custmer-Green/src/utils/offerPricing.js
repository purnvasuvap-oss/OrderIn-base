// src/utils/offerPricing.js
// Prices for dishes on an expiry offer (set from the staff Inventory page).
//
// While an offer runs, the dish's `price` already holds the reduced price, so
// the cart and checkout charge it with no changes. `offer.originalPrice` is
// the normal price, shown struck through.
//
// If an offer's time is up but staff haven't opened the app since, the price
// in Firestore may still be the reduced one. settleOfferPrice() puts the
// normal price back on the loaded item so nobody is charged an ended offer.

const toMillis = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

const money = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const PROMO_KEYS = ["promotions", "promotion", "onPromotion", "promo", "promotionStatus", "promotion_flag"];
const isFlaggedPromotion = (item) => {
  for (const k of PROMO_KEYS) {
    const v = item?.[k];
    if (v == null) continue;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return ["true", "1", "yes", "on"].includes(v.toLowerCase().trim());
  }
  return false;
};

export const isOfferRunning = (item, now = Date.now()) => {
  const offer = item?.offer;
  if (!offer || offer.active === false) return false;
  return toMillis(offer.endsAt) > now && money(offer.originalPrice) > money(item.price);
};

/** Return the item with its normal price if its offer has ended. */
export const settleOfferPrice = (item, now = Date.now()) => {
  if (!item?.offer || isOfferRunning(item, now)) return item;
  const { offer, ...rest } = item;
  const original = money(offer.originalPrice);
  const charged = money(item.price);
  // Only undo the price the offer set; a price staff changed by hand stays.
  if (original > 0 && charged === money(offer.offerPrice)) {
    return { ...rest, price: String(original) };
  }
  return rest;
};

export const settleMenuItems = (items, now = Date.now()) =>
  Array.isArray(items) ? items.map((it) => settleOfferPrice(it, now)) : items;

/**
 * What to show on a menu card.
 * { value, original, isOffer, percent }: original is null when nothing is
 * struck through. Expiry offers show the real normal price; dishes flagged
 * as promotions keep the existing +25% display.
 */
export const getPriceDisplay = (item, now = Date.now()) => {
  const value = money(item?.price);
  if (isOfferRunning(item, now)) {
    const original = money(item.offer.originalPrice);
    return { value, original, isOffer: true, percent: Math.round(((original - value) / original) * 100) };
  }
  if (isFlaggedPromotion(item)) {
    return { value, original: Math.round(value * 1.25 * 100) / 100, isOffer: false, percent: 20 };
  }
  return { value, original: null, isOffer: false, percent: 0 };
};

/** Old/new price on a promotion (auto expiry-offer promotions carry both). */
export const getPromotionPrices = (promo) => {
  const original = money(promo?.originalPrice);
  const discounted = money(promo?.discountedPrice);
  if (!original || !discounted || discounted >= original) return null;
  return { original, discounted, percent: promo.discountPercent || Math.round(((original - discounted) / original) * 100) };
};
