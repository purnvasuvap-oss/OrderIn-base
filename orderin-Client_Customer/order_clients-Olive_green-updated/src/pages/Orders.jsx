import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import "./Orders.css";
import {
  updateOrderStatus,
  formatTime,
  subscribeRecentOrders,
  acceptOrder,
  rejectOrder,
  isOrderAccepted,
  isOrderQueued,
  isOrderActive,
  isOrderDelivered,
  isOrderPaymentCollected,
  isOrderWithinLast24Hours,
} from "../services/orderService";

import TotalOrdersIcon from "./landingpage/Total_orders.svg";
import ActiveOrdersIcon from "./landingpage/Active_Orders.svg";
import CompletedIcon from "./landingpage/Completed.svg";
import QueuedOrdersIcon from "./landingpage/orders_today.svg";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import OrderItemListModal from "../components/OrderItemListModal/OrderItemListModal";
import AllOrdersOverlay from "../components/AllOrdersOverlay/AllOrdersOverlay";
import RejectReasonModal from "../components/RejectReasonModal";

/* =========================================================================
   Manual Order Modal — carried over verbatim (functionality + validation
   + stable id + awaitingConfirmation). Styled by the preserved modal CSS.
   ========================================================================= */
function ManualOrderModal({ isOpen, onClose, menuItems, onOrderCreated }) {
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const filteredMenu = menuItems.filter((item) =>
    item.name?.toLowerCase().includes(menuSearch.toLowerCase()),
  );

  const addItemToOrder = (menuItem) => {
    setSelectedItems([
      ...selectedItems,
      {
        name: menuItem.name,
        quantity: 1,
        instructions: "",
        menuId: menuItem.id,
        price: menuItem.price || 0,
      },
    ]);
  };

  const updateItemQuantity = (index, quantity) => {
    const updated = [...selectedItems];
    updated[index].quantity = parseInt(quantity) || 0;
    setSelectedItems(updated);
  };

  const updateItemInstructions = (index, instructions) => {
    const updated = [...selectedItems];
    updated[index].instructions = instructions;
    setSelectedItems(updated);
  };

  const removeItem = (index) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    try {
      setError("");
      if (!customerName.trim()) {
        setError("Customer name is required");
        return;
      }
      if (!phoneNumber.trim()) {
        setError("Phone number is required");
        return;
      }
      // Issue #27 / TH-3: phone number previously accepted any string
      // (letters, wrong length, etc.), creating customer docs that
      // couldn't be found later by phone-based login.
      if (!/^\d{10}$/.test(phoneNumber.trim())) {
        setError("Phone number must be exactly 10 digits");
        return;
      }
      if (!tableNumber.trim()) {
        setError("Table number is required");
        return;
      }
      if (selectedItems.length === 0) {
        setError("Add at least one item");
        return;
      }

      setIsSubmitting(true);

      // Store manual order in customers collection (same as regular orders)
      const customerRef = doc(
        db,
        "Restaurant",
        "orderin_restaurant_3",
        "customers",
        phoneNumber,
      );

      // Get existing customer data or create new
      const customerSnap = await getDoc(customerRef);
      const customerData = customerSnap.exists() ? customerSnap.data() : {};

      // Calculate order totals
      let subtotal = 0;
      selectedItems.forEach((item) => {
        const itemPrice =
          Number(String(item.price || 0).replace(/[^0-9.-]+/g, "")) || 0;
        const itemQty = Number(item.quantity) || 1;
        subtotal += itemPrice * itemQty;
      });
      const tax = subtotal > 0 ? Math.ceil(subtotal / 100) : 0;
      const totalCost = subtotal + tax;

      // Add manual order to pastOrders array
      // Issue #17 / TB-13: manual orders previously had no `id` field, so the
      // admin table fell back to `ORD-{phone}-{index}`, which shifts if
      // orders are ever reordered/removed. Generate a stable id up front.
      const newOrder = {
        id: `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        username: customerName,
        phoneNumber: phoneNumber,
        tableNo: parseInt(tableNumber),
        items: selectedItems,
        status: "Pending",
        timestamp: new Date().toISOString(),
        isManualOrder: true,
        // Manual orders are entered directly by staff, so they don't go
        // through the customer-side accept/reject queue.
        awaitingConfirmation: false,
        paymentStatus: "manual",
        paymentType: "Manual",
        subtotal: subtotal,
        tax: tax,
        totalCost: totalCost,
        amount: totalCost,
      };

      const pastOrders = Array.isArray(customerData.pastOrders)
        ? customerData.pastOrders
        : [];
      pastOrders.push(newOrder);

      await setDoc(
        customerRef,
        {
          username: customerName,
          names: [customerName],
          pastOrders: pastOrders,
        },
        { merge: true },
      );

      onOrderCreated();
      onClose();
      setCustomerName("");
      setPhoneNumber("");
      setTableNumber("");
      setMenuSearch("");
      setSelectedItems([]);
    } catch (err) {
      console.error("Error creating manual order:", err);
      setError("Failed to create order: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="manual-order-overlay" onClick={onClose}>
      <div className="manual-order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Manual Order</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-content">
          <div className="customer-info-section">
            <h3>Customer Information</h3>
            <div className="form-group">
              <label>Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
            <div className="form-group">
              <label>Table Number</label>
              <input
                type="number"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Enter table number"
              />
            </div>
          </div>

          <div className="menu-selection-section">
            <h3>Add Items from Menu</h3>
            <div className="menu-search">
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search menu items..."
              />
            </div>

            <div className="menu-list">
              {filteredMenu.map((item) => (
                <div key={item.id} className="menu-item">
                  <div className="item-info">
                    <div className="item-name">{item.name}</div>
                    {item.price && (
                      <div className="item-price">₹{item.price}</div>
                    )}
                  </div>
                  <button
                    className="add-item-btn"
                    onClick={() => addItemToOrder(item)}
                  >
                    + Add
                  </button>
                </div>
              ))}
              {filteredMenu.length === 0 && (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    color: "#999",
                  }}
                >
                  No items found
                </div>
              )}
            </div>
          </div>

          <div className="selected-items-section">
            <h3>Selected Items ({selectedItems.length})</h3>
            <div className="selected-items-list">
              {selectedItems.map((item, index) => (
                <div key={index} className="selected-item">
                  <div className="item-details">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItemQuantity(index, e.target.value)
                      }
                      className="qty-input"
                    />
                    <span className="item-label">x {item.name}</span>
                  </div>
                  <div className="item-specs">
                    <input
                      type="text"
                      value={item.instructions}
                      onChange={(e) =>
                        updateItemInstructions(index, e.target.value)
                      }
                      placeholder="Special instructions..."
                      className="specs-input"
                    />
                  </div>
                  <button
                    className="remove-item-btn"
                    onClick={() => removeItem(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="cancel-btn"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedItems.length === 0}
          >
            {isSubmitting ? "Creating..." : "Create Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Status control — same three behaviours as before, restyled:
   • not accepted (queued)  -> Accept / Reject
   • accepted + editing     -> <select>
   • accepted               -> status pill (click to edit)
   ========================================================================= */
function StatusPill({ status, onStatusChange, onAccept, onReject, orderId, isLoading, order }) {
  const [isEditing, setIsEditing] = useState(false);
  const key = String(status || "").toLowerCase().replace(/\s+/g, "-");

  // Manual orders are accepted from creation; customer orders wait in queue.
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
      <div className="accept-box">
        <button
          className="acc-btn"
          onClick={() => onAccept(orderId)}
          disabled={isLoading}
        >
          {isLoading ? "…" : "Accept"}
        </button>
        <button
          className="rej-btn"
          onClick={() => onReject(orderId)}
          disabled={isLoading}
        >
          {isLoading ? "…" : "Reject"}
        </button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <select
        value={status}
        onChange={handleChange}
        onBlur={handleBlur}
        autoFocus
        className="status-select"
        disabled={isLoading}
      >
        <option value="Pending">Pending</option>
        <option value="Preparing">Preparing</option>
        <option value="Ready">Ready</option>
        <option value="Delivered">Delivered</option>
      </select>
    );
  }

  const label = status === "Delivered" ? "Served" : status;
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
    return LANES.includes(o.status) && o.status !== "Delivered" ? o.status : "Pending";
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
  // Order id awaiting a rejection reason from the RejectReasonModal (null = closed)
  const [rejectModalOrderId, setRejectModalOrderId] = useState(null);

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
          "orderin_restaurant_3",
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

  // Real-time subscription (unchanged)
  useEffect(() => {
    console.log("=== ORDERS COMPONENT: Subscribing to orders (real-time) ===");
    setLoading(true);
    const unsubscribe = subscribeRecentOrders((fetchedOrders) => {
      console.log(
        `=== ORDERS COMPONENT (realtime): Received ${fetchedOrders.length} orders ===`,
      );
      const rejectedStatuses = new Set(["rejected", "cancelled", "canceled", "declined"]);
      const displayOrders = fetchedOrders.filter((o) => {
        const status = String(o.paymentStatus || "").toLowerCase();
        const orderStatus = String(o.status || "").toLowerCase().trim();
        if (rejectedStatuses.has(orderStatus)) return false;
        return status === "paid" || status === "manual" || status === "unpaid" || status === "unknown";
      });
      setOrders(displayOrders);
      setError(null);
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Local prune so orders drop off exactly at their own 24h mark (unchanged)
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
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        setError("Order not found");
        return;
      }
      await updateOrderStatus(order.phoneNumber, order.id, newStatus);
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

  const handleAccept = async (orderId) => {
    try {
      setUpdatingOrderId(orderId);
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        setError("Order not found");
        return;
      }
      await acceptOrder(order.phoneNumber, order.id);
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === orderId ? { ...o, awaitingConfirmation: false } : o,
        ),
      );
    } catch (err) {
      console.error("Error accepting order:", err);
      setError("Failed to accept order");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Opens the reason modal instead of rejecting immediately
  const handleRequestReject = (orderId) => {
    setRejectModalOrderId(orderId);
  };

  const handleRejectConfirm = async (orderId, reason) => {
    try {
      setUpdatingOrderId(orderId);
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        setError("Order not found");
        return;
      }
      // Marks the order Rejected (with the chosen reason) so the customer's
      // AwaitingConfirmation page can show it in its "Order Not Available" screen.
      await rejectOrder(order.phoneNumber, order.id, undefined, reason);
      setOrders((prevOrders) => prevOrders.filter((o) => o.id !== orderId));
    } catch (err) {
      console.error("Error rejecting order:", err);
      setError("Failed to reject order");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const total = orders.length;
  const queued = orders.filter(isOrderQueued).length;
  const active = orders.filter(isOrderActive).length;
  const completed = orders.filter(isOrderDelivered).length;
  const largeCount = orders.filter((o) => totalQty(o) >= 8).length;

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
    return (
      inItems ||
      (o.username || "").toLowerCase().includes(q) ||
      (o.phoneNumber || "").toLowerCase().includes(q)
    );
  };

  const filteredOrders = (() => {
    let filtered = orders;
    if (filter === "completed") filtered = orders.filter(isOrderDelivered);
    else if (filter === "active") filtered = orders.filter(isOrderActive);
    else if (filter === "queued") filtered = orders.filter(isOrderQueued);
    else if (filter === "large") filtered = orders.filter((o) => totalQty(o) >= 8);

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
    queued: ["Queued Orders", "Awaiting accept / payment"],
    active: ["Active Orders", "In the kitchen right now"],
    completed: ["Served Orders", "Delivered today"],
    large: ["Large Orders", "Orders with 8 or more items"],
  };
  const [pageTitle, pageSub] = titleMap[filter] || titleMap.all;

  const statCards = [
    { key: "all", label: "Total Orders", cap: "Last 24 hours", count: total, color: "#636E2C", icon: TotalOrdersIcon },
    { key: "queued", label: "Queued", cap: "Awaiting accept / payment", count: queued, color: "#2563eb", icon: QueuedOrdersIcon },
    { key: "active", label: "Active", cap: "In the kitchen", count: active, color: "#E4A011", icon: ActiveOrdersIcon },
    { key: "completed", label: "Served", cap: "Delivered today", count: completed, color: "#1BA24D", icon: CompletedIcon },
    { key: "large", label: "Large Orders", cap: "8+ items", count: largeCount, color: "#DD642C", icon: null },
  ];

  /* ---------- payment cell renderer ---------- */
  const PaymentBlock = ({ o }) => {
    const isPaid = isOrderPaymentCollected(o);
    const cost = Number(o.totalCost) || 0;
    const paid = Number(o.paidAmount) || 0;
    return (
      <div className="pay">
        <div className="pay-cost">{money(cost)}</div>
        {isPaid ? (
          <span className="pbadge paid">Paid {money(paid)}</span>
        ) : (
          <span className="pbadge unpaid">Unpaid</span>
        )}
        <div className="pay-meta">
          <span className="pay-chip">{o.paymentType || "Online"}</span>
          {o.verificationCode && o.verificationCode !== "-" && (
            <span className="pay-code">#{o.verificationCode}</span>
          )}
        </div>
      </div>
    );
  };

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
            <span>Payment</span>
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
                    <span className="cell-label">Payment</span>
                    <PaymentBlock o={o} />
                  </div>

                  <div className="cell">
                    <span className="cell-label">Status</span>
                    <StatusPill
                      status={o.status}
                      onStatusChange={handleStatusChange}
                      onAccept={handleAccept}
                      onReject={handleRequestReject}
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
                      const curLane = LANES.includes(o.status) ? o.status : "Pending";
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
                              <div className="accept-box row">
                                <button className="acc-btn" disabled={updatingOrderId === o.id} onClick={() => handleAccept(o.id)}>
                                  {updatingOrderId === o.id ? "…" : "Accept"}
                                </button>
                                <button className="rej-btn" disabled={updatingOrderId === o.id} onClick={() => handleRequestReject(o.id)}>
                                  {updatingOrderId === o.id ? "…" : "Reject"}
                                </button>
                              </div>
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

      <RejectReasonModal
        isOpen={!!rejectModalOrderId}
        onClose={() => setRejectModalOrderId(null)}
        onConfirm={(reason) => {
          const orderId = rejectModalOrderId;
          setRejectModalOrderId(null);
          handleRejectConfirm(orderId, reason);
        }}
      />
    </div>
  );
}

export default Orders;