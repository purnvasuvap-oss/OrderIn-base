const ESC = 0x1b;
const GS = 0x1d;

class EscPosBuilder {
  constructor(width = 32) {
    this.width = width;
    this.bytes = [ESC, 0x40];
  }

  text(value) {
    const encoded = unescape(encodeURIComponent(String(value)));
    for (let i = 0; i < encoded.length; i += 1) this.bytes.push(encoded.charCodeAt(i));
    return this;
  }

  line(value = '') {
    return this.text(`${value}\n`);
  }

  bold(on) {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  align(mode) {
    this.bytes.push(ESC, 0x61, { left: 0, center: 1, right: 2 }[mode] ?? 0);
    return this;
  }

  row(left, right) {
    const l = String(left);
    const r = String(right);
    const space = Math.max(1, this.width - l.length - r.length);
    return this.line(l + ' '.repeat(space) + r);
  }

  divider() {
    return this.line('-'.repeat(this.width));
  }

  cut() {
    this.bytes.push(GS, 0x56, 0x00);
    return this;
  }

  build() {
    return Uint8Array.from(this.bytes);
  }
}

function money(value) {
  return `Rs${Number(value || 0).toFixed(2)}`;
}

function kotBytes({ restaurant, tableId, station, items, paperWidth = 32 }) {
  const ticket = new EscPosBuilder(paperWidth);
  ticket.align('center').bold(true).line(station || 'KITCHEN').bold(false);
  ticket.line(restaurant?.name || 'Restaurant');
  ticket.align('left').line(`Table ${tableId || '-'}`);
  ticket.divider();
  (items || []).forEach((item) => {
    ticket.bold(true).line(`${item.qty} x ${item.name}`).bold(false);
    if (item.size && item.size !== 'regular') ticket.line(`  ${item.size}`);
    if (item.notes) ticket.line(`  ${item.notes}`);
  });
  ticket.divider().line(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })).cut();
  return ticket.build();
}

function billBytes({ restaurant, order, paperWidth = 32 }) {
  const bill = new EscPosBuilder(paperWidth);
  bill.align('center').bold(true).line(restaurant?.name || 'Restaurant').bold(false);
  if (restaurant?.address) bill.line(restaurant.address);
  if (restaurant?.gstin) bill.line(`GSTIN ${restaurant.gstin}`);
  if (restaurant?.fssai) bill.line(`FSSAI ${restaurant.fssai}`);
  bill.align('left').divider();
  if (order?.invoiceNumber) bill.row('Invoice', order.invoiceNumber);
  bill.row('SAC', order?.sac || restaurant?.sac || '996331');
  bill.row('Table', String(order?.tableId || '-'));
  bill.divider();
  (order?.lines || order?.items || []).forEach((item) => {
    bill.row(`${item.qty} ${item.name}`, money(item.lineTotal || (item.unitPrice || item.price || 0) * item.qty));
  });
  bill.divider();
  bill.row('Subtotal', money(order?.subtotal));
  if (order?.discount) bill.row('Discount', money(order.discount));
  bill.row('CGST', money(order?.cgst));
  bill.row('SGST', money(order?.sgst));
  bill.bold(true).row('TOTAL', money(order?.total)).bold(false);
  bill.divider().align('center').line('Thank you').cut();
  return bill.build();
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  if (typeof Buffer !== 'undefined') return Buffer.from(binary, 'binary').toString('base64');
  return btoa(binary);
}

function kotByStation(order, restaurant) {
  const groups = new Map();
  (order.lines || order.items || []).forEach((item) => {
    const station = item.station || 'kitchen';
    if (!groups.has(station)) groups.set(station, []);
    groups.get(station).push(item);
  });
  return [...groups.entries()].map(([station, items]) => ({
    station,
    bytes: kotBytes({ restaurant, tableId: order.tableId, station, items }),
  }));
}

module.exports = {
  kotBytes,
  billBytes,
  bytesToBase64,
  kotByStation,
};
