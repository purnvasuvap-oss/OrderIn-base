import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, Minus, Plus, Edit3, Trash2 } from "lucide-react";
import Footer from "../Footer/Footer";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import { useTableNumber } from "../hooks/useTableNumber";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./Cart.css";
import { getPlaceholder } from "../utils/placeholder";
import resolveImageUrl from "../utils/storageResolver";
import { parseOrderTimestamp } from "../utils/orderDateTime";
import { HiOutlineShoppingCart } from "react-icons/hi2";
function Cart({ onBackClick }) {
  const [activeTab, setActiveTab] = useState("Current Order");
  const { cartItems, updateQuantity, updateInstructions, removeFromCart, getTotalPrice } = useCart();
  const [orderHistory, setOrderHistory] = useState([]);
  const deliveredTimers = useRef({});
  const [editingInstructions, setEditingInstructions] = useState(null);
  const [tempInstructions, setTempInstructions] = useState("");
  const [resolvedImages, setResolvedImages] = useState({});
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  useEffect(() => {
    let unsub = null;
    const stored = localStorage.getItem("user");
    if (!stored) return;

    const u = JSON.parse(stored);
    if (!u || !u.phone) return;

    const customerRef = doc(db, "Restaurant", "orderin_restaurant_2", "customers", u.phone);
    unsub = onSnapshot(customerRef, (snap) => {
      if (!snap.exists()) {
        setOrderHistory([]);
        return;
      }

      const data = snap.data();
      const arr = Array.isArray(data.pastOrders) ? data.pastOrders : [];
      const now = Date.now();
      const mapped = arr
        .map((order, idx) => {
          let status = (order.status || "Pending").toLowerCase();
          let displayStatus = "Pending";
          if (status === "preparing") displayStatus = "Preparing";
          else if (status === "ready") displayStatus = "Ready";
          else if (status === "delivered") displayStatus = "Delivered";
          else if (status === "paid") displayStatus = "Paid";

          const ts = parseOrderTimestamp(order);
          if (displayStatus === "Delivered") {
            const deliveredAt = parseOrderTimestamp({
              deliveredAt: order.deliveredAt,
              createdAt: order.createdAt,
              createdAtMs: order.createdAtMs,
              time: order.time,
            });
            const msSinceDelivered = now - deliveredAt.getTime();
            if (msSinceDelivered < 5 * 60 * 1000) {
              if (!deliveredTimers.current[order.id || idx]) {
                deliveredTimers.current[order.id || idx] = setTimeout(() => {
                  setOrderHistory((prev) => prev.filter((o) => (o.id || o._idx) !== (order.id || idx)));
                  delete deliveredTimers.current[order.id || idx];
                }, Math.max(2 * 60 * 1000, 5 * 60 * 1000 - msSinceDelivered));
              }
              return { ...order, id: order.id || idx, status: displayStatus, timestamp: ts, _idx: idx };
            }
            return null;
          }

          return { ...order, id: order.id || idx, status: displayStatus, timestamp: ts, _idx: idx };
        })
        .filter(Boolean);

      mapped.sort((a, b) => b.timestamp - a.timestamp);
      setOrderHistory(mapped);
    });

    return () => {
      if (unsub) unsub();
      Object.values(deliveredTimers.current).forEach(clearTimeout);
      deliveredTimers.current = {};
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const entries = await Promise.all(
          cartItems.map(async (it) => {
            const key = it.name || it.id || JSON.stringify(it);
            const img = it.image || it.imageURL || it.imageUrl || it.image_url || it.img || "";
            if (!img) return [key, ""];
            try {
              if (img.startsWith("gs://")) {
                const r = await resolveImageUrl(img);
                if (r) return [key, r];
                console.warn("Cart: resolveImageUrl returned no URL for", img, "item=", it.name || it.id);
                return [key, ""];
              }
              if (!img.startsWith("http://") && !img.startsWith("https://") && !img.startsWith("data:") && !img.startsWith("blob:")) {
                const r = await resolveImageUrl(img);
                if (r) return [key, r];
              }
              return [key, img];
            } catch (e) {
              console.warn("Cart: error resolving image", img, e);
              return [key, ""];
            }
          })
        );
        if (cancelled) return;
        const map = Object.fromEntries(entries.filter(Boolean));
        setResolvedImages(map);
      } catch (e) {
        /* ignore */
      }
    };

    if (cartItems && cartItems.length) resolve();
    return () => {
      cancelled = true;
    };
  }, [cartItems]);

  useEffect(() => {
    let cancelled = false;
    const resolveHistory = async () => {
      try {
        const updates = await Promise.all(
          orderHistory.map(async (o) => {
            const img = o?.item?.image;
            if (!img) return null;
            try {
              if (img.startsWith && img.startsWith("gs://")) {
                const r = await resolveImageUrl(img);
                if (r) return { id: o.id, url: r };
                console.warn("Cart: resolveImageUrl returned no URL for orderHistory item image", img, "orderId=", o.id);
                return null;
              }
              if (!img.startsWith("http://") && !img.startsWith("https://") && !img.startsWith("data:") && !img.startsWith("blob:")) {
                const r = await resolveImageUrl(img);
                if (r) return { id: o.id, url: r };
              }
            } catch (e) {
              console.warn("Cart: error resolving orderHistory image", img, e);
            }
            return null;
          })
        );

        if (cancelled) return;
        const map = new Map(updates.filter(Boolean).map((u) => [u.id, u.url]));
        if (map.size === 0) return;
        setOrderHistory((prev) => prev.map((o) => ({ ...o, item: { ...o.item, image: map.get(o.id) || o.item.image } })));
      } catch (e) {
        /* ignore */
      }
    };

    if (orderHistory && orderHistory.length) resolveHistory();
    return () => {
      cancelled = true;
    };
  }, [orderHistory]);

  const handleContinueShopping = () => {
    navigate(getPathWithTable("/menu"));
  };

  const handleEditInstructions = (itemName, currentInstructions) => {
    setEditingInstructions(itemName);
    setTempInstructions(currentInstructions);
  };

  const handleSaveInstructions = (itemName) => {
    updateInstructions(itemName, tempInstructions);
    setEditingInstructions(null);
  };

  const handleCancelEdit = () => {
    setEditingInstructions(null);
    setTempInstructions("");
  };

  const handleCheckout = () => {
    navigate(getPathWithTable("/payments"));
  };

  const parsePrice = (price) => parseFloat(String(price || "").replace(/[^0-9.\-]/g, "")) || 0;

  const formatPrice = (price) => `₹${price.toFixed(2)}`;

  const getCartItemImage = (item) => {
    const key = item.name || item.id || JSON.stringify(item);
    const resolved = resolvedImages[key];
    const image = item.image || "";

    if (resolved) return resolved;
    if (typeof image === "string" && image && !image.startsWith("gs://")) return image;
    return getPlaceholder("No Image");
  };

  const subtotal = cartItems.reduce((sum, item) => sum + parsePrice(item.price) * (Number(item.quantity) || 0), 0);
  const gst = subtotal * 0.05;
  const packing = subtotal > 0 ? 30 : 0;
  const discount = subtotal > 0 ? Math.min(60, Math.round(subtotal * 0.08)) : 0;
  const grandTotal = subtotal + gst + packing - discount;

  return (
    <div className="cart-container">
      <header className="cart-header">
        <div className="back-icon" onClick={() => { if (onBackClick) onBackClick(); else navigate(getPathWithTable("/menu")); }}>
          <ChevronLeft size={20} />
        </div>
        <div>
          <p className="cart-eyebrow">Premium checkout</p>
          <h1 className="cart-title">Your Cart</h1>
        </div>
      </header>

      <div className="cart-tabs">
        <div className={`tab-item ${activeTab === "Current Order" ? "active" : ""}`} onClick={() => setActiveTab("Current Order")}>
          Current Order
        </div>
        <div className={`tab-item ${activeTab === "Order Track" ? "active" : ""}`} onClick={() => setActiveTab("Order Track")}>
          Order Track
        </div>
      </div>

      <div className="divider" />

      {activeTab === "Current Order" ? (
        cartItems.length === 0 ? (
           <div className="empty-cart">
    <div className="empty-cart-icon">
        <HiOutlineShoppingCart />
    </div>

    <h2>Your cart is empty</h2>

    <p>
        Looks like you haven't added
        <br />
        anything yet.
    </p>

    <button
        className="continue-shopping-btn"
        onClick={handleContinueShopping}
    >
        Continue Shopping
    </button>
</div>
        ) : (
          <div className="cart-content">
            <section className="status-banner">
              <div>
                <p className="status-label">Delivery status</p>
                <h2>Preparing now</h2>
                <p>Estimated time: 15–20 min • Freshly cooked and packed</p>
              </div>
              <div className="status-pill">⭐ 4.8 Rated</div>
            </section>

            <div className="cart-list">
              {cartItems.map((item, index) => {
                const itemPrice = parsePrice(item.price);
                const quantity = Number(item.quantity) || 0;
                const itemTotal = itemPrice * quantity;
                const rating = item.rating || 4.7;

                return (
                  <article key={item.id || item.name || index} className="cart-item">
                    <div className="cart-item-media">
                      <img
                        src={getCartItemImage(item)}
                        alt={item.name}
                        className="cart-item-image"
                        onError={(e) => {
                          console.warn("Cart image load failed", e.currentTarget.src, "item=", item && (item.id || item.name));
                          e.currentTarget.src = getPlaceholder("No Image");
                        }}
                      />
                    </div>

                    <div className="cart-item-details">
                      <div className="cart-item-main">
                        <div className="cart-item-copy">
                          <div className="item-title-row">
                            <h3 className="cart-item-name">{item.name}</h3>
                            <span className="rating-pill">⭐ {rating.toFixed(1)}</span>
                          </div>
                          <div className="price-row">
                            <p className="cart-item-price">{formatPrice(itemPrice)}</p>
                            <span className="price-meta">each</span>
                          </div>
                        </div>
                        <div className="cart-item-subtotal">
                          <span>Item total</span>
                          <strong>{formatPrice(itemTotal)}</strong>
                        </div>
                      </div>

                      <div className="cart-item-actions">
                        <div className="quantity-controls" aria-label={`${item.name} quantity`}>
                          <button className="qty-btn" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.name, item.quantity - 1)}>
                            <Minus size={16} />
                          </button>
                          <span className="qty-value">{quantity}</span>
                          <button className="qty-btn" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(item.name, item.quantity + 1)}>
                            <Plus size={16} />
                          </button>
                        </div>

                        <div className="action-buttons">
                          <button className="edit-instructions-btn" onClick={() => handleEditInstructions(item.name, item.instructions || "")}>
                            <Edit3 size={14} />
                            <span>{item.instructions ? "Edit notes" : "Add notes"}</span>
                          </button>
                          <button className="remove-btn" aria-label={`Remove ${item.name}`} onClick={() => removeFromCart(item.name)}>
                            <Trash2 size={16} />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      <div className="instructions-section">
                        {editingInstructions === item.name ? (
                          <div className="edit-instructions">
                            <textarea
                              value={tempInstructions}
                              onChange={(e) => setTempInstructions(e.target.value)}
                              placeholder="Add instructions..."
                              rows={2}
                            />
                            <div className="edit-buttons">
                              <button onClick={() => handleSaveInstructions(item.name)}>Save</button>
                              <button onClick={handleCancelEdit}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="instructions-display">
                            {item.instructions ? (
                              <span className="notes-chip">Notes: {item.instructions}</span>
                            ) : (
                              <span className="notes-chip notes-placeholder">Add notes for the kitchen</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <section className="summary-card">
              <div className="summary-heading">
                <h3>Order summary</h3>
                <p>Enjoy your meal with a premium checkout experience.</p>
              </div>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>GST</span>
                  <strong>{formatPrice(gst)}</strong>
                </div>
                <div className="summary-row">
                  <span>Packing</span>
                  <strong>{formatPrice(packing)}</strong>
                </div>
                <div className="summary-row savings-row">
                  <span>Savings</span>
                  <strong>-{formatPrice(discount)}</strong>
                </div>
                <div className="summary-divider" />
                <div className="summary-row grand-total">
                  <span>Grand total</span>
                  <strong>{formatPrice(grandTotal)}</strong>
                </div>
              </div>
              <div className="checkout-panel">
                <button className="checkout-btn" onClick={handleCheckout}>Checkout</button>
              </div>
            </section>
          </div>
        )
      ) : (
        <div className="order-track-content">
          <div className="order-track-list">
            {orderHistory.length === 0 ? (
              <p className="empty-text">No orders to track</p>
            ) : (
              orderHistory.map((order) => (
                <div key={order.id} className="order-track-item">
                  <div className="track-status">
                    <div className={`status-indicator ${order.status.toLowerCase()}`}>
                      {order.status === "Pending" && "⏳"}
                      {order.status === "Preparing" && "👨‍🍳"}
                      {order.status === "Ready" && "✅"}
                      {order.status === "Delivered" && "🚚"}
                      {order.status === "Paid" && "💳"}
                    </div>
                    <div className="status-details">
                      <h4>Order #{order.id}</h4>
                      <p className="status-text">{order.status}</p>
                      <p className="timestamp">{order.timestamp.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Footer onCartClick={() => navigate(getPathWithTable("/cart"))} onHomeClick={() => navigate(getPathWithTable("/menu"))} onProfileClick={() => navigate(getPathWithTable("/profile"))} />
    </div>
  );
}

export default Cart;
