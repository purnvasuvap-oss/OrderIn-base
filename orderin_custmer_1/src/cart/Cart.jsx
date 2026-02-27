import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, Minus, Plus, Edit3 } from "lucide-react";
import Footer from "../Footer/Footer";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import { useTableNumber } from "../hooks/useTableNumber";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./Cart.css";
import { getPlaceholder } from "../utils/placeholder";
import resolveImageUrl from "../utils/storageResolver";

function Cart({ onBackClick }) {
  const [activeTab, setActiveTab] = useState("Current Order");
  const { cartItems, updateQuantity, updateInstructions, removeFromCart, getTotalPrice } = useCart();
  const [orderHistory, setOrderHistory] = useState([]);
  const deliveredTimers = useRef({});
    // Subscribe to Firestore for real-time order status from pastOrders array
    useEffect(() => {
      let unsub = null;
      const stored = localStorage.getItem('user');
      if (!stored) return;
      const u = JSON.parse(stored);
      if (!u || !u.phone) return;
      const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_2', 'customers', u.phone);
      unsub = onSnapshot(customerRef, (snap) => {
        if (!snap.exists()) {
          setOrderHistory([]);
          return;
        }
        const data = snap.data();
        const arr = Array.isArray(data.pastOrders) ? data.pastOrders : [];
        // Map and sort by createdAt desc
        const now = Date.now();
        const mapped = arr.map((order, idx) => {
          let status = (order.status || 'Pending').toLowerCase();
          let displayStatus = 'Pending';
          if (status === 'preparing') displayStatus = 'Preparing';
          else if (status === 'ready') displayStatus = 'Ready';
          else if (status === 'delivered') displayStatus = 'Delivered';
          else if (status === 'paid') displayStatus = 'Paid';
          let ts = order.createdAt;
          if (ts && ts.toDate) ts = ts.toDate();
          else if (typeof ts === 'string') ts = new Date(ts);
          else ts = new Date();
          // Hide delivered orders after 2-5 minutes
          if (displayStatus === 'Delivered') {
            const deliveredAt = order.deliveredAt && order.deliveredAt.toDate ? order.deliveredAt.toDate() : (order.deliveredAt ? new Date(order.deliveredAt) : ts);
            const msSinceDelivered = now - deliveredAt.getTime();
            if (msSinceDelivered < 5 * 60 * 1000) {
              if (!deliveredTimers.current[order.id || idx]) {
                deliveredTimers.current[order.id || idx] = setTimeout(() => {
                  setOrderHistory(prev => prev.filter(o => (o.id || o._idx) !== (order.id || idx)));
                  delete deliveredTimers.current[order.id || idx];
                }, Math.max(2 * 60 * 1000, 5 * 60 * 1000 - msSinceDelivered));
              }
              return { ...order, id: order.id || idx, status: displayStatus, timestamp: ts, _idx: idx };
            }
            return null;
          }
          return { ...order, id: order.id || idx, status: displayStatus, timestamp: ts, _idx: idx };
        }).filter(Boolean);
        // Sort by timestamp desc
        mapped.sort((a, b) => b.timestamp - a.timestamp);
        setOrderHistory(mapped);
      });
      return () => {
        if (unsub) unsub();
        Object.values(deliveredTimers.current).forEach(clearTimeout);
        deliveredTimers.current = {};
      };
    }, []);
  const [editingInstructions, setEditingInstructions] = useState(null);
  const [tempInstructions, setTempInstructions] = useState("");
  const [resolvedImages, setResolvedImages] = useState({});
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  // Resolve any storage images for current cart items in background
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      try {
        const entries = await Promise.all(cartItems.map(async (it) => {
          const key = it.name || it.id || JSON.stringify(it);
          const img = it.image || it.imageURL || it.imageUrl || it.image_url || it.img || '';
          if (!img) return [key, ''];
          try {
            // If gs:// try to resolve
            if (img.startsWith('gs://')) {
              const r = await resolveImageUrl(img);
              if (r) return [key, r];
              console.warn('Cart: resolveImageUrl returned no URL for', img, 'item=', it.name || it.id);
              return [key, ''];
            }
            // If not a http(s) data: or blob: url, try to resolve (handles relative storage paths)
            if (!img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:') && !img.startsWith('blob:')) {
              const r = await resolveImageUrl(img);
              if (r) return [key, r];
              // otherwise fall back to using the original (may be relative path)
            }
            return [key, img];
          } catch (e) {
            console.warn('Cart: error resolving image', img, e);
            return [key, ''];
          }
        }));
        if (cancelled) return;
        const map = Object.fromEntries(entries.filter(Boolean));
        setResolvedImages(map);
      } catch (e) { /* ignore */ }
    };
    if (cartItems && cartItems.length) resolve();
    return () => { cancelled = true; };
  }, [cartItems]);

  // Resolve storage-style images present inside orderHistory (background)
  useEffect(() => {
    let cancelled = false;
    const resolveHistory = async () => {
      try {
        const updates = await Promise.all(orderHistory.map(async (o) => {
          const img = o?.item?.image;
          if (!img) return null;
          try {
            if (img.startsWith && img.startsWith('gs://')) {
              const r = await resolveImageUrl(img);
              if (r) return { id: o.id, url: r };
              console.warn('Cart: resolveImageUrl returned no URL for orderHistory item image', img, 'orderId=', o.id);
              return null;
            }
            if (!img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:') && !img.startsWith('blob:')) {
              const r = await resolveImageUrl(img);
              if (r) return { id: o.id, url: r };
            }
          } catch (e) {
            console.warn('Cart: error resolving orderHistory image', img, e);
          }
          return null;
        }));
        if (cancelled) return;
        const map = new Map(updates.filter(Boolean).map(u => [u.id, u.url]));
        if (map.size === 0) return;
        setOrderHistory(prev => prev.map(o => ({ ...o, item: { ...o.item, image: map.get(o.id) || o.item.image } })));
      } catch (e) { /* ignore */ }
    };
    if (orderHistory && orderHistory.length) resolveHistory();
    return () => { cancelled = true; };
  }, [orderHistory]);

  const handleContinueShopping = () => {
    navigate(getPathWithTable('/menu'));
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
    navigate(getPathWithTable('/payments'));
  };

  return (
    <div className="cart-container">
      <header className="cart-header">
        <div className="back-icon" onClick={() => { if (onBackClick) onBackClick(); else navigate(getPathWithTable('/menu')); }}>
          <ChevronLeft size={20} />
        </div>
        <h1 className="cart-title">Your Cart</h1>
      </header>

      <div className="cart-tabs">
        <div
          className={`tab-item ${
            activeTab === "Current Order" ? "active" : ""
          }`}
          onClick={() => setActiveTab("Current Order")}
        >
          Current Order
        </div>
        <div
          className={`tab-item ${
            activeTab === "Order Track" ? "active" : ""
          }`}
          onClick={() => setActiveTab("Order Track")}
        >
          Order Track
        </div>
      </div>

      <div className="divider" />

      {activeTab === "Current Order" ? (
        cartItems.length === 0 ? (
          <div className="empty-cart">
            <p className="empty-text">Your cart is empty</p>
            <button className="continue-btn" onClick={handleContinueShopping}>
              Continue Shopping
            </button>
          </div>
        ) : (
          <div className="cart-content">
            {cartItems.map((item, index) => (
              <div key={index} className="cart-item">
                <img
                  src={(resolvedImages[item.name] && resolvedImages[item.name] !== '') ? resolvedImages[item.name] : (item.image && !(item.image.startsWith && item.image.startsWith('gs://')) ? item.image : getPlaceholder('No Image'))}
                  alt={item.name}
                  className="cart-item-image"
                  onError={(e) => { console.warn('Cart image load failed', e.currentTarget.src, 'item=', item && (item.id || item.name)); e.currentTarget.src = getPlaceholder('No Image'); }}
                />
                <div className="cart-item-details">
                  <h3 className="cart-item-name">{item.name}</h3>
                  <p className="cart-item-price">{(() => { const n = parseFloat(String(item.price || '').replace(/[^0-9.\-]/g, '')) || 0; return `₹${n.toFixed(2)}`; })()}</p>
                  <div className="cart-item-controls">
                    <div className="quantity-controls">
                      <button
                        className="qty-btn"
                        onClick={() => updateQuantity(item.name, item.quantity - 1)}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="qty-value">{item.quantity}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateQuantity(item.name, item.quantity + 1)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <button
                      className="remove-btn"
                      onClick={() => removeFromCart(item.name)}
                    >
                      Remove
                    </button>
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
                          <>
                            <p><strong>Instructions:</strong> {item.instructions}</p>
                            <button
                              className="edit-instructions-btn"
                              onClick={() => handleEditInstructions(item.name, item.instructions)}
                            >
                              <Edit3 size={14} /> Edit
                            </button>
                          </>
                        ) : (
                          <button
                            className="edit-instructions-btn"
                            onClick={() => handleEditInstructions(item.name, "")}
                          >
                            <Edit3 size={14} /> Add Instructions
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="cart-total">
              <h3>Total: ₹{getTotalPrice()}</h3>
              <button className="checkout-btn" onClick={handleCheckout}>Proceed to Checkout</button>
            </div>
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

      <Footer
        onCartClick={() => navigate(getPathWithTable('/cart'))}
        onHomeClick={() => navigate(getPathWithTable('/menu'))}
        onProfileClick={() => navigate(getPathWithTable('/profile'))}
      />
    </div>
  );
}

export default Cart;
