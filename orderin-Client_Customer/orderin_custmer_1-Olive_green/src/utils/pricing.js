export const parsePriceValue = (value) =>
  parseFloat(String(value ?? "").replace(/[^0-9.\-]/g, "")) || 0;

// Normalizes one raw customization option (string | {name,price} | legacy {label}) for internal use.
export const normalizeOption = (opt) => {
  if (typeof opt === "string") return { label: opt, price: 0 };
  return { label: opt.name ?? opt.label ?? "", price: parsePriceValue(opt.price) };
};

export const normalizeGroupOptions = (options) =>
  Array.isArray(options) ? options.map(normalizeOption) : [];

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
