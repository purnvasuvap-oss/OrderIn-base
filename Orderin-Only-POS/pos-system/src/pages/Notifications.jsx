import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Trash2, X, ShoppingCart, Clock, Boxes, Printer } from "lucide-react";
import { EVENTS, on } from "../lib/bus";
import { getHistory, markRead, markAllRead, deleteNotification, clearHistory } from "../lib/notifications";
import EmptyState from "../components/EmptyState";

const CATEGORY_META = {
  newOrder: { label: "New order", icon: ShoppingCart, tone: "var(--primary)" },
  kitchenDelay: { label: "Kitchen delay", icon: Clock, tone: "var(--warning)" },
  lowStock: { label: "Low stock", icon: Boxes, tone: "var(--danger)" },
  printFail: { label: "Print failed", icon: Printer, tone: "var(--danger)" },
};

function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState(getHistory());

  useEffect(() => {
    const refresh = () => setItems(getHistory());
    refresh();
    return on(EVENTS.NOTIFICATIONS_CHANGED, refresh);
  }, []);

  const openItem = (n) => {
    markRead(n.id);
    if (n.url) navigate(n.url);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="page-subtitle">Alerts raised on this device — new orders, kitchen delays, low stock and print failures.</p>
        </div>
        {items.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={markAllRead}><Check size={14} /> Mark all read</button>
            <button className="btn btn-outline btn-sm" onClick={clearHistory}><Trash2 size={14} /> Clear all</button>
          </div>
        )}
      </div>

      {!items.length ? (
        <EmptyState icon={Bell} title="No notifications yet" subtitle="New orders, kitchen delays, low stock and failed prints will show up here." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {items.map((n) => {
            const meta = CATEGORY_META[n.category] || { label: "Alert", icon: Bell, tone: "var(--text-muted)" };
            const Icon = meta.icon;
            return (
              <div
                key={n.id}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 16px", borderBottom: "1px solid var(--border)",
                  background: n.read ? "transparent" : "var(--surface-alt)",
                }}
              >
                <button
                  onClick={() => openItem(n)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0,
                    textAlign: "left", background: "none", border: "none", padding: 0,
                    cursor: n.url ? "pointer" : "default",
                  }}
                >
                  <span style={{ color: meta.tone, marginTop: 2 }}><Icon size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />}
                      <strong style={{ fontSize: 13.5 }}>{n.title}</strong>
                    </span>
                    {n.body && <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{n.body}</span>}
                  </span>
                </button>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", marginTop: 2 }}>{relativeTime(n.at)}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  title="Delete"
                  aria-label="Delete notification"
                  onClick={() => deleteNotification(n.id)}
                  style={{ padding: 4, flexShrink: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
