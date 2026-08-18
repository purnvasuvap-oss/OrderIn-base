import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import routes from "../routes";
import "./Orders.css";
import {
  updateOrderStatus,
  formatTime,
  subscribeRecentOrders,
  isOrderAccepted,
  isOrderQueued,
  isOrderActive,
  isOrderDelivered,
  isOrderWithinLast24Hours,
  normalizeOrderStatus,
} from "../services/orderService";

import TotalOrdersIcon from "./landingpage/Total_orders.svg";
import ActiveOrdersIcon from "./landingpage/Active_Orders.svg";
import CompletedIcon from "./landingpage/Completed.svg";
import QueuedOrdersIcon from "./landingpage/orders_today.svg";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import OrderItemListModal from "../components/OrderItemListModal/OrderItemListModal";
import AllOrdersOverlay from "../components/AllOrdersOverlay/AllOrdersOverlay";
import ManualOrderModal from "../components/ManualOrderModal";

/**
 * Status control — two behaviours, unified into one component (ported
 * from the Olive Green admin app's redesign):
 *  • accepted + editing     -> <select>
 *  • accepted               -> status pill (click to edit)
 * Accept/Reject now happens in Finance's Daily Transit tab, not here — an
 * order only reaches this page once its payment is collected, so an
 * unaccepted-but-paid order shows a plain, non-interactive "Pending" pill
 * instead of an Accept/Reject box.
 */
function StatusPill({ status, onStatusChange, orderId, isLoading, order }) {
  const [isEditing, setIsEditing] = useState(false);
  const normalizedStatus = normalizeOrderStatus(status);
  const key = normalizedStatus.toLowerCase().replace(/\s+/g, "-");
  const accepted = order ? isOrderAccepted(order) : true;

  const handleClick = () => {
    if (!isLoading && accepted) setIsEditing(true);
  };
  const handleChange = async (e) => {
    const newStatus = e.target.value;
    setIsEditing(false);
    await onStatusChange(orderId, newStatus);
  };
  const handleBlur = () => setIsEditing(false);

  if (!accepted && !isEditing) {
    return (
      <span className="pill pending" title="Awaiting acceptance in Finance → Daily Transit">
        <span className="pill-dot" />
        Pending
      </span>
    );
  }

  if (isEditing) {
    // Forward-only: only the current status and its later stages are
    // selectable, so this dropdown can't be used to accidentally regress an
    // already-cooking order (e.g. "Ready" back to "Pending"), which would
    // silently re-queue it in the kitchen board.
    const currentLaneIndex = LANES.indexOf(normalizedStatus);
    const selectableStatuses = currentLaneIndex === -1 ? LANES : LANES.slice(currentLaneIndex);
    return (
      <select
        value={normalizedStatus}
        onChange={handleChange}
        onBlur={handleBlur}
        autoFocus
        className="status-select"
        disabled={isLoading}
      >
        {selectableStatuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    );
  }

  const label = normalizedStatus === "Delivered" ? "Served" : normalizedStatus;
  return (
    <button
      type="button"
      className={`pill ${key} ${isLoading ? "loading" : ""}`}
      onClick={handleClick}
      disabled={isLoading}
    >
      <span className="pill-dot" />
      {isLoading ? "Updating…" : label}
    </button>
  );
}

/* ---------- pure helpers ---------- */
const LANES = ["Pending", "Preparing", "Ready", "Delivered"];
const BOARD_LANES = ["Queued", "Pending", "Preparing", "Ready", "Delivered"];
const LANE_LABEL = {
  Queued: "Queued",
  Pending: "Pending",
  Preparing: "Preparing",
  Ready: "Ready",
  Delivered: "Served",
};
const NEXT_STATUS = { Pending: "Preparing", Preparing: "Ready", Ready: "Delivered" };
const NEXT_LABEL = {
  Pending: "Start preparing",
  Preparing: "Mark ready",
  Ready: "Mark served",
};

const laneOf = (o) => {
  if (isOrderDelivered(o)) return "Delivered";
  if (isOrderActive(o)) {
    const normalized = normalizeOrderStatus(o.status);
    return LANES.includes(normalized) && normalized !== "Delivered" ? normalized : "Pending";
  }
  return "Queued";
};

const getMs = (t) => {
  if (!t) return 0;
  if (typeof t === "string") return new Date(t).getTime() || 0;
  if (t.seconds) return t.seconds * 1000;
  if (typeof t.toDate === "function") return t.toDate().getTime();
  const d = new Date(t);
  return isNaN(d) ? 0 : d.getTime();
};

const totalQty = (o) =>
  Array.isArray(o.items)
    ? o.items.reduce((a, it) => a + (Number(it.quantity) || 1), 0)
    : 0;

const money = (n) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [itemsListOrder, setItemsListOrder] = useState(null);
  const [showAllOrdersOverlay, setShowAllOrdersOverlay] = useState(false);

  // UI-only state (never touches Firestore)
  const [view, setView] = useState("list"); // "list" | "board"
  const [density, setDensity] = useState("comfy"); // "comfy" | "dense"
  const [sortBy, setSortBy] = useState("new");
  const [expanded, setExpanded] = useState(() => new Set());

  const toggleExpand = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Deep-link into Orders from other pages via `navigate(routes.orders, { state })`.
  // Table Management's "View order" action passes `{ tableNumber }` so staff
  // land here already filtered to that table; the Notifications "Order
  // Alerts" tab passes `{ searchTerm: order.id }` so clicking an alert jumps
  // straight to that order. `searchTerm` takes priority when both would
  // otherwise apply. Applied once on mount (an empty dep array — a fresh nav
  // always mounts this page anew) so it doesn't fight with the user's own
  // subsequent edits to the search box.
  useEffect(() => {
    const searchTermFromNav = location.state?.searchTerm;
    if (searchTermFromNav !== undefined && searchTermFromNav !== null) {
      setSearchTerm(String(searchTermFromNav));
      return;
    }
    const tableNumberFromNav = location.state?.tableNumber;
    if (tableNumberFromNav !== undefined && tableNumberFromNav !== null) {
      setSearchTerm(String(tableNumberFromNav));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restaurants mostly run this on tablets/phones, where the multi-lane
  // board view is unwieldy — force the simple card list below the same
  // breakpoint the CSS already uses to turn table rows into stacked cards.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const enforceListOnMobile = (e) => {
      if (e.matches) setView("list");
    };
    enforceListOnMobile(mq);
    mq.addEventListener("change", enforceListOnMobile);
    return () => mq.removeEventListener("change", enforceListOnMobile);
  }, []);

  // Fetch menu items on mount
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const menuRef = collection(
          db,
          "Restaurant",
          "orderin_restaurant_4",
          "menu",
        );
        const menuSnapshot = await getDocs(menuRef);
        const items = menuSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMenuItems(items);
      } catch (err) {
        console.error("Error fetching menu items:", err);
      }
    };
    fetchMenuItems();
  }, []);

  // Fetch orders on component mount
  useEffect(() => {
    // Use real-time subscription so status changes update automatically in
    // background. subscribeRecentOrders keeps each order visible for a
    // rolling 24 hours from its own timestamp instead of clearing out at
    // midnight.
    console.log("=== ORDERS COMPONENT: Subscribing to orders (real-time) ===");
    setLoading(true);
    const unsubscribe = subscribeRecentOrders((fetchedOrders) => {
      console.log(
        `=== ORDERS COMPONENT (realtime): Received ${fetchedOrders.length} orders ===`,
      );
      // Rejected/cancelled/declined orders are excluded from the live list
      // entirely — they're a terminal, non-editable state and shouldn't
      // clutter the working order queue. Unpaid orders are also excluded
      // here: Accept/Reject and payment collection now happen in Finance's
      // Daily Transit tab, and an order only surfaces on this page once its
      // payment has actually been collected (paid, or manual — manual
      // orders are marked paid automatically when created).
      const rejectedStatuses = new Set(["rejected", "cancelled", "canceled", "declined"]);
      const displayOrders = fetchedOrders.filter((o) => {
        const paymentStatus = String(o.paymentStatus || "").toLowerCase();
        const orderStatus = String(o.status || "").toLowerCase().trim();
        if (rejectedStatuses.has(orderStatus)) return false;
        return paymentStatus === "paid" || paymentStatus === "manual";
      });
      setOrders(displayOrders);
      setError(null);
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Local prune so orders drop off exactly at their own 24h mark, between
  // live snapshots.
  useEffect(() => {
    const pruneInterval = setInterval(() => {
      setOrders((prevOrders) => {
        const pruned = prevOrders.filter((o) => isOrderWithinLast24Hours(o.timestamp));
        return pruned.length === prevOrders.length ? prevOrders : pruned;
      });
    }, 60000);
    return () => clearInterval(pruneInterval);
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setUpdatingOrderId(orderId);

      // Find the order to get its phoneNumber
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        setError("Order not found");
        return;
      }

      // Update in Firebase. Pass the stable order.id (not a raw array
      // index) — updateOrderStatus looks the order up by id first.
      await updateOrderStatus(order.phoneNumber, order.id, newStatus);

      // Update local state
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === orderId ? { ...o, status: newStatus } : o,
        ),
      );
    } catch (err) {
      console.error("Error updating status:", err);
      setError("Failed to update order status");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const total = orders.length;
  const queued = orders.filter(isOrderQueued).length;
  const active = orders.filter(isOrderActive).length;
  const completed = orders.filter(isOrderDelivered).length;
  const largeCount = orders.filter((o) => totalQty(o) >= 5).length;

  const matchesSearch = (o) => {
    const q = searchTerm.toLowerCase();
    const inItems =
      Array.isArray(o.items) &&
      o.items.some((item) => {
        if (typeof item === "string") return item.toLowerCase().includes(q);
        if (item && typeof item === "object") {
          const nameMatch = item.name && item.name.toLowerCase().includes(q);
          const insMatch =
            item.instructions && item.instructions.toLowerCase().includes(q);
          return nameMatch || insMatch;
        }
        return false;
      });
    // Table Management's "View order" link (and manual searches like
    // "table 7" or just "7") should also match on the order's table number.
    // Reuses the same tableNumber/tableNo/table fallback chain as
    // utils/tableCount.js so no records are missed.
    const tableNumberValue = o.tableNumber || o.tableNo || o.table || "";
    const inTable = String(tableNumberValue).toLowerCase().includes(q);
    // The Order Alerts tab in Notifications deep-links here with the
    // order's own id as the search term, so it must be matchable too.
    const inId = String(o.id || "").toLowerCase().includes(q);
    return (
      inItems ||
      inTable ||
      inId ||
      (o.username || "").toLowerCase().includes(q) ||
      (o.phoneNumber || "").toLowerCase().includes(q)
    );
  };

  const filteredOrders = (() => {
    let filtered = orders;
    if (filter === "completed") filtered = orders.filter(isOrderDelivered);
    else if (filter === "active") filtered = orders.filter(isOrderActive);
    else if (filter === "queued") filtered = orders.filter(isOrderQueued);
    else if (filter === "large") filtered = orders.filter((o) => totalQty(o) >= 5);

    if (searchTerm) filtered = filtered.filter(matchesSearch);

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "new") return getMs(b.timestamp) - getMs(a.timestamp);
      if (sortBy === "old") return getMs(a.timestamp) - getMs(b.timestamp);
      const va = Number(a.totalCost) || 0;
      const vb = Number(b.totalCost) || 0;
      if (sortBy === "high") return vb - va;
      if (sortBy === "low") return va - vb;
      return 0;
    });
    return sorted;
  })();

  const titleMap = {
    all: ["Total Orders", "All orders from the last 24 hours"],
    queued: ["Queued Orders", "Awaiting acceptance in Daily Transit"],
    active: ["Active Orders", "In the kitchen right now"],
    completed: ["Served Orders", "Delivered today"],
    large: ["Large Orders", "Orders with 5 or more items"],
  };
  const [pageTitle, pageSub] = titleMap[filter] || titleMap.all;

  const statCards = [
    { key: "all", label: "Total Orders", cap: "Last 24 hours", count: total, color: "#F2BB46", icon: TotalOrdersIcon },
    { key: "queued", label: "Queued", cap: "Awaiting acceptance", count: queued, color: "#2F6FB0", icon: QueuedOrdersIcon },
    { key: "active", label: "Active", cap: "In the kitchen", count: active, color: "#B5823F", icon: ActiveOrdersIcon },
    { key: "completed", label: "Served", cap: "Delivered today", count: completed, color: "#3FA34D", icon: CompletedIcon },
    { key: "large", label: "Large Orders", cap: "5+ items", count: largeCount, color: "#D2691E", icon: null },
  ];

  return (
    <div className={`orders-page ${view === "board" ? "boardmode" : ""}`}>
      {/* Page head */}
      <div className="pagehead">
        <div>
          <h1 className="page-h1">{pageTitle}</h1>
          <div className="page-sub">{pageSub}</div>
        </div>
        <button className="back-btn" onClick={() => navigate(routes.dashboard)}>
          ← Back to Dashboard
        </button>
      </div>

      {/* Stat filter strip */}
      <div className="stats-strip">
        {statCards.map((s) => (
          <button
            key={s.key}
            className={`statc ${filter === s.key ? "on" : ""}`}
            style={{ "--sc": s.color }}
            aria-pressed={filter === s.key}
            onClick={() => setFilter(s.key)}
          >
            <div className="statc-top">
              <span className="statc-ic">
                {s.icon ? (
                  <img src={s.icon} alt="" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="5" rx="1" />
                    <rect x="3" y="10" width="18" height="5" rx="1" />
                    <rect x="3" y="16" width="18" height="4" rx="1" />
                  </svg>
                )}
              </span>
              <span className="statc-lbl">{s.label}</span>
            </div>
            <div className="statc-n">{s.count}</div>
            <div className="statc-cap">{s.cap}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="viewtoggle">
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            List
          </button>
          <button className={view === "board" ? "on" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="6" height="18" rx="1" /><rect x="10.5" y="3" width="6" height="12" rx="1" /><rect x="18" y="3" width="3" height="16" rx="1" />
            </svg>
            Board
          </button>
        </div>

        <div className="search">
          <span className="search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input placeholder="Search items, customer, or phone" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        <div className="tb-spacer" />

        <div className="density" role="group" aria-label="Row density">
          <button className={density === "comfy" ? "on" : ""} aria-pressed={density === "comfy"} onClick={() => setDensity("comfy")}>Comfortable</button>
          <button className={density === "dense" ? "on" : ""} aria-pressed={density === "dense"} onClick={() => setDensity("dense")}>Compact</button>
        </div>

        <select className="sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort orders">
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="high">Amount: high → low</option>
          <option value="low">Amount: low → high</option>
        </select>

        <button className="all-orders-btn" onClick={() => setShowAllOrdersOverlay(true)}>All Orders</button>
        <button className="manual-order-btn" onClick={() => setShowManualOrderModal(true)}>+ Manual Order</button>
      </div>

      {error && <div className="error-message inline">{error}</div>}

      {loading ? (
        <div className="state-msg">Loading recent orders…</div>
      ) : filteredOrders.length === 0 ? (
        <div className="state-msg empty">
          <div className="state-big">
            {orders.length === 0 ? "No orders in the last 24 hours" : "No orders match your view"}
          </div>
          <div>Try a different filter or clear the search.</div>
        </div>
      ) : view === "list" ? (
        /* ---------------- LIST VIEW (responsive: table → stacked cards) ---------------- */
        <div className={`orders-panel ${density === "dense" ? "dense" : ""}`}>
          <div className="tbl-head">
            <span>Order</span>
            <span>Customer</span>
            <span>Items</span>
            <span>Status</span>
            <span className="th-time">Time</span>
          </div>

          <div className="scrollzone">
            {filteredOrders.map((o, idx) => {
              const first = Array.isArray(o.items) ? o.items[0] : null;
              const isOpen = expanded.has(o.id);
              return (
                <div className="orow" key={o.id + "-" + idx}>
                  <div className="cell">
                    <span className="cell-label">Order</span>
                    <div className="oid" title={o.id}>
                      {o.id}
                      {o.isManualOrder && <span className="oid-tag">Manual</span>}
                    </div>
                  </div>

                  <div className="cell cust">
                    <span className="cell-label">Customer</span>
                    <div className="cust-name">{o.username}</div>
                    <div className="cust-meta">Table <b>{o.tableNumber}</b> · {o.phoneNumber}</div>
                  </div>

                  <div className="cell">
                    <span className="cell-label">Items</span>
                    <div className={`oitems ${isOpen ? "open" : ""}`}>
                      <div
                        className="oitems-summary"
                        onClick={() => toggleExpand(o.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleExpand(o.id)}
                      >
                        <span className="oitems-lead">
                          {first ? `${first.quantity || 1}× ${first.name}` : "—"}
                        </span>
                        {Array.isArray(o.items) && o.items.length > 1 && (
                          <span className="oitems-more">+{o.items.length - 1} more</span>
                        )}
                        <span className="oitems-qty">· {totalQty(o)} qty</span>
                        <svg className="oitems-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 18l6-6-6-6" /></svg>
                      </div>
                      <div className="oitems-detail">
                        {Array.isArray(o.items) &&
                          o.items.map((it, i) => (
                            <div className="oitems-li" key={i}>
                              <span className="q">{it.quantity || 1}×</span>
                              <span className="nm">{it.name}</span>
                              {it.instructions && <span className="ins">— {it.instructions}</span>}
                            </div>
                          ))}
                      </div>
                      <button className="items-list-btn" onClick={() => setItemsListOrder(o)}>
                        Items List
                      </button>
                    </div>
                  </div>

                  <div className="cell">
                    <span className="cell-label">Status</span>
                    <StatusPill
                      status={o.status}
                      onStatusChange={handleStatusChange}
                      orderId={o.id}
                      isLoading={updatingOrderId === o.id}
                      order={o}
                    />
                  </div>

                  <div className="cell otime">
                    <span className="cell-label">Time</span>
                    {formatTime(o.timestamp)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="listfoot">
            <span className="live"><span className="live-dot" />Live</span>
            <span>Showing {filteredOrders.length} of {orders.length} orders · auto-prunes after 24h</span>
          </div>
        </div>
      ) : (
        /* ---------------- BOARD VIEW ---------------- */
        <div className="board">
          {BOARD_LANES.map((lane) => {
            const cards = filteredOrders.filter((o) => laneOf(o) === lane);
            return (
              <div className={`lane ${lane.toLowerCase()}`} key={lane}>
                <div className="lane-head">
                  <span className="lane-dot" />
                  <span className="lane-title">{LANE_LABEL[lane]}</span>
                  <span className="lane-count">{cards.length}</span>
                </div>
                <div className="lane-body">
                  {cards.length === 0 ? (
                    <div className="lane-empty">Nothing here</div>
                  ) : (
                    cards.map((o, idx) => {
                      const accepted = isOrderAccepted(o);
                      const delivered = isOrderDelivered(o);
                      const activeOrder = isOrderActive(o);
                      const normalizedStatus = normalizeOrderStatus(o.status);
                      const curLane = LANES.includes(normalizedStatus) ? normalizedStatus : "Pending";
                      return (
                        <div className="ocard" key={o.id + "-c-" + idx}>
                          <div className="ocard-top">
                            <span className="ocard-id" title={o.id}>{o.id}</span>
                            <span className="ocard-time">{formatTime(o.timestamp)}</span>
                          </div>
                          <div className="ocard-name">{o.username}</div>
                          <div className="ocard-meta">Table {o.tableNumber} · {o.phoneNumber}</div>
                          <div className="ocard-items">
                            {Array.isArray(o.items) &&
                              o.items.slice(0, 4).map((it, i) => (
                                <div key={i}>
                                  <span className="q">{it.quantity || 1}×</span> {it.name}
                                  {it.instructions && <span className="cins"> — {it.instructions}</span>}
                                </div>
                              ))}
                            {Array.isArray(o.items) && o.items.length > 4 && (
                              <div className="ocard-more">+{o.items.length - 4} more items</div>
                            )}
                          </div>
                          <div className="ocard-bot">
                            <span className="ocard-price">{money(Number(o.totalCost) || 0)}</span>
                            <button className="ocard-listbtn" onClick={() => setItemsListOrder(o)}>Items</button>
                          </div>
                          <div className="ocard-action">
                            {delivered ? (
                              <span className="served-mini">Served ✓</span>
                            ) : !accepted ? (
                              <span className="await-mini">Awaiting acceptance in Daily Transit</span>
                            ) : activeOrder ? (
                              <button
                                className="adv-btn"
                                disabled={updatingOrderId === o.id}
                                onClick={() => handleStatusChange(o.id, NEXT_STATUS[curLane])}
                              >
                                {updatingOrderId === o.id ? "Updating…" : NEXT_LABEL[curLane]}
                              </button>
                            ) : (
                              <span className="await-mini">Awaiting payment</span>
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
      )}

      <ManualOrderModal
        isOpen={showManualOrderModal}
        onClose={() => setShowManualOrderModal(false)}
        menuItems={menuItems}
        onOrderCreated={() => setShowManualOrderModal(false)}
      />

      {itemsListOrder && (
        <OrderItemListModal order={itemsListOrder} onClose={() => setItemsListOrder(null)} />
      )}

      {showAllOrdersOverlay && (
        <AllOrdersOverlay
          orders={orders.filter(isOrderActive)}
          onClose={() => setShowAllOrdersOverlay(false)}
        />
      )}
    </div>
  );
}

export default Orders;
