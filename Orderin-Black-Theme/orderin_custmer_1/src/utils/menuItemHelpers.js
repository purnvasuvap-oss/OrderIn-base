// Shared interpretation of menu-item Firestore fields, used by the pre-login
// public flipbook menu (src/publicMenu/*). Additive — Menu.jsx keeps its own
// inline logic untouched; this is a new shared module, not a refactor of it.

export const normalizeToken = (s) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");

export const isNonVegToken = (t) => {
  if (!t) return false;
  return t.includes("nonveg") || t.includes("nonveget");
};

export const isVegToken = (t) => {
  if (!t) return false;
  if (isNonVegToken(t)) return false;
  return t.includes("veg") || t.includes("veget");
};

export const getDietType = (item) => {
  const token = normalizeToken(item.type || item.tags || "");
  if (isNonVegToken(token)) return "nonveg";
  if (isVegToken(token)) return "veg";
  return null;
};

export const isBestseller = (item) => {
  if (!item) return false;
  if (item.bestseller === true || item.isBestseller === true) return true;
  return normalizeToken(item.tags || "").includes("bestseller");
};

export const getSpiceLevel = (item) => {
  if (!item) return 0;
  if (typeof item.spiceLevel === "number") return Math.max(0, Math.min(3, item.spiceLevel));
  if (item.spicy === true) return 2;
  const tags = normalizeToken(item.tags || "") + normalizeToken(item.type || "");
  if (tags.includes("extraspicy") || tags.includes("veryspicy")) return 3;
  if (tags.includes("spicy")) return 2;
  if (tags.includes("mild")) return 1;
  return 0;
};

export const isUnavailableStatus = (status) => {
  if (status == null) return false;
  try {
    const norm = String(status).toLowerCase().trim();
    const key = norm.replace(/[^a-z0-9]/g, "");
    const unavailable = new Set(["no", "low", "soldout", "unavailable", "outofstock", "false", "0", "sold"]);
    return unavailable.has(key);
  } catch (e) {
    return false;
  }
};

// Convenience wrapper: reads the availability field off an item using the
// same fallback chain (availability | status | availabilty typo) Menu.jsx uses.
export const isItemUnavailable = (item) =>
  isUnavailableStatus(item?.availability ?? item?.status ?? item?.availabilty);

export const isOnPromotion = (item) => {
  if (!item) return false;
  const keys = ["promotions", "promotion", "onPromotion", "promo", "promotionStatus", "promotion_flag"];
  for (const k of keys) {
    const v = item[k];
    if (v == null) continue;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.toLowerCase().trim();
      if (["true", "1", "yes", "on"].includes(s)) return true;
    }
  }
  return false;
};

export const parsePrice = (priceStr) => {
  const s = String(priceStr || "");
  const num = parseFloat(s.replace(/[^0-9.\-]/g, "")) || 0;
  return { value: num, symbol: "₹" };
};

// Category list in first-seen order (matches Firestore getDocs return order —
// there's no explicit sort field on menu items), case-insensitively deduped.
export const deriveCategoryList = (items, { includeAll = true } = {}) => {
  const seen = new Set();
  const list = includeAll ? ["all"] : [];
  items.forEach((it) => {
    if (it.category) {
      const lower = it.category.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(it.category);
      }
    }
  });
  return list;
};

// Buckets items by their `category` field, in first-seen order, collapsing
// anything without a category into "Uncategorized". Returns
// [{ category, items }, ...] instead of a Map so callers can .map() directly.
export const groupItemsByCategory = (items) => {
  const order = [];
  const buckets = new Map();
  items.forEach((item) => {
    const cat = (item.category || "").trim() || "Uncategorized";
    if (!buckets.has(cat)) {
      buckets.set(cat, []);
      order.push(cat);
    }
    buckets.get(cat).push(item);
  });
  return order.map((cat) => ({ category: cat, items: buckets.get(cat) }));
};
