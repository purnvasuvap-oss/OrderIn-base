import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import {
  PLATFORM_LABEL,
  advanceAggregatorOrder,
  subscribeAggregatorOrders,
} from "../services/aggregatorService";
import {
  AggregatorAlerts,
  NewOrderCard,
  useDismissed,
  useNow,
  useWaitingChime,
} from "../components/AggregatorInbox/AggregatorInbox";
import "../components/AggregatorInbox/AggregatorInbox.css";
import "./OnlineOrdersPage.css";

const PLATFORMS = ["swiggy", "zomato"];

const money = (n) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const timeOf = (ms) =>
  ms ? new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

const minutesBetween = (from, to) => Math.max(0, Math.round((to - from) / 60000));

/** Splits one platform's orders into the page's lanes. */
export function groupOrders(orders) {
  const by = (statuses) => orders.filter((o) => statuses.includes(o.aggregatorStatus));
  return {
    placed: by(["placed"]),
    accepted: by(["accepted"]),
    ready: by(["ready"]),
    done: by(["picked_up", "delivered"]),
    closed: by(["rejected", "cancelled"]),
  };
}

/** Sales today = everything except rejected / cancelled orders. */
const salesOf = (orders) =>
  orders
    .filter((o) => !["rejected", "cancelled"].includes(o.aggregatorStatus))
    .reduce((sum, o) => sum + (Number(o.totalCost) || 0), 0);

function ActiveOrderCard({ order, now, onError }) {
  const [busy, setBusy] = useState(false);
  const isReady = order.aggregatorStatus === "ready";
  const due = order.acceptedAt && order.prepMinutes ? order.acceptedAt + order.prepMinutes * 60000 : null;
  const late = !isReady && due && now > due;

  const advance = async () => {
    setBusy(true);
    try {
      await advanceAggregatorOrder(order.id, isReady ? "Delivered" : "Ready");
    } catch (e) {
      onError(e.message || "Couldn't update the order. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`agg-card agg-${order.platform} oo-active`} aria-label={`${order.platformLabel} order ${order.externalOrderId}`}>
      <header className="agg-card-head">
        <span className="agg-oid">#{order.externalOrderId}</span>
        {order.simulated && <span className="agg-tag">Test</span>}
        <span className={`agg-timer ${late ? "expired" : ""}`}>
          {isReady
            ? "Waiting for rider"
            : due
              ? late
                ? `${minutesBetween(due, now)} min late`
                : `Ready by ${timeOf(due)}`
              : ""}
        </span>
      </header>
      <ul className="agg-items">
        {order.items.map((it, i) => (
          <li key={i}>
            <span className="q">{it.quantity}×</span> {it.name}
            {it.instructions && <span className="ins"> — {it.instructions}</span>}
          </li>
        ))}
      </ul>
      {order.instructions && <p className="agg-note">“{order.instructions}”</p>}
      {order.rider && (order.rider.name || order.rider.status) && (
        <p className="oo-rider">
          Rider: {order.rider.name || "assigned"}
          {order.rider.status ? ` · ${String(order.rider.status).replace(/_/g, " ")}` : ""}
          {order.rider.etaMinutes ? ` · ${order.rider.etaMinutes} min away` : ""}
        </p>
      )}
      <div className="agg-meta">
        <span>{order.username}</span>
        <span>{order.paymentType}</span>
        <strong>{money(order.totalCost)}</strong>
      </div>
      <div className="agg-buttons">
        <button type="button" className="agg-btn primary" disabled={busy} onClick={advance}>
          {busy ? "Updating…" : isReady ? "Handed to rider" : "Mark ready"}
        </button>
      </div>
    </article>
  );
}

function CompactRow({ order }) {
  const closed = ["rejected", "cancelled"].includes(order.aggregatorStatus);
  const reason = order.aggregatorStatus === "rejected" ? order.rejectReason : order.cancelReason;
  return (
    <li className="oo-row">
      <span className="agg-oid">#{order.externalOrderId}</span>
      <span className="oo-row-items">
        {order.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}
      </span>
      <span className="oo-row-end">
        {closed ? (
          <span className="oo-closed">
            {order.aggregatorStatus === "rejected" ? "Rejected" : `Cancelled by ${order.platformLabel}`}
            {reason ? ` · ${String(reason).replace(/_/g, " ")}` : ""}
          </span>
        ) : (
          <strong>{money(order.totalCost)}</strong>
        )}
        <span className="oo-time">{timeOf(order.receivedAt)}</span>
      </span>
    </li>
  );
}

function Lane({ title, count, children }) {
  if (!count) return null;
  return (
    <div className="oo-lane">
      <h3>
        {title} <span className="oo-lane-count">{count}</span>
      </h3>
      {children}
    </div>
  );
}

/**
 * Online orders: Swiggy and Zomato side by side for the last 24 hours —
 * new orders to accept, orders in the kitchen, ready for pickup, completed,
 * and rejected / cancelled. Open to all staff, like the Orders page.
 */
function OnlineOrdersPage({ now: nowProp }) {
  const navigate = useNavigate();
  const now = useNow(nowProp);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [dismissed, dismiss] = useDismissed();

  useEffect(() => {
    const unsubscribe = subscribeAggregatorOrders(setOrders);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const list = useMemo(() => orders || [], [orders]);
  const perPlatform = useMemo(
    () => Object.fromEntries(PLATFORMS.map((p) => [p, list.filter((o) => o.platform === p)])),
    [list]
  );
  const waitingCount = list.filter((o) => o.aggregatorStatus === "placed").length;
  useWaitingChime(waitingCount > 0, muted);

  return (
    <div className="orders-page online-orders">
      <div className="pagehead">
        <div>
          <h1 className="page-h1">Online orders</h1>
          <div className="page-sub">Swiggy and Zomato orders from the last 24 hours</div>
        </div>
        <div className="oo-head-actions">
          {waitingCount > 0 && (
            <button type="button" className="agg-mute" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
              {muted ? "Sound off" : "Sound on"}
            </button>
          )}
          <button className="back-btn" onClick={() => navigate(routes.onlineOrdersSettings)}>
            Settings
          </button>
          <button className="back-btn" onClick={() => navigate(routes.orders)}>
            ← Back to Orders
          </button>
        </div>
      </div>

      <div className="oo-summary">
        {PLATFORMS.map((p) => {
          const g = groupOrders(perPlatform[p]);
          return (
            <div className={`oo-sum agg-${p}`} key={p}>
              <span className="agg-badge">{PLATFORM_LABEL[p]}</span>
              <dl>
                <div><dt>New</dt><dd>{g.placed.length}</dd></div>
                <div><dt>In kitchen</dt><dd>{g.accepted.length}</dd></div>
                <div><dt>Ready</dt><dd>{g.ready.length}</dd></div>
                <div><dt>Completed</dt><dd>{g.done.length}</dd></div>
                <div><dt>Sales</dt><dd>{money(salesOf(perPlatform[p]))}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>

      <section className="agg-inbox oo-alerts" aria-label="Alerts">
        {error && (
          <div className="agg-error" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        <AggregatorAlerts orders={list} dismissed={dismissed} onDismiss={dismiss} onError={setError} />
      </section>

      {orders === null ? (
        <div className="state-msg">Loading online orders…</div>
      ) : (
        <div className="oo-columns">
          {PLATFORMS.map((p) => {
            const g = groupOrders(perPlatform[p]);
            return (
              <section className={`agg-inbox oo-col agg-${p}`} key={p} aria-label={`${PLATFORM_LABEL[p]} orders`}>
                <div className="agg-inbox-head">
                  <h2>
                    <span className="agg-badge">{PLATFORM_LABEL[p]}</span>
                    {g.placed.length > 0 && <span className="agg-count">{g.placed.length} new</span>}
                  </h2>
                </div>

                {perPlatform[p].length === 0 && (
                  <p className="oo-empty">No {PLATFORM_LABEL[p]} orders in the last 24 hours.</p>
                )}

                <Lane title="New — accept or reject" count={g.placed.length}>
                  <div className="oo-stack">
                    {g.placed.map((o) => (
                      <NewOrderCard key={o.id} order={o} now={now} onError={setError} />
                    ))}
                  </div>
                </Lane>
                <Lane title="In the kitchen" count={g.accepted.length}>
                  <div className="oo-stack">
                    {g.accepted.map((o) => (
                      <ActiveOrderCard key={o.id} order={o} now={now} onError={setError} />
                    ))}
                  </div>
                </Lane>
                <Lane title="Ready for pickup" count={g.ready.length}>
                  <div className="oo-stack">
                    {g.ready.map((o) => (
                      <ActiveOrderCard key={o.id} order={o} now={now} onError={setError} />
                    ))}
                  </div>
                </Lane>
                <Lane title="Completed" count={g.done.length}>
                  <ul className="oo-rows">
                    {g.done.map((o) => (
                      <CompactRow key={o.id} order={o} />
                    ))}
                  </ul>
                </Lane>
                <Lane title="Rejected / cancelled" count={g.closed.length}>
                  <ul className="oo-rows">
                    {g.closed.map((o) => (
                      <CompactRow key={o.id} order={o} />
                    ))}
                  </ul>
                </Lane>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default OnlineOrdersPage;
