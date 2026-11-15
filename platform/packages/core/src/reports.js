const { roundRupees } = require('./billing');

function inRange(order, from, to) {
  const time = new Date(order.createdAt || order.paidAt || 0).getTime();
  if (from && time < new Date(from).getTime()) return false;
  if (to && time > new Date(to).getTime()) return false;
  return true;
}

function paidOrders(orders, range = {}) {
  return (orders || []).filter((order) => (order.status === 'paid' || order.paymentStatus === 'paid') && inRange(order, range.from, range.to));
}

function salesSummary(orders, range) {
  const rows = paidOrders(orders, range);
  const byHour = {};
  rows.forEach((order) => {
    const hour = new Date(order.createdAt || order.paidAt).getHours();
    byHour[hour] = (byHour[hour] || 0) + 1;
  });
  const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
  return {
    orders: rows.length,
    sales: roundRupees(rows.reduce((sum, order) => sum + Number(order.total || 0), 0)),
    tax: roundRupees(rows.reduce((sum, order) => sum + Number(order.tax || 0), 0)),
    peakHour: peakHour ? Number(peakHour[0]) : null,
  };
}

function itemWise(orders, range) {
  const totals = new Map();
  paidOrders(orders, range).forEach((order) => {
    (order.lines || order.items || []).forEach((line) => {
      const name = line.name || 'Item';
      const current = totals.get(name) || { name, qty: 0, amount: 0 };
      current.qty += Number(line.qty || 0);
      current.amount = roundRupees(current.amount + Number(line.lineTotal || 0));
      totals.set(name, current);
    });
  });
  return [...totals.values()].sort((a, b) => b.qty - a.qty);
}

function gstReport(orders, range) {
  return paidOrders(orders, range).map((order) => ({
    invoiceNumber: order.invoiceNumber || '',
    date: order.createdAt || order.paidAt || '',
    taxable: roundRupees(order.taxable != null ? order.taxable : Number(order.subtotal || 0) - Number(order.discount || 0)),
    cgst: roundRupees(order.cgst || 0),
    sgst: roundRupees(order.sgst || 0),
    total: roundRupees(order.total || 0),
    sac: order.sac || '996331',
  }));
}

function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

function tallyVoucherRows(orders, range) {
  const rows = [];
  gstReport(orders, range).forEach((entry) => {
    rows.push({ date: entry.date, voucher: 'Sales', ledger: 'Food sales', invoice: entry.invoiceNumber, amount: entry.taxable });
    rows.push({ date: entry.date, voucher: 'Sales', ledger: 'Output CGST', invoice: entry.invoiceNumber, amount: entry.cgst });
    rows.push({ date: entry.date, voucher: 'Sales', ledger: 'Output SGST', invoice: entry.invoiceNumber, amount: entry.sgst });
  });
  return rows;
}

function staffPerformance(orders, range) {
  const totals = new Map();
  paidOrders(orders, range).forEach((order) => {
    const id = order.takenBy?.id || order.cashierId || 'unassigned';
    const name = order.takenBy?.name || order.cashierName || 'Unassigned';
    const current = totals.get(id) || { id, name, orders: 0, sales: 0 };
    current.orders += 1;
    current.sales = roundRupees(current.sales + Number(order.total || 0));
    totals.set(id, current);
  });
  return [...totals.values()].sort((a, b) => b.sales - a.sales);
}

module.exports = {
  salesSummary,
  itemWise,
  gstReport,
  toCsv,
  tallyVoucherRows,
  staffPerformance,
};
