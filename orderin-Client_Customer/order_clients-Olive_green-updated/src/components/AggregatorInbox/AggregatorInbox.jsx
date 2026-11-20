import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PREP_TIME_CHOICES,
  REJECT_REASONS,
  acceptAggregatorOrder,
  rejectAggregatorOrder,
  retryAggregatorSync,
} from "../../services/aggregatorService";
import "./AggregatorInbox.css";

const money = (n) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const DISMISSED_KEY = "aggregatorInbox.dismissed";
const readDismissed = () => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || "[]"));
  } catch (e) {
    return new Set();
  }
};

// Short two-tone chime, repeated while orders are waiting. Generated with Web
// Audio so there's no sound file to ship; browsers only allow it after the
// page has been tapped once, which staff will have done when logging in.
export function useWaitingChime(active, muted) {
  const ctxRef = useRef(null);
  useEffect(() => {
    if (!active || muted) return undefined;
    const play = () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        ctxRef.current = ctxRef.current || new Ctx();
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        [880, 1175].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = ctx.currentTime + i * 0.18;
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.17);
        });
      } catch (e) {
        /* sound is a bonus; never break the inbox over it */
      }
    };
    play();
    const id = setInterval(play, 4000);
    return () => clearInterval(id);
  }, [active, muted]);
}

export function NewOrderCard({ order, now, onError }) {
  const [prep, setPrep] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const remaining = order.acceptBy ? order.acceptBy - now : null;
  const expired = remaining !== null && remaining <= 0;
  const urgent = remaining !== null && remaining > 0 && remaining <= 60000;

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`agg-card agg-${order.platform}`} aria-label={`New ${order.platformLabel} order ${order.externalOrderId}`}>
      <header className="agg-card-head">
        <span className="agg-badge">{order.platformLabel}</span>
        <span className="agg-oid">#{order.externalOrderId}</span>
        {order.simulated && <span className="agg-tag">Test</span>}
        <span className={`agg-timer ${urgent ? "urgent" : ""} ${expired ? "expired" : ""}`} role="timer">
          {remaining === null ? "" : expired ? "Time up" : `Accept within ${mmss(remaining)}`}
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
      {order.unmappedItems > 0 && (
        <p className="agg-warn">
          {order.unmappedItems} item{order.unmappedItems > 1 ? "s are" : " is"} not linked to your menu yet (stock won't be counted).
        </p>
      )}

      <div className="agg-meta">
        <span>{order.username}</span>
        <span>{order.paymentType}</span>
        <strong>{money(order.totalCost)}</strong>
      </div>

      {expired && (
        <p className="agg-warn">
          The accept time has passed — {order.platformLabel} may already have cancelled it. You can still try to accept.
        </p>
      )}

      {!rejecting ? (
        <div className="agg-actions">
          <div className="agg-prep" role="group" aria-label="Preparation time">
            <span className="agg-prep-label">Ready in</span>
            {PREP_TIME_CHOICES.map((m) => (
              <button
                key={m}
                type="button"
                className={`agg-chip ${prep === m ? "on" : ""}`}
                aria-pressed={prep === m}
                onClick={() => setPrep(m)}
              >
                {m} min
              </button>
            ))}
          </div>
          <div className="agg-buttons">
            <button type="button" className="agg-btn ghost" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </button>
            <button
              type="button"
              className="agg-btn primary"
              disabled={busy || !prep}
              title={prep ? "" : "Choose a preparation time first"}
              onClick={() => run(() => acceptAggregatorOrder(order.id, prep))}
            >
              {busy ? "Accepting…" : prep ? `Accept · ${prep} min` : "Accept"}
            </button>
          </div>
        </div>
      ) : (
        <div className="agg-actions">
          <label className="agg-reason">
            <span>Why are you rejecting it?</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Choose a reason</option>
              {REJECT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="agg-buttons">
            <button type="button" className="agg-btn ghost" disabled={busy} onClick={() => setRejecting(false)}>
              Back
            </button>
            <button
              type="button"
              className="agg-btn danger"
              disabled={busy || !reason}
              onClick={() => run(() => rejectAggregatorOrder(order.id, reason))}
            >
              {busy ? "Rejecting…" : "Reject order"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Current time, ticking every second (or a fixed value in tests). */
export function useNow(fixed) {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (fixed !== undefined) return undefined;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fixed]);
  return fixed ?? tick;
}

/** Cancellation warnings the kitchen has acknowledged (kept for this browser session). */
export function useDismissed() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismiss = (id) => {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch (e) {
      /* not critical */
    }
  };
  return [dismissed, dismiss];
}

export const selectFailedSync = (orders) =>
  orders.filter((o) => o.sync && o.sync.state === "failed" && !["cancelled", "delivered"].includes(o.aggregatorStatus));

export const selectCancelledAfterAccept = (orders, dismissed) =>
  orders.filter((o) => o.aggregatorStatus === "cancelled" && o.prepMinutes && !dismissed.has(o.id));

/**
 * "Stop preparing" warnings for orders the platform cancelled after the
 * kitchen accepted them, and "Retry" for statuses that couldn't be sent.
 */
export function AggregatorAlerts({ orders, dismissed, onDismiss, onError }) {
  const retry = async (id) => {
    try {
      await retryAggregatorSync(id);
    } catch (e) {
      onError(e.message || "Couldn't retry. Please try again.");
    }
  };
  return (
    <>
      {selectCancelledAfterAccept(orders, dismissed).map((o) => (
        <div className="agg-alert cancel" role="alert" key={o.id}>
          <span>
            <b>{o.platformLabel} cancelled #{o.externalOrderId}</b> — stop preparing it.
            {o.cancelReason ? ` Reason: ${String(o.cancelReason).replace(/_/g, " ")}.` : ""}
          </span>
          <button type="button" className="agg-btn ghost" onClick={() => onDismiss(o.id)}>
            OK
          </button>
        </div>
      ))}
      {selectFailedSync(orders).map((o) => (
        <div className="agg-alert sync" role="alert" key={o.id}>
          <span>
            <b>
              Couldn't tell {o.platformLabel} that #{o.externalOrderId} is {String(o.aggregatorStatus).replace(/_/g, " ")}.
            </b>{" "}
            {o.sync.lastError}
          </span>
          <button type="button" className="agg-btn ghost" onClick={() => retry(o.id)}>
            Retry
          </button>
        </div>
      ))}
    </>
  );
}

/**
 * Online orders inbox (Swiggy / Zomato), shown at the top of the Orders page.
 * - New orders: accept with a prep time, or reject with a reason, before the
 *   platform's deadline. A chime repeats while any are waiting.
 * - Needs attention: a status that couldn't be sent to the platform (Retry),
 *   or an order the platform cancelled after the kitchen had accepted it.
 * Renders nothing when there's nothing to act on.
 */
function AggregatorInbox({ orders = [], now: nowProp }) {
  const now = useNow(nowProp);
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [dismissed, dismiss] = useDismissed();

  const waiting = useMemo(() => orders.filter((o) => o.aggregatorStatus === "placed"), [orders]);
  const attention = selectFailedSync(orders).length + selectCancelledAfterAccept(orders, dismissed).length;

  useWaitingChime(waiting.length > 0, muted);

  if (!waiting.length && !attention) return null;

  return (
    <section className="agg-inbox" aria-label="Online orders">
      <div className="agg-inbox-head">
        <h2>
          Online orders
          {waiting.length > 0 && <span className="agg-count">{waiting.length} new</span>}
        </h2>
        {waiting.length > 0 && (
          <button type="button" className="agg-mute" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
            {muted ? "Sound off" : "Sound on"}
          </button>
        )}
      </div>

      {error && (
        <div className="agg-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <AggregatorAlerts orders={orders} dismissed={dismissed} onDismiss={dismiss} onError={setError} />

      {waiting.length > 0 && (
        <div className="agg-grid">
          {waiting.map((o) => (
            <NewOrderCard key={o.id} order={o} now={now} onError={setError} />
          ))}
        </div>
      )}
    </section>
  );
}

export default AggregatorInbox;
