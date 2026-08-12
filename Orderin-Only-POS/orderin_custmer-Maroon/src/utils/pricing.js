import { usesRoundedCollection, roundTaxForCollection } from "./billing";

export const parsePriceValue = (value) =>
  parseFloat(String(value ?? "").replace(/[^0-9.\-]/g, "")) || 0;

// Normalizes one raw customization option (string | {name,price} | legacy {label}) for internal use.
export const normalizeOption = (opt) => {
  if (typeof opt === "string") return { label: opt, price: 0 };
  return { label: opt.name ?? opt.label ?? "", price: parsePriceValue(opt.price) };
};

export const normalizeGroupOptions = (options) =>
  Array.isArray(options) ? options.map(normalizeOption) : [];

// Default customization groups derived dynamically based on item category.
// Purely preferential (no price impact) — folded into the saved instructions.
export const getDefaultsForCategory = (category) => {
  if (!category) return [{ id: "portion", label: "Portion", options: ["Regular", "Large"] }];
  const cat = String(category).toLowerCase();
  // Beverage / Drink items
  if (/drink|beverage|juice|shake|mocktail|smoothie|soda|cola|tea|coffee|water|soft drink|cold drink|milkshake/.test(cat)) {
    return [
      { id: "size", label: "Size", options: ["Regular", "Large", "Extra Large"] },
      { id: "ice", label: "Ice Level", options: ["No Ice", "Less Ice", "Regular Ice", "Extra Ice"] },
      { id: "sweetness", label: "Sweetness", options: ["No Sugar", "Less Sweet", "Regular", "Extra Sweet"] },
    ];
  }
  // Food items
  if (/food|starter|appetizer|main|main course|entree|curry|rice|bread|roti|naan|biryani|fried rice|noodles|pasta|pizza|burger|sandwich|wrap|roll|taco|burrito|dosa|idli|vada|pongal|upma|chowmein/.test(cat)) {
    return [
      { id: "spice", label: "Spice Level", options: ["Mild", "Medium", "Hot"] },
      { id: "portion", label: "Portion", options: ["Regular", "Large"] },
    ];
  }
  // Desserts
  if (/dessert|ice cream|cake|pastry|sweet|halwa|kheer|pudding|mousse|brownie|cookie/.test(cat)) {
    return [
      { id: "portion", label: "Portion", options: ["Regular", "Large"] },
    ];
  }
  // Default fallback
  return [{ id: "portion", label: "Portion", options: ["Regular", "Large"] }];
};

// item.customizations if present/non-empty, else the category-based fallback groups (always price 0).
export const getCustomizationGroups = (item, getDefaultsForCategory) =>
  item?.customizations && Array.isArray(item.customizations) && item.customizations.length
    ? item.customizations
    : getDefaultsForCategory(item?.category);

// customSelections: { [groupId]: selectedOptionLabel } -> [{ group, label, price }]
export const buildSelectedOptions = (groups, customSelections) =>
  (groups || [])
    .map((g) => {
      const opt = normalizeGroupOptions(g.options).find(
        (o) => o.label === customSelections[g.id],
      );
      return opt ? { group: g.label, label: opt.label, price: opt.price } : null;
    })
    .filter(Boolean);

export const sumOptionPrices = (selectedOptions = []) =>
  selectedOptions.reduce((sum, o) => sum + (o.price || 0), 0);

// Cart line identity: same name + same selections = same line; different selections = different line.
export const buildCartKey = (name, selectedOptions = []) => {
  const key = selectedOptions.map((o) => `${o.group}:${o.label}`).join("|");
  return key ? `${name}__${key}` : name;
};

// Shared total formula used by both the on-screen cart summary and the persisted Firestore order.
export const calculateOrderTotals = (
  subtotal,
  { taxRate = 0.05, packingFee = 30, discountRate = 0.08, discountCap = 60 } = {},
) => {
  const gst = subtotal * taxRate;
  const packing = subtotal > 0 ? packingFee : 0;
  const discount = subtotal > 0 ? Math.min(discountCap, Math.round(subtotal * discountRate)) : 0;
  return { subtotal, gst, packing, discount, total: subtotal + gst + packing - discount };
};

// The ONE function both order creation (Cart.jsx, before a payment method is
// known) and payment-method-aware recalculation (Payments.jsx) must use for
// the order's committed monetary fields. Payments.jsx previously recomputed
// totals with billing.js's calculateBilling instead, which only applies GST
// (no packing fee, no discount) — that silently dropped the packing
// fee/discount the customer saw on Cart from the amount actually saved to
// Firestore and charged. This wraps calculateOrderTotals (so packing fee and
// discount are always included) and additionally applies billing.js's
// nearest-rupee GST rounding for Cash/Card collection, preserving that
// existing behavior for those payment methods.
export const calculateFinalBilling = (subtotal, paymentMethod) => {
  const { gst, packing, discount } = calculateOrderTotals(subtotal);
  const taxes = usesRoundedCollection(paymentMethod) ? roundTaxForCollection(gst) : gst;
  return { subtotal, taxes, packing, discount, total: subtotal + taxes + packing - discount };
};
