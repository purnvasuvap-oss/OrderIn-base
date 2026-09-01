import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import {
  IndianRupee, ShoppingBag, Receipt, Package, AlertTriangle, ChefHat, CheckCircle2, XCircle,
} from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { usePrinterStatus } from "../hooks/usePrinterStatus";
import { listOrders, listInventory, inventoryStatus } from "../lib/repo";
import { listPrintJobs } from "../lib/printer";
import { EVENTS } from "../lib/bus";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";

const COLORS = ["#c19548", "#fab63f", "#edca8d", "#3b6ea5", "#2e8b57", "#c1442e"];

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export default function Dashboard() {
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const { data: inventory } = useLiveQuery(listInventory, [EVENTS.INVENTORY_CHANGED], []);
  const { data: printJobs } = useLiveQuery(listPrintJobs, [EVENTS.PRINT_JOBS_CHANGED], []);
  const printerConnection = usePrinterStatus();

  const stats = useMemo(() => {
    if (!orders) return null;
    const today = startOfDay();
    const todays = orders.filter((o) => o.createdAt >= today && o.status !== "cancelled");
    const totalSales = todays.reduce((s, o) => s + (o.status === "refunded" ? 0 : o.total), 0);
    const itemsSold = todays.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
    const pending = orders.filter((o) => ["new", "preparing"].includes(o.status)).length;
    const completed = todays.filter((o) => o.status === "completed").length;
    const cancelled = orders.filter((o) => o.createdAt >= today && o.status === "cancelled").length;
    return {
      totalSales, orders: todays.length, aov: todays.length ? totalSales / todays.length : 0,
      itemsSold, pending, completed, cancelled,
    };
  }, [orders]);

  const revenueTrend = useMemo(() => {
    if (!orders) return [];
    const days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = startOfDay(d);
      return { key, label: d.toLocaleDateString([], { weekday: "short" }), revenue: 0, orders: 0 };
    });
    orders.forEach((o) => {
      if (o.status === "cancelled") return;
      const key = startOfDay(new Date(o.createdAt));
      const bucket = days.find((d) => d.key === key);
      if (bucket) {
        bucket.revenue += o.total;
        bucket.orders += 1;
      }
    });
    return days;
  }, [orders]);

  const categorySales = useMemo(() => {
    if (!orders) return [];
    const map = {};
    orders.forEach((o) => {
      if (o.status === "cancelled") return;
      o.items.forEach((it) => {
        map[it.name] = (map[it.name] || 0) + it.price * it.qty;
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const paymentSplit = useMemo(() => {
    if (!orders) return [];
    const map = {};
    orders.forEach((o) => (o.payments || []).forEach((p) => { map[p.method] = (map[p.method] || 0) + p.amount; }));
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const lowStock = useMemo(() => (inventory || []).filter((i) => ["low", "critical", "out"].includes(inventoryStatus(i))), [inventory]);

  const recentFailedPrints = useMemo(() => (printJobs || []).filter((j) => j.status === "failed" && Date.now() - j.createdAt < 24 * 60 * 60 * 1000), [printJobs]);
  const pendingPayments = useMemo(() => (orders || []).filter((o) => o.paymentStatus === "pending" && !["cancelled", "refunded"].includes(o.status)), [orders]);

  if (!orders || !inventory) return <div className="page">Loading dashboard…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">Today's overview across sales, kitchen and inventory.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard label="Today's Sales" value={`₹${stats.totalSales.toFixed(0)}`} icon={IndianRupee} tone="primary" />
        <StatCard label="Total Orders" value={stats.orders} icon={ShoppingBag} tone="primary" />
        <StatCard label="Avg Order Value" value={`₹${stats.aov.toFixed(0)}`} icon={Receipt} tone="primary" />
        <StatCard label="Items Sold" value={stats.itemsSold} icon={Package} tone="primary" />
        <StatCard label="Pending Kitchen" value={stats.pending} icon={ChefHat} tone="warning" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} tone="success" />
        <StatCard label="Cancelled" value={stats.cancelled} icon={XCircle} tone="danger" />
        <StatCard label="Low Stock Items" value={lowStock.length} icon={AlertTriangle} tone="danger" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Revenue over time (7 days)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={revenueTrend}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#c19548" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Payment method distribution</h3>
          {paymentSplit.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={paymentSplit} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3} isAnimationActive={false}>
                  {paymentSplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No payments yet" subtitle="Complete an order in POS to see this chart." />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Top-selling products</h3>
          {categorySales.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={categorySales} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <Tooltip />
                <Bar dataKey="value" fill="#fab63f" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No sales yet" />}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Operational alerts</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lowStock.length === 0 && stats.pending === 0 && printerConnection && recentFailedPrints.length === 0 && pendingPayments.length === 0 ? (
              <EmptyState title="All clear" subtitle="No alerts right now." />
            ) : (
              <>
                {lowStock.slice(0, 5).map((item) => (
                  <AlertRow key={item.id} label={`${item.name} — ${inventoryStatus(item) === "out" ? "out of stock" : "low stock"}`} tone="danger" />
                ))}
                {stats.pending > 0 && <AlertRow label={`${stats.pending} order(s) pending in kitchen`} tone="warning" />}
                {!printerConnection && <AlertRow label="No hardware printer connected — printing uses the browser dialog" tone="warning" />}
                {recentFailedPrints.length > 0 && <AlertRow label={`${recentFailedPrints.length} print job(s) failed in the last 24h`} tone="danger" />}
                {pendingPayments.length > 0 && <AlertRow label={`${pendingPayments.length} order(s) with pending payment`} tone="warning" />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertRow({ label, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "8px 10px", background: `var(--${tone}-bg)`, borderRadius: 8, color: `var(--${tone})` }}>
      <AlertTriangle size={14} /> {label}
    </div>
  );
}
