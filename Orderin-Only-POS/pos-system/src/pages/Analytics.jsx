import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listOrders, listProducts } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import EmptyState from "../components/EmptyState";
import StatCard from "../components/StatCard";
import { TrendingUp, TrendingDown } from "lucide-react";

const COLORS = ["#c19548", "#fab63f", "#edca8d", "#3b6ea5", "#2e8b57", "#c1442e", "#8a6d3b"];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

export default function Analytics() {
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const { data: products } = useLiveQuery(listProducts, [EVENTS.MENU_CHANGED], []);

  const valid = useMemo(() => (orders || []).filter((o) => o.status !== "cancelled"), [orders]);

  const productPerf = useMemo(() => {
    const map = {};
    valid.forEach((o) => o.items.forEach((it) => {
      map[it.name] = (map[it.name] || 0) + it.qty;
    }));
    const arr = Object.entries(map).map(([name, qty]) => ({ name, qty }));
    return { top: [...arr].sort((a, b) => b.qty - a.qty).slice(0, 6), least: [...arr].sort((a, b) => a.qty - b.qty).slice(0, 6) };
  }, [valid]);

  const categoryContribution = useMemo(() => {
    if (!products) return [];
    const catOf = {};
    products.forEach((p) => { catOf[p.id] = p.categoryId; });
    const map = {};
    valid.forEach((o) => o.items.forEach((it) => {
      const cat = catOf[it.productId] || "other";
      map[cat] = (map[cat] || 0) + it.price * it.qty;
    }));
    return Object.entries(map).map(([cat, value]) => ({ name: cat, value }));
  }, [valid, products]);

  const orderTypeSplit = useMemo(() => {
    const map = {};
    valid.forEach((o) => { map[o.orderType] = (map[o.orderType] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [valid]);

  const growth = useMemo(() => {
    const today = startOfDay(new Date());
    const yesterday = today - 86400000;
    const todaySales = valid.filter((o) => o.createdAt >= today).reduce((s, o) => s + o.total, 0);
    const yestSales = valid.filter((o) => o.createdAt >= yesterday && o.createdAt < today).reduce((s, o) => s + o.total, 0);
    const pct = yestSales ? ((todaySales - yestSales) / yestSales) * 100 : todaySales > 0 ? 100 : 0;
    return { todaySales, yestSales, pct };
  }, [valid]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Analytics</h2>
          <p className="page-subtitle">Deeper product, category and order-type performance.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard label="Sales growth (vs yesterday)" value={`${growth.pct >= 0 ? "+" : ""}${growth.pct.toFixed(1)}%`} icon={growth.pct >= 0 ? TrendingUp : TrendingDown} tone={growth.pct >= 0 ? "success" : "danger"} />
        <StatCard label="Today's revenue" value={`₹${growth.todaySales.toFixed(0)}`} icon={TrendingUp} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ChartCard title="Best-selling products">
          {productPerf.top.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={productPerf.top} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <Tooltip /><Bar dataKey="qty" fill="#c19548" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No sales data" />}
        </ChartCard>

        <ChartCard title="Least-selling products">
          {productPerf.least.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={productPerf.least} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <Tooltip /><Bar dataKey="qty" fill="#c1442e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No sales data" />}
        </ChartCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Category contribution">
          {categoryContribution.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={categoryContribution} dataKey="value" nameKey="name" outerRadius={85} label>
                  {categoryContribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No category data" />}
        </ChartCard>

        <ChartCard title="Orders by type">
          {orderTypeSplit.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={orderTypeSplit} dataKey="value" nameKey="name" outerRadius={85} label>
                  {orderTypeSplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState title="No order data" />}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ marginTop: 0, fontSize: 14 }}>{title}</h3>
      {children}
    </div>
  );
}
