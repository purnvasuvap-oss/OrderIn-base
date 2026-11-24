// src/utils/expiryOffers.js
// Pure helpers that link menu dishes to inventory through each dish's
// `ingredients` list:
//   - which dishes use stock that is about to expire (and what offer to suggest)
//   - how much stock an order uses, for automatic inventory deduction
//   - whether a dish's expiry offer is still running
//
// A dish's ingredients live in its `recipe` field: what ONE portion uses,
// in each inventory item's own unit. Older themes wrote different row shapes,
// and all of them are read here:
//   { itemId, quantity }                       (Dessert)
//   { inventoryItemName, quantity, unit }      (Green)
//   { itemId, inventoryItemName, quantity, unit }  (written by IngredientsEditor)
//   ingredients: [{ name, qty, unit }]         (accepted too)

import { toDate } from "./expiryRules";

export const normalizeName = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

export const parseMoney = (value) => {
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const rowName = (row) => String(row?.inventoryItemName || row?.name || row?.itemId || "").trim();
const rowQty = (row) => Number(row?.quantity ?? row?.qty);

/** A dish's ingredients from `recipe` and/or `ingredients`, cleaned. */
export const getDishIngredients = (dish) =>
  sanitizeIngredients([...(Array.isArray(dish?.recipe) ? dish.recipe : []), ...(Array.isArray(dish?.ingredients) ? dish.ingredients : [])]);

/** Rows to store in `recipe`, readable by every theme's code. */
export const toRecipeRows = (list) =>
  sanitizeIngredients(list).map((r) => ({ itemId: r.name, inventoryItemName: r.name, quantity: r.qty, unit: r.unit }));

/** Clean an ingredient list (any row shape): drop blank rows, merge duplicates. */
export const sanitizeIngredients = (list) => {
  const merged = new Map();
  (Array.isArray(list) ? list : []).forEach((row) => {
    const name = rowName(row);
    const qty = rowQty(row);
    if (!name || !Number.isFinite(qty) || qty <= 0) return;
    const key = normalizeName(name);
    const prev = merged.get(key);
    if (prev) prev.qty = Math.round((prev.qty + qty) * 1000) / 1000;
    else merged.set(key, { name, qty: Math.round(qty * 1000) / 1000, unit: String(row?.unit || "").trim() });
  });
  return [...merged.values()];
};

/** Is this dish's expiry offer running right now? */
export const isOfferActive = (menuItem, now = new Date()) => {
  const offer = menuItem?.offer;
  if (!offer || offer.active === false) return false;
  const endsAt = toDate(offer.endsAt);
  return !!endsAt && endsAt.getTime() > now.getTime();
};

/** Offer whose time is up but whose price was not put back yet. */
export const isOfferExpired = (menuItem, now = new Date()) => {
  const offer = menuItem?.offer;
  if (!offer) return false;
  const endsAt = toDate(offer.endsAt);
  return !endsAt || endsAt.getTime() <= now.getTime() || offer.active === false;
};

/** Suggested discount: more urgent stock and more expiring ingredients, bigger cut. */
export const suggestDiscountPercent = (hoursLeft, matchedCount = 1) => {
  let pct = 20;
  if (hoursLeft <= 24) pct = 40;
  else if (hoursLeft <= 72) pct = 30;
  pct += Math.max(0, matchedCount - 1) * 5;
  return Math.min(50, pct);
};

export const applyPercent = (price, percent) => {
  const p = Math.min(90, Math.max(0, Number(percent) || 0));
  return Math.max(0, Math.round(parseMoney(price) * (1 - p / 100)));
};

export const percentFromPrices = (original, offer) => {
  const o = parseMoney(original);
  const n = parseMoney(offer);
  if (!o || n >= o) return 0;
  return Math.round(((o - n) / o) * 100);
};

/**
 * Rank dishes that use expiring stock.
 *
 * expiringBatches: output of collectExpiringBatches() — batches with
 *   { itemName, remainingQty, unit, expiryState: { useBefore, msLeft } }
 * menuItems: menu docs, each with `ingredients`.
 *
 * Order: dishes that use MORE expiring ingredients first (a milk + tomato dish
 * beats a milk-only dish when both are expiring), then the most urgent stock,
 * then the higher-priced dish.
 */
export const rankDishesForExpiringStock = (expiringBatches = [], menuItems = [], now = new Date()) => {
  const expiring = new Map();
  expiringBatches.forEach((b) => {
    const key = normalizeName(b.itemName);
    const hoursLeft = Math.max(0, (b.expiryState?.msLeft ?? 0) / 3600000);
    const prev = expiring.get(key);
    if (!prev) {
      expiring.set(key, {
        itemName: b.itemName,
        hoursLeft,
        useBefore: b.expiryState?.useBefore || null,
        qty: Number(b.remainingQty) || 0,
        unit: b.unit || "",
      });
    } else {
      prev.qty += Number(b.remainingQty) || 0;
      if (hoursLeft < prev.hoursLeft) {
        prev.hoursLeft = hoursLeft;
        prev.useBefore = b.expiryState?.useBefore || prev.useBefore;
      }
    }
  });
  if (expiring.size === 0) return [];

  const ranked = [];
  (menuItems || []).forEach((dish) => {
    const ingredients = getDishIngredients(dish);
    if (ingredients.length === 0) return;
    const matched = ingredients
      .filter((ing) => expiring.has(normalizeName(ing.name)))
      .map((ing) => ({ ...expiring.get(normalizeName(ing.name)), perPortion: ing.qty }));
    if (matched.length === 0) return;

    const minHoursLeft = Math.min(...matched.map((m) => m.hoursLeft));
    const onOffer = isOfferActive(dish, now);
    const basePrice = onOffer ? parseMoney(dish.offer.originalPrice) : parseMoney(dish.price);
    const percent = suggestDiscountPercent(minHoursLeft, matched.length);
    ranked.push({
      dish,
      matched,
      isCombo: matched.length >= 2,
      minHoursLeft,
      onOffer,
      originalPrice: basePrice,
      suggestedPercent: percent,
      suggestedPrice: applyPercent(basePrice, percent),
    });
  });

  return ranked.sort(
    (a, b) =>
      b.matched.length - a.matched.length ||
      a.minHoursLeft - b.minHoursLeft ||
      b.originalPrice - a.originalPrice
  );
};

/**
 * Total stock an order uses, keyed by normalised inventory name.
 * orderItems: [{ id?, name, quantity | qty }]
 * Menu dishes are matched by id first, then by name.
 */
export const computeIngredientUsage = (orderItems = [], menuItems = []) => {
  const byId = new Map();
  const byName = new Map();
  (menuItems || []).forEach((m) => {
    if (m.id) byId.set(String(m.id), m);
    if (m.name) byName.set(normalizeName(m.name), m);
  });

  const usage = new Map();
  const unmatchedDishes = [];
  (orderItems || []).forEach((line) => {
    const portions = Number(line.quantity ?? line.qty ?? 1) || 1;
    const dish = (line.id && byId.get(String(line.id))) || byName.get(normalizeName(line.name));
    if (!dish) {
      if (line.name) unmatchedDishes.push(line.name);
      return;
    }
    getDishIngredients(dish).forEach((ing) => {
      const key = normalizeName(ing.name);
      const prev = usage.get(key) || { name: ing.name, qty: 0, unit: ing.unit };
      prev.qty = Math.round((prev.qty + ing.qty * portions) * 1000) / 1000;
      usage.set(key, prev);
    });
  });

  return { usage: [...usage.values()], unmatchedDishes };
};

/** Order statuses after which the kitchen has used the ingredients. */
const CONSUMING_STATUSES = new Set(["preparing", "ready", "served", "delivered", "completed", "done"]);

export const isConsumingStatus = (status) => CONSUMING_STATUSES.has(normalizeName(status));

/** Text used on the auto-created one-day promotion. */
export const buildOfferPromotionText = ({ dishName, originalPrice, offerPrice, percent }) => {
  const o = Math.round(parseMoney(originalPrice));
  const n = Math.round(parseMoney(offerPrice));
  const pct = percent || percentFromPrices(o, n);
  return {
    caption: `${dishName} is now on special offer — ${pct}% off`,
    description: `It's no longer ₹${o}, it's only ₹${n}. Today only, while stock lasts.`,
  };
};
