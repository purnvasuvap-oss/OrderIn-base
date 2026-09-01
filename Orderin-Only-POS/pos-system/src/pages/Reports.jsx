import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listOrders, listInventory, listExpenses, inventoryStatus } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { exportCSV } from "../lib/csv";
import StatCard from "../components/StatCard";
import { IndianRupee, TrendingDown, TrendingUp, Percent } from "lucide-react";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

function inRange(ts, range) {
  const now = new Date();
  const d = new Date(ts);
  if (range === "today") return d.toDateString() === now.toDateString();
  if (range === "week") {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }
  if (range === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (range === "year") return d.getFullYear() === now.getFullYear();
  return true;
}

export default function Reports() {
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const { data: inventory } = useLiveQuery(listInventory, [EVENTS.INVENTORY_CHANGED], []);
  const { data: expenses } = useLiveQuery(listExpenses, [EVENTS.EXPENSES_CHANGED], []);
  const [range, setRange] = useState("month");

  const scoped = useMemo(() => (orders || []).filter((o) => inRange(o.createdAt, range) && o.status !== "cancelled"), [orders, range]);
  const scopedExpenses = useMemo(() => (expenses || []).filter((e) => inRange(e.date, range)), [expenses, range]);

  const financial = useMemo(() => {
    const grossSales = scoped.reduce((s, o) => s + o.subtotal, 0);
    const discounts = scoped.reduce((s, o) => s + o.discount, 0);
    const taxes = scoped.reduce((s, o) => s + o.tax, 0);
    const netSales = scoped.reduce((s, o) => s + (o.status === "refunded" ? 0 : o.total), 0);
    const totalExpenses = scopedExpenses.reduce((s, e) => s + Number(e.amount), 0);
    return { grossSales, discounts, taxes, netSales, totalExpenses, profit: netSales - totalExpenses };
  }, [scoped, scopedExpenses]);

  const productReport = useMemo(() => {
    const map = {};
    scoped.forEach((o) => o.items.forEach((it) => {
      if (!map[it.name]) map[it.name] = { name: it.name, qty: 0, revenue: 0 };
      map[it.name].qty += it.qty;
      map[it.name].revenue += it.price * it.qty;
    }));
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [scoped]);

  const paymentReport = useMemo(() => {
    const map = {};
    scoped.forEach((o) => (o.payments || []).forEach((p) => { map[p.method] = (map[p.method] || 0) + p.amount; }));
    return Object.entries(map).map(([method, amount]) => ({ method, amount }));
  }, [scoped]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Reports</h2>
          <p className="page-subtitle">Sales, product, payment and financial reports — exportable as CSV.</p>
        </div>
        <select className="input" style={{ maxWidth: 160 }} value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard label="Gross Sales" value={`₹${financial.grossSales.toFixed(0)}`} icon={IndianRupee} />
        <StatCard label="Discounts" value={`₹${financial.discounts.toFixed(0)}`} icon={Percent} tone="warning" />
        <StatCard label="Taxes" value={`₹${financial.taxes.toFixed(0)}`} icon={IndianRupee} />
        <StatCard label="Net Sales" value={`₹${financial.netSales.toFixed(0)}`} icon={TrendingUp} tone="success" />
        <StatCard label="Expenses" value={`₹${financial.totalExpenses.toFixed(0)}`} icon={TrendingDown} tone="danger" />
        <StatCard label="Profit" value={`₹${financial.profit.toFixed(0)}`} icon={IndianRupee} tone={financial.profit >= 0 ? "success" : "danger"} />
      </div>

      <ReportSection title="Product report" rows={productReport}
        columns={[{ key: "name", label: "Product" }, { key: "qty", label: "Qty sold" }, { key: "revenue", label: "Revenue", fmt: (v) => `₹${v.toFixed(2)}` }]}
        onExport={() => exportCSV("product-report.csv", productReport)} />

      <ReportSection title="Payment method report" rows={paymentReport}
        columns={[{ key: "method", label: "Method" }, { key: "amount", label: "Amount", fmt: (v) => `₹${v.toFixed(2)}` }]}
        onExport={() => exportCSV("payment-report.csv", paymentReport)} />

      <ReportSection title="Inventory valuation" rows={(inventory || []).map((i) => ({ name: i.name, stock: `${i.stock} ${i.unit}`, status: inventoryStatus(i), value: i.stock * i.purchasePrice }))}
        columns={[{ key: "name", label: "Item" }, { key: "stock", label: "Stock" }, { key: "status", label: "Status" }, { key: "value", label: "Value", fmt: (v) => `₹${v.toFixed(2)}` }]}
        onExport={() => exportCSV("inventory-valuation.csv", (inventory || []).map((i) => ({ name: i.name, stock: i.stock, unit: i.unit, status: inventoryStatus(i), value: i.stock * i.purchasePrice })))} />
    </div>
  );
}

function ReportSection({ title, rows, columns, onExport }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
        <button className="btn btn-outline btn-sm" onClick={onExport} disabled={!rows.length}><Download size={13} /> Export CSV</button>
      </div>
      <div className="table-wrap" style={{ border: "none" }}>
        <table className="data-table">
          <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 10).map((r, i) => (
              <tr key={i}>{columns.map((c) => <td key={c.key} data-label={c.label}>{c.fmt ? c.fmt(r[c.key]) : r[c.key]}</td>)}</tr>
            ))}
            {!rows.length && <tr><td data-label="" colSpan={columns.length} style={{ textAlign: "center", color: "var(--text-muted)" }}>No data for this period</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
