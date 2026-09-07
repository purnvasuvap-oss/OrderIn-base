import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import "./KitchenDisplay.css";
import {
  subscribeRecentOrders,
  acceptOrderAndDeduct,
  rejectOrder,
  updateOrderStatus,
  isOrderAccepted,
  isOrderActive,
  isOrderDelivered,
  normalizeOrderStatus,
} from "../services/orderService";
import { parseOrderTimestamp } from "../utils/orderDateTime";
import { printKitchenTicket } from "../utils/printKitchenTicket";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import RejectReasonModal from "../components/RejectReasonModal";
import { Printer } from "lucide-react";

// Kiosk-style Kitchen Display — a scoped-down extraction of Orders.jsx's
// board view (same lanes/lifecycle), stripped of admin-only info
// (phone numbers, prices, filters, list view) and enlarged for a screen
// staff read from a few feet away. See services/orderService.js for the
// underlying order lifecycle (Pending -> Preparing -> Ready -> Delivered).
const LANES = ["Pending", "Preparing", "Ready", "Delivered"];
const BOARD_LANES = ["Queued", "Pending", "Preparing", "Ready", "Delivered"];
const LANE_LABEL = {
  Queued: "New",
  Pending: "Accepted",
  Preparing: "Preparing",
  Ready: "Ready",
  Delivered: "Picked Up",
};
const NEXT_STATUS = { Pending: "Preparing", Preparing: "Ready", Ready: "Delivered" };
const NEXT_LABEL = {
  Pending: "Start preparing",
  Preparing: "Mark ready",
  Ready: "Mark picked up",
};
// A ticket left un-advanced past this long is flagged OVERDUE. A completed
// (Delivered) ticket older than this drops off the board entirely so it
// doesn't clutter the screen.
const OVERDUE_MS = 10 * 60 * 1000;

const laneOf = (o) => {
  if (isOrderDelivered(o)) return "Delivered";
  if (isOrderActive(o)) {
    const normalized = normalizeOrderStatus(o.status);
    return LANES.includes(normalized) && normalized !== "Delivered" ? normalized : "Pending";
  }
  return "Queued";
};

const formatElapsed = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

function KitchenDisplay() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [rejectingOrderId, setRejectingOrderId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const menuItemsByName = useMemo(() => {
    const map = {};
    for (const item of menuItems) {
      if (item.name) map[item.name] = item;
    }
    return map;
  }, [menuItems]);

  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const menuRef = collection(db, "Restaurant", "orderin_restaurant_4", "menu");
        const snapshot = await getDocs(menuRef);
        setMenuItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("KitchenDisplay: error fetching menu items:", err);
      }
    };
    fetchMenuItems();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeRecentOrders((fetchedOrders) => {
      const rejectedStatuses = new Set(["rejected", "cancelled", "canceled", "declined"]);
      const displayOrders = fetchedOrders.filter((o) => {
        const paymentStatus = String(o.paymentStatus || "").toLowerCase();
        const orderStatus = String(o.status || "").toLowerCase().trim();
        if (rejectedStatuses.has(orderStatus)) return false;
        return (
          paymentStatus === "paid" ||
          paymentStatus === "manual" ||
          paymentStatus === "unpaid" ||
          paymentStatus === "unknown"
        );
      });
      setOrders(displayOrders);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Live-ticking clock for elapsed timers / overdue flags.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = async (orderId) => {
    try {
      setUpdatingOrderId(orderId);
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await acceptOrderAndDeduct(order, menuItemsByName);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: "Preparing" } : o)));
    } catch (err) {
      console.error("KitchenDisplay: error accepting order:", err);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleReject = (orderId) => setRejectingOrderId(orderId);

  const handleConfirmReject = async (reason) => {
    const orderId = rejectingOrderId;
    if (!orderId) return;
    try {
      setUpdatingOrderId(orderId);
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await rejectOrder(order.phoneNumber, order.id, reason);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      console.error("KitchenDisplay: error rejecting order:", err);
    } finally {
      setUpdatingOrderId(null);
      setRejectingOrderId(null);
    }
  };

  const handleAdvance = async (orderId, nextStatus) => {
    try {
      setUpdatingOrderId(orderId);
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await updateOrderStatus(order.phoneNumber, order.id, nextStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    } catch (err) {
      console.error("KitchenDisplay: error advancing order:", err);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const visibleOrders = orders.filter((o) => {
    if (!isOrderDelivered(o)) return true;
    const orderedAt = parseOrderTimestamp(o);
    if (!orderedAt) return false;
    return now - orderedAt.getTime() <= OVERDUE_MS;
  });

  return (
    <div className="kds-wrapper">
      <div className="kds-header">
        <button type="button" className="kds-back" onClick={() => navigate(routes.dashboard)}>
          ← Dashboard
        </button>
        <h1>Kitchen Display</h1>
        <span className="kds-live"><span className="kds-live-dot" />Live</span>
      </div>

      <div className="kds-board">
        {BOARD_LANES.map((lane) => {
          const cards = visibleOrders.filter((o) => laneOf(o) === lane);
          return (
            <div className={`kds-lane kds-lane--${lane.toLowerCase()}`} key={lane}>
              <div className="kds-lane-head">
                <span className="kds-lane-title">{LANE_LABEL[lane]}</span>
                <span className="kds-lane-count">{cards.length}</span>
              </div>
              <div className="kds-lane-body">
                {cards.length === 0 ? (
                  <div className="kds-lane-empty">Nothing here</div>
                ) : (
                  cards.map((o) => {
                    const accepted = isOrderAccepted(o);
                    const delivered = isOrderDelivered(o);
                    const active = isOrderActive(o);
                    const normalizedStatus = normalizeOrderStatus(o.status);
                    const curLane = LANES.includes(normalizedStatus) ? normalizedStatus : "Pending";
                    const orderedAt = parseOrderTimestamp(o);
                    const elapsedMs = orderedAt ? now - orderedAt.getTime() : 0;
                    const overdue = !delivered && elapsedMs > OVERDUE_MS;
                    const isUpdating = updatingOrderId === o.id;

                    return (
                      <div className={`kds-ticket ${overdue ? "kds-ticket--overdue" : ""}`} key={o.id}>
                        <div className="kds-ticket-top">
                          <span className="kds-ticket-id">{o.id}</span>
                          <span className={`kds-ticket-timer ${overdue ? "kds-ticket-timer--overdue" : ""}`}>
                            {orderedAt ? formatElapsed(elapsedMs) : "—"}
                            {overdue && <span className="kds-overdue-label">OVERDUE</span>}
                          </span>
                          <button
                            type="button"
                            className="kds-print-btn"
                            onClick={() => printKitchenTicket(o)}
                            aria-label="Print kitchen ticket"
                            title="Print ticket"
                          >
                            <Printer size={16} />
                          </button>
                        </div>

                        <div className="kds-ticket-meta">
                          {o.orderType && o.orderType !== "Dine-in"
                            ? o.orderType
                            : `Table ${o.tableNumber ?? "—"}`}
                        </div>

                        <div className="kds-ticket-items">
                          {Array.isArray(o.items) &&
                            o.items.map((it, i) => (
                              <div className="kds-ticket-item" key={i}>
                                <span className="kds-ticket-qty">{it.quantity || 1}×</span>
                                <span className="kds-ticket-name">{it.name}</span>
                                {it.instructions && (
                                  <div className="kds-ticket-instructions">{it.instructions}</div>
                                )}
                              </div>
                            ))}
                        </div>

                        <div className="kds-ticket-action">
                          {delivered ? (
                            <span className="kds-done">Picked up ✓</span>
                          ) : !accepted ? (
                            <div className="kds-accept-row">
                              <button
                                type="button"
                                className="kds-btn kds-btn--accept"
                                disabled={isUpdating}
                                onClick={() => handleAccept(o.id)}
                              >
                                {isUpdating ? "…" : "Accept"}
                              </button>
                              <button
                                type="button"
                                className="kds-btn kds-btn--reject"
                                disabled={isUpdating}
                                onClick={() => handleReject(o.id)}
                              >
                                Reject
                              </button>
                            </div>
                          ) : active ? (
                            <button
                              type="button"
                              className="kds-btn kds-btn--advance"
                              disabled={isUpdating}
                              onClick={() => handleAdvance(o.id, NEXT_STATUS[curLane])}
                            >
                              {isUpdating ? "Updating…" : NEXT_LABEL[curLane]}
                            </button>
                          ) : (
                            <span className="kds-await">Awaiting payment</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <RejectReasonModal
        isOpen={rejectingOrderId !== null}
        onClose={() => setRejectingOrderId(null)}
        onConfirm={handleConfirmReject}
      />
    </div>
  );
}

export default KitchenDisplay;
