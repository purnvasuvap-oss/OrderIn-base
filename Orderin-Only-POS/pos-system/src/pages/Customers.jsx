import { useMemo, useState } from "react";
import { Contact, Users, Star, Clock } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listCustomers, listOrders } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import StatCard from "../components/StatCard";

// 3+ orders reads as a genuine repeat customer rather than a one-off/trial
// visit — tunable here if that bar should sit somewhere else.
const REGULAR_THRESHOLD = 3;

export default function Customers() {
  const { data: customers } = useLiveQuery(listCustomers, [EVENTS.ORDERS_CHANGED, EVENTS.CUSTOMERS_CHANGED], []);
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const [selected, setSelected] = useState(null);

  // Acquisition order — "who was our 1st / 2nd / latest customer" — is when
  // they first ever ordered, which is a different question from "lastOrder"
  // (their most recent visit, used for general recency).
  const ranked = useMemo(() => {
    if (!customers) return [];
    return [...customers]
      .sort((a, b) => (a.firstOrder ?? a.lastOrder) - (b.firstOrder ?? b.lastOrder))
      .map((c, i) => ({ ...c, rank: i + 1 }));
  }, [customers]);

  const stats = useMemo(() => {
    if (!ranked.length) return null;
    const regular = ranked.filter((c) => c.orders >= REGULAR_THRESHOLD).length;
    return {
      total: ranked.length,
      regular,
      occasional: ranked.length - regular,
      first: ranked[0],
      latest: ranked[ranked.length - 1],
    };
  }, [ranked]);

  const customerOrders = useMemo(() => {
    if (!selected || !orders) return [];
    return orders.filter((o) => o.customerPhone === selected.phone).sort((a, b) => b.createdAt - a.createdAt);
  }, [selected, orders]);

  // The dish ordered most often, by total quantity across every order —
  // ties keep whichever was seen first, which is an acceptable simplification.
  const favoriteDish = useMemo(() => {
    if (!customerOrders.length) return null;
    const counts = {};
    customerOrders.forEach((o) => o.items.forEach((it) => { counts[it.name] = (counts[it.name] || 0) + it.qty; }));
    const [name, qty] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    return name ? { name, qty } : null;
  }, [customerOrders]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="page-subtitle">Internal billing records only — not a customer-facing feature.</p>
        </div>
      </div>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
          <StatCard label="Total Customers" value={stats.total} icon={Users} tone="primary" />
          <StatCard label="Regular Customers" value={stats.regular} icon={Star} tone="success" />
          <StatCard label="New / Occasional" value={stats.occasional} icon={Contact} tone="info" />
          <StatCard label="First Ever Customer" value={stats.first.name} icon={Clock} tone="primary" />
          <StatCard label="Latest Customer" value={stats.latest.name} icon={Clock} tone="primary" />
        </div>
      )}

      <div className="table-wrap">
        {!ranked.length ? (
          <EmptyState icon={Contact} title="No customer records yet" subtitle="Name and phone are captured at checkout to start building history." />
        ) : (
          <table className="data-table">
            <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Type</th><th>Orders</th><th>Total spent</th><th>First order</th><th>Last order</th><th></th></tr></thead>
            <tbody>
              {ranked.map((c) => (
                <tr key={c.id}>
                  <td data-label="#">{c.rank}</td>
                  <td data-label="Name"><strong>{c.name}</strong></td>
                  <td data-label="Phone">{c.phone}</td>
                  <td data-label="Type"><StatusBadge status={c.orders >= REGULAR_THRESHOLD ? "regular" : "occasional"} /></td>
                  <td data-label="Orders">{c.orders}</td>
                  <td data-label="Total spent">₹{c.totalSpent.toFixed(2)}</td>
                  <td data-label="First order">{c.firstOrder ? new Date(c.firstOrder).toLocaleDateString() : "—"}</td>
                  <td data-label="Last order">{new Date(c.lastOrder).toLocaleDateString()}</td>
                  <td data-label=""><button className="btn btn-outline btn-sm" onClick={() => setSelected(c)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name} width={520}>
        {selected && (
          <div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: "var(--text-muted)" }}>Phone: </span><strong>{selected.phone}</strong></div>
              <div><span style={{ color: "var(--text-muted)" }}>Rank: </span><strong>#{selected.rank}</strong></div>
              <div><span style={{ color: "var(--text-muted)" }}>Total spent: </span><strong>₹{selected.totalSpent.toFixed(2)}</strong></div>
            </div>
            <div style={{ marginBottom: 16, padding: "10px 12px", background: "var(--surface-alt)", borderRadius: 8, fontSize: 13 }}>
              <strong>Most ordered dish: </strong>
              {favoriteDish ? `${favoriteDish.name} (${favoriteDish.qty}×  across all orders)` : "—"}
            </div>
            <strong style={{ fontSize: 13.5 }}>Order history ({customerOrders.length})</strong>
            <div style={{ marginTop: 8, maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {customerOrders.map((o) => (
                <div key={o.id} style={{ padding: "8px 10px", background: "var(--surface-alt)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <strong>{o.orderNo}</strong>
                    <span style={{ color: "var(--text-muted)" }}>{new Date(o.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12.5 }}>
                    <StatusBadge status={o.status} />
                    <strong>₹{o.total.toFixed(2)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
