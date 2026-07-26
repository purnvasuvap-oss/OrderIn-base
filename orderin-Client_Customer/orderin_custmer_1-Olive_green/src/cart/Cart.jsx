import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, Minus, Plus, Edit3, Trash2 } from "lucide-react";
import Footer from "../Footer/Footer";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import { useTableNumber } from "../hooks/useTableNumber";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./Cart.css";
import { getPlaceholder } from "../utils/placeholder";
import resolveImageUrl from "../utils/storageResolver";
import { parseOrderTimestamp, createOrderTimestamp } from "../utils/orderDateTime";
import { generateDisplayOrderId } from "../utils/displayOrderIdGenerator";
import Loading from "../Loading";
import { HiOutlineShoppingCart } from "react-icons/hi2";
import { parsePriceValue, calculateOrderTotals } from "../utils/pricing";
function Cart({ onBackClick }) {
  const [activeTab, setActiveTab] = useState("Current Order");
  const { cartItems, updateQuantity, updateInstructions, removeFromCart, getTotalPrice, placeOrder, saveOrderTempState } = useCart();
  const [orderHistory, setOrderHistory] = useState([]);
  const deliveredTimers = useRef({});
  const [editingInstructions, setEditingInstructions] = useState(null);
  const [tempInstructions, setTempInstructions] = useState("");
  const [resolvedImages, setResolvedImages] = useState({});
  const [isSavingCart, setIsSavingCart] = useState(false);
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  useEffect(() => {
    let unsub = null;
    const stored = localStorage.getItem("user");
    if (!stored) return;

    const u = JSON.parse(stored);
    if (!u || !u.phone) return;

    const customerRef = doc(db, "Restaurant", "orderin_restaurant_3", "customers", u.phone);
    unsub = onSnapshot(customerRef, (snap) => {
      if (!snap.exists()) {
        setOrderHistory([]);
        return;
      }

      const data = snap.data();
      const arr = Array.isArray(data.pastOrders) ? data.pastOrders : [];
      // Filter out rejected/cancelled/declined orders
      const rejectedStatuses = new Set(["rejected", "cancelled", "canceled", "declined"]);
      const filteredArr = arr.filter((order) => {
        const status = (order.status || order.paymentStatus || "").toLowerCase().trim();
        return !rejectedStatuses.has(status);
      });
      const now = Date.now();
      const mapped = filteredArr
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

  const handleEditInstructions = (cartKey, currentInstructions) => {
    setEditingInstructions(cartKey);
    setTempInstructions(currentInstructions);
  };

  const handleSaveInstructions = (cartKey) => {
    updateInstructions(cartKey, tempInstructions);
    setEditingInstructions(null);
  };

  const handleCancelEdit = () => {
    setEditingInstructions(null);
    setTempInstructions("");
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      alert("Your cart is empty");
      return;
    }

    setIsSavingCart(true);
    let orderId = null;

    try {
      const user = JSON.parse(localStorage.getItem("user"));
      const tableNumber = localStorage.getItem("tableNumber") || "1";
      if (!user || !user.phone) {
        throw new Error("User not logged in or phone number missing");
      }
      const phoneNumber = user.phone;

      const customerRef = doc(db, "Restaurant", "orderin_restaurant_3", "customers", phoneNumber);
      const customerSnap = await getDoc(customerRef);
      let pastOrders = [];
      if (customerSnap.exists()) {
        const data = customerSnap.data();
        pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
      }

      // Generate order ID
      try {
        orderId = await generateDisplayOrderId();
        if (!orderId) {
          throw new Error("generateDisplayOrderId returned empty value");
        }
        console.log("Generated order ID:", orderId);
      } catch (displayIdErr) {
        console.warn("Failed to generate order ID, creating fallback:", displayIdErr);
        orderId = `ORD-${Date.now()}`;
      }

      if (!orderId) {
        throw new Error("Failed to generate order ID");
      }

      const calculatedSubtotal = parseFloat(getTotalPrice()) || 0;
      const orderTimestamp = createOrderTimestamp();

      // Shared with the on-screen summary card, so what the customer sees matches what's billed/recorded.
      const { gst: orderGst, packing: orderPacking, discount: orderDiscount, total: orderTotal } =
        calculateOrderTotals(calculatedSubtotal);

      // Create order object without payment method
      const orderForFirestore = {
        id: orderId,
        items: cartItems.map(({ name, price, quantity, instructions, effectivePrice, selectedOptions }) => ({
          name,
          price,
          quantity,
          instructions: instructions || "",
          effectivePrice: effectivePrice ?? parsePriceValue(price),
          customizations: (selectedOptions || []).map((o) => ({ label: o.group, option: o.label, price: o.price })),
        })),
        subtotal: calculatedSubtotal,
        taxes: orderGst,
        packing: orderPacking,
        discount: orderDiscount,
        total: orderTotal,
        paymentMethod: "", // No payment method yet — will be set after confirmation
        status: "Pending",
        tableNo: tableNumber,
        time: orderTimestamp.time,
        createdAt: orderTimestamp.createdAt,
        createdAtMs: orderTimestamp.createdAtMs,
        paymentStatus: "unpaid",
        verificationCode: null,
        OnlinePayMethod: "",
        // Mark this as awaiting restaurant confirmation
        awaitingConfirmation: true,
      };

      console.log("Sending order to restaurant for confirmation:", orderForFirestore);

      // Save to Firestore
      pastOrders.push(orderForFirestore);
      await setDoc(customerRef, { pastOrders, lastOrderAt: serverTimestamp() }, { merge: true });
      console.log("Order saved to Firestore — awaiting restaurant confirmation");

      // Store pending order ID for AwaitingConfirmation page
      sessionStorage.setItem("pendingOrderId", orderId);
      localStorage.setItem("orderin_awaiting_orderId", orderId);
      
      // Store a backup for recovery
      const pendingOrderBackup = {
        phoneNumber,
        restaurantId: "orderin_restaurant_3",
        order: orderForFirestore,
      };
      sessionStorage.setItem("pendingOrderForFirestore", JSON.stringify(pendingOrderBackup));
      localStorage.setItem("pendingOrderForFirestore", JSON.stringify(pendingOrderBackup));

      // Save temp state for recovery on page refresh
      const billing = {
        subtotal: calculatedSubtotal,
        taxes: orderGst,
        packing: orderPacking,
        discount: orderDiscount,
        total: orderTotal,
      };
      saveOrderTempState(orderId, cartItems, billing, "unpaid");

      // Fix #4: Keep isSavingCart=true until navigation completes to prevent duplicate orders
      // Use replace:true to prevent going back to checkout state
      setTimeout(() => {
        navigate(getPathWithTable("/awaiting-confirmation"), { replace: true });
        setTimeout(() => setIsSavingCart(false), 100);
      }, 100);
    } catch (err) {
      setIsSavingCart(false);
      console.error("Error sending order to restaurant:", err);
      alert("Failed to send order: " + err.message);
    }
  };

  const formatPrice = (price) => `₹${price.toFixed(2)}`;

  const getCartItemImage = (item) => {
    const key = item.name || item.id || JSON.stringify(item);
    const resolved = resolvedImages[key];
    const image = item.image || "";

    if (resolved) return resolved;
    if (typeof image === "string" && image && !image.startsWith("gs://")) return image;
    return getPlaceholder("No Image");
  };

  const subtotal = cartItems.reduce(
    (sum, item) => sum + (item.effectivePrice ?? parsePriceValue(item.price)) * (Number(item.quantity) || 0),
    0
  );
  const { gst, packing, discount, total: grandTotal } = calculateOrderTotals(subtotal);

  return (
    <div className="cart-container">
      <Loading isLoading={isSavingCart} />
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
                const itemPrice = item.effectivePrice ?? parsePriceValue(item.price);
                const quantity = Number(item.quantity) || 0;
                const itemTotal = itemPrice * quantity;
                const rating = item.rating || 4.7;
                const cartKey = item.cartKey || item.name;

                return (
                  <article key={cartKey || index} className="cart-item">
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
                          {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                            <div className="cart-item-options">
                              {item.selectedOptions.map((opt, oIdx) => (
                                <span key={oIdx} className="cart-item-option-chip">
                                  {opt.label}: +₹{opt.price}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="cart-item-subtotal">
                          <span>Item total</span>
                          <strong>{formatPrice(itemTotal)}</strong>
                        </div>
                      </div>

                      <div className="cart-item-actions">
                        <div className="quantity-controls" aria-label={`${item.name} quantity`}>
                          <button className="qty-btn" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(cartKey, item.quantity - 1)}>
                            <Minus size={16} />
                          </button>
                          <span className="qty-value">{quantity}</span>
                          <button className="qty-btn" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(cartKey, item.quantity + 1)}>
                            <Plus size={16} />
                          </button>
                        </div>

                        <div className="action-buttons">
                          <button className="edit-instructions-btn" onClick={() => handleEditInstructions(cartKey, item.instructions || "")}>
                            <Edit3 size={14} />
                            <span>{item.instructions ? "Edit notes" : "Add notes"}</span>
                          </button>
                          <button className="remove-btn" aria-label={`Remove ${item.name}`} onClick={() => removeFromCart(cartKey)}>
                            <Trash2 size={16} />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      <div className="instructions-section">
                        {editingInstructions === cartKey ? (
                          <div className="edit-instructions">
                            <textarea
                              value={tempInstructions}
                              onChange={(e) => setTempInstructions(e.target.value)}
                              placeholder="Add instructions..."
                              rows={2}
                            />
                            <div className="edit-buttons">
                              <button onClick={() => handleSaveInstructions(cartKey)}>Save</button>
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
