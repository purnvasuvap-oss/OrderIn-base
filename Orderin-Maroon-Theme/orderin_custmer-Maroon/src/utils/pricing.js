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
export const getDefaultsForCategory = () => [];

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
export const portionSurcharge = (basePrice, selectedOptions = []) => {
  const base = parsePriceValue(basePrice);
  let extra = 0;
  for (const opt of selectedOptions) {
    const label = String(opt?.label || opt?.name || '').toLowerCase();
    if (Number(opt?.price) > 0) continue;
    if (label === 'extra large') extra += base;
    else if (label === 'large') extra += base * 0.5;
  }
  return Math.round((extra + Number.EPSILON) * 100) / 100;
};

// Dine-in only: no packing fee and no made-up savings. GST is 5%.
export const calculateOrderTotals = (
  subtotal,
  { taxRate = 0.05 } = {},
) => {
  const gst = Math.round((subtotal * taxRate + Number.EPSILON) * 100) / 100;
  const total = Math.round((subtotal + gst + Number.EPSILON) * 100) / 100;
  return { subtotal, gst, packing: 0, discount: 0, total };
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
