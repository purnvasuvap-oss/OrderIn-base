const DEFAULT_TAX = { cgstRate: 2.5, sgstRate: 2.5, sac: '996331' };

function roundRupees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseRupees(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function optionName(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt;
  return String(opt.name || opt.label || opt.value || '');
}

function portionOf(selection = {}) {
  const parts = [selection.size, selection.portion];
  const options = [].concat(selection.options || [], selection.selectedOptions || []);
  options.forEach((opt) => parts.push(optionName(opt)));
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  if (/extra\s*large/.test(text)) return 'extraLarge';
  if (/\blarge\b/.test(text)) return 'large';
  return 'regular';
}

function addonTotal(menuItem, selection) {
  const catalog = Array.isArray(menuItem.addons) ? menuItem.addons : [];
  const chosen = [].concat(selection.options || []);
  let extra = 0;
  chosen.forEach((opt) => {
    const name = optionName(opt).trim().toLowerCase();
    const found = catalog.find((addon) => String(addon.name || '').trim().toLowerCase() === name);
    if (found) extra += Number(found.price) || 0;
  });
  return extra;
}

function unitPrice(menuItem, selection = {}) {
  const regular = parseRupees(menuItem.price ?? menuItem.Price ?? menuItem.itemPrice);
  if (!Number.isFinite(regular) || regular < 0) return NaN;
  const portion = portionOf(selection);
  let base = regular;
  if (portion === 'large') {
    const explicit = parseRupees(
      menuItem.priceLarge ?? menuItem.largePrice ?? menuItem.prices?.Large ?? menuItem.prices?.large
    );
    base = Number.isFinite(explicit) && explicit > 0 ? explicit : regular * 1.5;
  } else if (portion === 'extraLarge') {
    const explicit = parseRupees(
      menuItem.priceExtraLarge ?? menuItem.extraLargePrice ?? menuItem.prices?.['Extra Large'] ?? menuItem.prices?.extraLarge
    );
    base = Number.isFinite(explicit) && explicit > 0 ? explicit : regular * 2;
  }
  return roundRupees(base + addonTotal(menuItem, selection));
}

function lineKey(menuItemId, selection = {}) {
  const opts = [].concat(selection.options || []).map(optionName).map((name) => name.trim().toLowerCase()).filter(Boolean).sort();
  return [String(menuItemId), portionOf(selection), opts.join('|'), String(selection.notes || '').trim()].join('::');
}

function normalizeDiet(menuItem = {}) {
  const raw = String(menuItem.diet || menuItem.foodType || '').toLowerCase();
  if (raw.includes('egg')) return 'egg';
  if (raw.includes('non') || raw === 'nv') return 'nonveg';
  if (raw === 'veg' || raw.includes('vegetarian')) return 'veg';
  if (menuItem.veg === true) return 'veg';
  if (menuItem.veg === false) return 'nonveg';
  return 'unknown';
}

function quoteCart(menuItems, lines, tax = {}) {
  const rates = {
    cgstRate: Number.isFinite(Number(tax.cgstRate)) ? Number(tax.cgstRate) : DEFAULT_TAX.cgstRate,
    sgstRate: Number.isFinite(Number(tax.sgstRate)) ? Number(tax.sgstRate) : DEFAULT_TAX.sgstRate,
    sac: tax.sac || DEFAULT_TAX.sac,
  };
  const byId = new Map();
  (menuItems || []).forEach((item) => {
    const id = item.id || item.menuItemId;
    if (id) byId.set(String(id), item);
  });
  if (!Array.isArray(lines) || lines.length === 0) {
    const error = new Error('Order has no items to price');
    error.code = 'EMPTY_ORDER';
    throw error;
  }
  const priced = lines.map((line) => {
    const menuItemId = String(line.menuItemId || line.id || '');
    const menu = byId.get(menuItemId);
    if (!menu) {
      const error = new Error(`Menu item not found: ${line.name || menuItemId || 'unknown'}`);
      error.code = 'MENU_ITEM_MISSING';
      throw error;
    }
    const qty = Number(line.qty ?? line.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new Error('Each item needs a whole quantity from 1 to 99');
    }
    const unit = unitPrice(menu, line);
    if (!Number.isFinite(unit)) {
      throw new Error(`Menu item has no price: ${menu.name || menuItemId}`);
    }
    return {
      key: line.key || lineKey(menu.id || menuItemId, line),
      menuItemId,
      name: menu.name || line.name || 'Item',
      qty,
      size: portionOf(line),
      unitPrice: unit,
      lineTotal: roundRupees(unit * qty),
      diet: normalizeDiet(menu),
      spice: menu.spice || null,
      allergens: Array.isArray(menu.allergens) ? menu.allergens : [],
      station: menu.station || 'kitchen',
      status: line.status || 'placed',
      notes: String(line.notes || '').trim(),
      options: line.options || [],
    };
  });
  const subtotal = roundRupees(priced.reduce((sum, line) => sum + line.lineTotal, 0));
  return applyDiscount({
    lines: priced,
    subtotal,
    discount: 0,
    cgstRate: rates.cgstRate,
    sgstRate: rates.sgstRate,
    sac: rates.sac,
    packing: 0,
    savings: 0,
    deliveryFee: 0,
  }, 0);
}

function applyDiscount(quote, discountRupees) {
  const subtotal = roundRupees(quote.subtotal);
  const discount = roundRupees(Math.min(Math.max(0, Number(discountRupees) || 0), subtotal));
  const taxable = roundRupees(subtotal - discount);
  const cgst = roundRupees(taxable * Number(quote.cgstRate) / 100);
  const sgst = roundRupees(taxable * Number(quote.sgstRate) / 100);
  const tax = roundRupees(cgst + sgst);
  const total = roundRupees(taxable + tax);
  return {
    ...quote,
    subtotal,
    discount,
    taxable,
    cgst,
    sgst,
    tax,
    total,
    paise: Math.round(total * 100),
    packing: 0,
    savings: 0,
    deliveryFee: 0,
  };
}

function applyCoupon(quote, coupon, approved) {
  if (!coupon) return quote;
  if (coupon.requiresManager && !approved) {
    const error = new Error('Manager approval is required for this discount.');
    error.code = 'APPROVAL_REQUIRED';
    throw error;
  }
  let off = 0;
  if (coupon.type === 'percent') off = quote.subtotal * Number(coupon.value || 0) / 100;
  if (coupon.type === 'flat') off = Number(coupon.value || 0);
  if (coupon.maxRupees) off = Math.min(off, Number(coupon.maxRupees));
  const next = applyDiscount(quote, off);
  return { ...next, couponCode: coupon.code || null };
}

function balanceShares(shares, expectedTotal) {
  if (!shares.length) return shares;
  const sum = roundRupees(shares.reduce((total, share) => total + share.total, 0));
  const drift = roundRupees(expectedTotal - sum);
  const last = shares[shares.length - 1];
  last.total = roundRupees(last.total + drift);
  last.sgst = roundRupees(last.sgst + drift);
  return shares;
}

function splitBill(quote, request) {
  if (!request || !request.mode) throw new Error('Split needs a mode');
  if (request.mode === 'equal') {
    const parts = Number(request.parts);
    if (!Number.isInteger(parts) || parts < 2 || parts > 20) {
      throw new Error('Equal split needs between 2 and 20 parts');
    }
    const paise = Math.round(quote.total * 100);
    const base = Math.floor(paise / parts);
    const remainder = paise - base * parts;
    return Array.from({ length: parts }, (_, index) => {
      const total = (base + (index < remainder ? 1 : 0)) / 100;
      const ratio = quote.total ? total / quote.total : 0;
      return {
        label: `Person ${index + 1}`,
        subtotal: roundRupees(quote.subtotal * ratio),
        cgst: roundRupees(quote.cgst * ratio),
        sgst: roundRupees(quote.sgst * ratio),
        total,
        lines: [],
      };
    });
  }
  const groups = request.mode === 'by-person' ? request.people : request.groups;
  if (!Array.isArray(groups) || groups.length < 2) {
    throw new Error('This split needs at least two groups');
  }
  const shares = groups.map((group) => {
    const keys = new Set(group.keys || []);
    const lines = quote.lines.filter((line) => keys.has(line.key));
    const subtotal = roundRupees(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const ratio = quote.subtotal ? subtotal / quote.subtotal : 0;
    const cgst = roundRupees(quote.cgst * ratio);
    const sgst = roundRupees(quote.sgst * ratio);
    return {
      label: group.label || group.name || 'Share',
      subtotal,
      cgst,
      sgst,
      total: roundRupees(subtotal + cgst + sgst),
      lines,
    };
  });
  return balanceShares(shares, quote.total);
}

module.exports = {
  DEFAULT_TAX,
  roundRupees,
  parseRupees,
  portionOf,
  unitPrice,
  lineKey,
  normalizeDiet,
  quoteCart,
  applyDiscount,
  applyCoupon,
  splitBill,
};
