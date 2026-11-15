const PRESETS = {
  black: { id: 'black', label: 'Black', primary: '#111111', accent: '#f5c16c', background: '#0e0e0e', surface: '#1b1b1b', text: '#f7f4ef', font: 'Georgia, serif' },
  olive: { id: 'olive', label: 'Olive', primary: '#3f4f3a', accent: '#d7e2c4', background: '#f4f6ef', surface: '#ffffff', text: '#1d2418', font: 'Palatino, "Palatino Linotype", serif' },
  green: { id: 'green', label: 'Green', primary: '#0f6b45', accent: '#d9f5e5', background: '#f3fbf6', surface: '#ffffff', text: '#10281c', font: '"Trebuchet MS", sans-serif' },
  maroon: { id: 'maroon', label: 'Maroon', primary: '#7a1f2b', accent: '#f3d5c4', background: '#fbf6f4', surface: '#ffffff', text: '#2a1216', font: 'Georgia, serif' },
  red: { id: 'red', label: 'Red', primary: '#c0392b', accent: '#fde8e4', background: '#fff8f6', surface: '#ffffff', text: '#2b1210', font: '"Segoe UI", sans-serif' },
  stadium: { id: 'stadium', label: 'Stadium', primary: '#0b3d2e', accent: '#f2c14e', background: '#f6f3ea', surface: '#ffffff', text: '#14221c', font: 'Impact, "Arial Narrow", sans-serif' },
  dessert: { id: 'dessert', label: 'Dessert', primary: '#c46b8a', accent: '#ffe4ef', background: '#fff7fb', surface: '#ffffff', text: '#3a2230', font: '"Palatino Linotype", Palatino, serif' },
};

function presetTheme(id) {
  return PRESETS[id] ? { ...PRESETS[id] } : { ...PRESETS.olive };
}

function themeToCssVars(theme = {}) {
  const base = presetTheme(theme.preset || theme.id || 'olive');
  const merged = { ...base, ...theme };
  return {
    '--oi-primary': merged.primary,
    '--oi-accent': merged.accent,
    '--oi-bg': merged.background,
    '--oi-surface': merged.surface,
    '--oi-text': merged.text,
    '--oi-font': merged.font,
  };
}

function resolveRestaurantRef({ host = '', search = '', pathname = '' } = {}) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fromQuery = (params.get('r') || params.get('restaurant') || '').trim();
  const tableId = (params.get('table') || params.get('t') || '').trim();
  const pathMatch = String(pathname || '').match(/^\/r\/([^/]+)/);
  const fromPath = pathMatch ? decodeURIComponent(pathMatch[1]).trim() : '';
  const hostName = String(host || '').split(':')[0].toLowerCase();
  const labels = hostName.split('.').filter(Boolean);
  const ignored = new Set(['www', 'localhost', '127', 'orderin', 'web', 'firebaseapp', 'com', 'app', 'in']);
  let subdomain = '';
  if (labels.length >= 3 && !ignored.has(labels[0])) subdomain = labels[0];
  return {
    restaurantId: fromQuery || fromPath || '',
    subdomain,
    tableId,
  };
}

function tableQrUrl({ origin, restaurantId, tableId }) {
  if (!origin || !restaurantId || !tableId) throw new Error('A QR needs an origin, restaurant and table');
  const url = new URL(origin);
  url.searchParams.set('r', restaurantId);
  url.searchParams.set('table', String(tableId));
  return url.toString();
}

function featureOn(profile, flag) {
  if (!profile || !profile.features) return true;
  if (profile.features[flag] === undefined) return true;
  return Boolean(profile.features[flag]);
}

function billText({ restaurant, order }) {
  const name = restaurant?.name || 'Your restaurant';
  const lines = (order.lines || order.items || []).map((line) => `${line.qty} x ${line.name}  Rs ${Number(line.lineTotal || line.price || 0).toFixed(2)}`);
  return [
    name,
    order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : `Order ${order.id || ''}`,
    ...lines,
    `Subtotal Rs ${Number(order.subtotal || 0).toFixed(2)}`,
    `CGST Rs ${Number(order.cgst || 0).toFixed(2)}`,
    `SGST Rs ${Number(order.sgst || 0).toFixed(2)}`,
    `Total Rs ${Number(order.total || 0).toFixed(2)}`,
    'Thank you',
  ].join('\n');
}

function whatsappLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) throw new Error('WhatsApp needs a phone number');
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

function smsLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) throw new Error('SMS needs a phone number');
  return `sms:+${digits.length === 10 ? `91${digits}` : digits}?body=${encodeURIComponent(text)}`;
}

function reviewPrompt({ rating, googleReviewUrl }) {
  if (!googleReviewUrl) return { show: false, reason: 'no-url' };
  if (Number(rating) >= 4) return { show: true, url: googleReviewUrl };
  return { show: false, reason: 'kept-internal' };
}

function parseMenuCsv(text) {
  const rows = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((row) => row.trim());
  if (rows.length < 2) throw new Error('The sheet needs a header row and at least one dish');
  const header = splitCsvRow(rows[0]).map((cell) => cell.trim().toLowerCase());
  const index = (name) => header.indexOf(name);
  const required = ['name', 'price'];
  required.forEach((name) => {
    if (index(name) === -1) throw new Error(`Missing column: ${name}`);
  });
  return rows.slice(1).map((row) => {
    const cells = splitCsvRow(row);
    const at = (name) => (index(name) === -1 ? '' : (cells[index(name)] || '').trim());
    const allergens = at('allergens') ? at('allergens').split('|').map((item) => item.trim()).filter(Boolean) : [];
    return {
      name: at('name'),
      price: Number(at('price')),
      category: at('category'),
      diet: at('diet') || 'unknown',
      station: at('station') || 'kitchen',
      allergens,
      spice: at('spice') || null,
      priceLarge: at('pricelarge') ? Number(at('pricelarge')) : null,
    };
  }).filter((item) => item.name && Number.isFinite(item.price));
}

function splitCsvRow(row) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '"') {
      if (quoted && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function loggingEnabled(dsn) {
  const value = String(dsn || '').trim();
  if (!value) return false;
  if (/placeholder|example|your_dsn|changeme|xxx/i.test(value)) return false;
  return /^https:\/\/[^@\s]+@[^/\s]+\/\d+$/.test(value);
}

module.exports = {
  PRESETS,
  presetTheme,
  themeToCssVars,
  resolveRestaurantRef,
  tableQrUrl,
  featureOn,
  billText,
  whatsappLink,
  smsLink,
  reviewPrompt,
  parseMenuCsv,
  loggingEnabled,
};
