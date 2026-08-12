import { useEffect, useMemo, useState } from "react";
import { Flame, Clock, CheckCircle2, ChefHat, Printer } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listOrders, updateOrderStatus } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { printKitchenTicketForOrder } from "../lib/printer";
import "./Kitchen.css";

const COLUMNS = [
  { key: "new", label: "New", next: "preparing", nextLabel: "Accept" },
  { key: "preparing", label: "Preparing", next: "ready", nextLabel: "Mark Ready" },
  { key: "ready", label: "Ready", next: "completed", nextLabel: "Complete" },
];

const LONG_WAIT_MIN = 15;

export default function Kitchen() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: orders } = useLiveQuery(listOrders, [EVENTS.ORDERS_CHANGED], []);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(
    () => (orders || []).filter((o) => ["new", "preparing", "ready"].includes(o.status)),
    [orders]
  );

  const byColumn = (key) => active.filter((o) => o.status === key).sort((a, b) => a.createdAt - b.createdAt);

  const advance = (order, next) => updateOrderStatus(order.id, next, user);

  const printTicket = async (order) => {
    const res = await printKitchenTicketForOrder(order);
    if (!res.ok) toast.error(`Ticket print failed: ${res.error}`);
  };

  return (
    <div className="kds">
      <div className="kds-columns">
        {COLUMNS.map((col) => {
          const items = byColumn(col.key);
          return (
            <div className="kds-column" key={col.key}>
              <div className={`kds-column-header kds-col-${col.key}`}>
                <span>{col.label}</span>
                <span className="kds-count">{items.length}</span>
              </div>
              <div className="kds-column-body">
                {!items.length && <div className="kds-empty"><ChefHat size={28} /><span>No orders</span></div>}
                {items.map((o) => (
                  <OrderCard key={o.id} order={o} column={col} onAdvance={() => advance(o, col.next)} onPrint={() => printTicket(o)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({ order, column, onAdvance, onPrint }) {
  const minutesAgo = Math.floor((Date.now() - order.createdAt) / 60000);
  const isLate = minutesAgo >= LONG_WAIT_MIN && order.status !== "ready";
  const isHighPriority = order.priority === "high";

  return (
    <div className={`kds-card ${isLate ? "kds-card-late" : ""} ${isHighPriority ? "kds-card-priority" : ""}`}>
      <div className="kds-card-top">
        <div>
          <div className="kds-card-order">{order.orderNo}</div>
          <div className="kds-card-type">{order.orderType}{order.tableNo ? ` · Table ${order.tableNo}` : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onPrint} title="Print kitchen ticket"><Printer size={14} /></button>
          <div className={`kds-timer ${isLate ? "kds-timer-late" : ""}`}>
            <Clock size={13} /> {minutesAgo}m
          </div>
        </div>
      </div>

      {(isHighPriority || isLate) && (
        <div className="kds-flags">
          {isHighPriority && <span className="kds-flag kds-flag-priority"><Flame size={12} /> Priority</span>}
          {isLate && <span className="kds-flag kds-flag-late">Taking long</span>}
        </div>
      )}

      <div className="kds-card-items">
        {order.items.map((it, i) => (
          <div className="kds-item" key={i}>
            <span className="kds-item-qty">{it.qty}×</span>
            <span className="kds-item-name">{it.name}</span>
            {it.notes && <span className="kds-item-note">"{it.notes}"</span>}
          </div>
        ))}
      </div>
      {order.notes && <div className="kds-order-note">Note: {order.notes}</div>}

      <button className="kds-advance-btn" onClick={onAdvance}>
        {column.key === "ready" ? <CheckCircle2 size={16} /> : null} {column.nextLabel}
      </button>
    </div>
  );
}
