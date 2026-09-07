import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronDown, Sparkles, ShoppingBag, Heart, CreditCard, LogOut } from "lucide-react";
import { HiOutlineShoppingCart } from "react-icons/hi2";
import Footer from "../Footer/Footer";
import { useNavigate } from 'react-router-dom';
import { useCart } from "../context/CartContext";
import { useTableNumber } from "../hooks/useTableNumber";
import { menuStore } from "../menu/menuStore";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./Profile.css";
import { getPlaceholder } from "../utils/placeholder";
import { resolveImageUrl } from "../utils/storageResolver";
import { parseOrderTimestamp } from "../utils/orderDateTime";

function Profile({ onBackClick, onCartClick }) {
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();
  const [user, setUser] = useState({ username: "", phone: "" });
  const [orderHistory, setOrderHistory] = useState([]);
  const [likedItems, setLikedItems] = useState([]);
  const [expandedSection, setExpandedSection] = useState(null); // 'orders' or 'liked'
  const { addToCart } = useCart();
  const PLACEHOLDER_IMAGE = getPlaceholder('No Image');

  const formatPrice = (p) => {
    const n = parseFloat(String(p || '').replace(/[^0-9.\-]/g, '')) || 0;
    return `₹${n.toFixed(2)}`;
  };

  useEffect(() => {
    // Get user data from localStorage
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
    // Fetch order history from Firestore (customers/<phone>.pastOrders)
    const fetchOrderHistory = async () => {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) {
          loadLocalOrderHistory();
          return;
        }
        const u = JSON.parse(stored);
        if (!u || !u.phone) {
          loadLocalOrderHistory();
          return;
        }

        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_4', 'customers', u.phone);
        const snap = await getDoc(customerRef);
        if (!snap.exists()) {
          // no customer doc yet
          if (!loadLocalOrderHistory()) setOrderHistory([]);
          return;
        }

        const data = snap.data();
        const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
        setOrderHistory(buildOrderHistory(pastOrders));
      } catch (err) {
        console.error('Profile: error fetching pastOrders', err);
        loadLocalOrderHistory();
      }
    };

    fetchOrderHistory();

    // Subscribe to likedItems for this customer so Profile updates in realtime
    let unsubLiked = null;
    const subscribeLiked = async () => {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) return;
        const u = JSON.parse(stored);
        if (!u || !u.phone) return;
        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_4', 'customers', u.phone);
        unsubLiked = onSnapshot(customerRef, (snap) => {
          if (!snap.exists()) {
            setLikedItems([]);
            return;
          }
          const data = snap.data();
          const liked = Array.isArray(data.likedItems) ? data.likedItems : [];
          // Map liked raw items to current menu products
          const productsListLocal = (menuStore && menuStore.get().length > 0) ? menuStore.get() : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);
          const mapped = liked.map(li => {
            const prod = findProductMatch(li) || productsListLocal.find(p => String(p.id) === String(li.id));
            const fullProd = prod ? { ...prod } : null;
            const resolvedImage = fullProd ? (fullProd.image || fullProd.imageUrl || fullProd.imageURL || fullProd.image_url || fullProd.img || '') : (li.image || li.image_url || PLACEHOLDER_IMAGE);
            const resolvedPrice = fullProd ? (fullProd.price || li.price) : (li.price || '₹0.00');
            return fullProd ? { ...fullProd, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice, raw: li } : { name: li.name, id: li.id, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice, raw: li };
          });
          setLikedItems(mapped);
        }, (err) => { console.error('Profile likedItems snapshot error', err); });
      } catch (err) {
        console.error('Profile: subscribeLiked error', err);
      }
    };

    subscribeLiked();

    return () => {
      if (typeof unsubLiked === 'function') unsubLiked();
    };
  }, []);

  // When the menu becomes available later (menu:loaded), remap orderHistory so availability and details update
  useEffect(() => {
    const handler = (e) => {
      try {
        console.log('Profile: menu:loaded event received, remapping orderHistory');
        setOrderHistory(prev => prev.map(order => {
          // rematch using rawItem which was stored earlier
          const raw = order.rawItem || { name: order.item.name };
          const prod = findProductMatch(raw);
          const productsListLocal = (menuStore && menuStore.get().length > 0) ? menuStore.get() : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);
          const isUnavailable = (!prod && productsListLocal.length > 0);
          const fullProd = prod ? { ...prod } : null;
          const resolvedImage = fullProd ? (fullProd.image || fullProd.imageUrl || fullProd.imageURL || fullProd.image_url || fullProd.img || '') : (raw.image || raw.image_url || PLACEHOLDER_IMAGE);
          const resolvedPrice = fullProd ? (fullProd.price || raw.price) : (raw.price || '₹0.00');
          const newItem = fullProd ? { ...fullProd, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice } : { name: raw.name, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice, unavailable: isUnavailable };
          if (!newItem.paidPrice) newItem.paidPrice = (raw && (raw.price || raw.paidPrice)) || order.item.paidPrice || null;
          return { ...order, item: newItem };
        }));
      } catch (err) {
        console.error('Profile: error remapping orderHistory after menu load', err);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('menu:loaded', handler);
      // also try once immediately if menu already present
      if (window.__menu_products__) handler();
    }
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('menu:loaded', handler);
    };
  }, []);

  // When menu is loaded, also remap liked items so they pick up latest product details
  useEffect(() => {
    const remapLiked = () => {
      try {
        setLikedItems(prev => prev.map(li => {
          // li may contain a raw reference stored as `raw` when it came from Firestore mapping
          const raw = li.raw || { name: li.name };
          const prod = findProductMatch(raw);
          const productsListLocal = (menuStore && menuStore.get().length > 0) ? menuStore.get() : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);
          const isUnavailable = (!prod && productsListLocal.length > 0);
          const fullProd = prod ? { ...prod } : null;
          const resolvedImage = fullProd ? (fullProd.image || fullProd.imageUrl || fullProd.imageURL || fullProd.image_url || fullProd.img || '') : (raw.image || raw.image_url || PLACEHOLDER_IMAGE);
          const resolvedPrice = fullProd ? (fullProd.price || raw.price) : (raw.price || '₹0.00');
          return fullProd ? { ...fullProd, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice, raw } : { name: raw.name, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice, unavailable: isUnavailable, raw };
        }));
      } catch (err) {
        console.error('Profile: error remapping likedItems after menu load', err);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('menu:loaded', remapLiked);
      if (window.__menu_products__) remapLiked();
    }
    return () => { if (typeof window !== 'undefined') window.removeEventListener('menu:loaded', remapLiked); };
  }, []);

  // Resolve storage-style images in orderHistory (background, non-blocking)
  useEffect(() => {
    let cancelled = false;
    const resolveOrderImages = async () => {
      try {
        const updates = await Promise.all(orderHistory.map(async (o) => {
          const img = o?.item?.image;
          if (!img) return null;
          try {
            if (img.startsWith && img.startsWith('gs://')) {
              const r = await resolveImageUrl(img);
              if (r) return { orderId: o.id, url: r };
              console.warn('Profile: resolveImageUrl returned no URL for orderHistory image', img, 'orderId=', o.id);
            }
            if (!img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:') && !img.startsWith('blob:')) {
              const r = await resolveImageUrl(img);
              if (r) return { orderId: o.id, url: r };
            }
          } catch (e) {
            console.warn('Profile: error resolving orderHistory image', img, e);
          }
          return null;
        }));
        if (cancelled) return;
        const map = new Map(updates.filter(Boolean).map(u => [u.orderId, u.url]));
        if (map.size === 0) return;
        setOrderHistory(prev => prev.map(o => ({ ...o, item: { ...o.item, image: map.get(o.id) || o.item.image } })));
      } catch (e) { /* ignore */ }
    };
    if (orderHistory && orderHistory.length) resolveOrderImages();
    return () => { cancelled = true; };
  }, [orderHistory]);

  // Resolve storage-style images in likedItems (background)
  useEffect(() => {
    let cancelled = false;
    const resolveLiked = async () => {
      try {
        const updates = await Promise.all(likedItems.map(async (li, idx) => {
          const img = li?.image;
          if (!img) return null;
          try {
            if (img.startsWith && img.startsWith('gs://')) {
              const r = await resolveImageUrl(img);
              if (r) return { idx, url: r };
              console.warn('Profile: resolveImageUrl returned no URL for liked item image', img, 'idx=', idx);
            }
            if (!img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:') && !img.startsWith('blob:')) {
              const r = await resolveImageUrl(img);
              if (r) return { idx, url: r };
            }
          } catch (e) {
            console.warn('Profile: error resolving liked item image', img, e);
          }
          return null;
        }));
        if (cancelled) return;
        const map = new Map(updates.filter(Boolean).map(u => [u.idx, u.url]));
        if (map.size === 0) return;
        setLikedItems(prev => prev.map((li, idx) => ({ ...li, image: map.get(idx) || li.image })));
      } catch (e) { /* ignore */ }
    };
    if (likedItems && likedItems.length) resolveLiked();
    return () => { cancelled = true; };
  }, [likedItems]);

  // --- Helper: normalize and matching ---
  const normalizeString = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const findProductMatch = (item) => {
    if (!item) return null;
    const name = normalizeString(item.name || item.itemName || '');
    const id = item.id || item.productId || item.productID || item.sku || null;
    // Use products imported from Menu if populated; otherwise fall back to window-exposed products
    const productsList = (menuStore && menuStore.get().length > 0) ? menuStore.get() : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);

    // 1) Try id match
    if (id) {
      const byId = productsList.find(p => String(p.id) === String(id) || String(p._id) === String(id) || String(p.productId) === String(id));
      if (byId) return byId;
    }

    // 2) Exact normalized name match
    if (name) {
      const exact = productsList.find(p => normalizeString(p.name) === name);
      if (exact) return exact;

      // 3) Substring inclusion
      const substr = productsList.find(p => normalizeString(p.name).includes(name) || name.includes(normalizeString(p.name)));
      if (substr) return substr;

      // 4) Token overlap scoring (simple fuzzy)
      const tokens = name.split(' ').filter(Boolean);
      let best = null; let bestScore = 0;
      for (const p of productsList) {
        const pTokens = normalizeString(p.name).split(' ').filter(Boolean);
        const common = tokens.filter(t => pTokens.includes(t)).length;
        if (common > bestScore) { bestScore = common; best = p; }
      }
      if (bestScore > 0) return best;
    }

    return null;
  };

  const buildOrderHistory = (pastOrders) => {
    return (Array.isArray(pastOrders) ? pastOrders : []).map((o, idx) => {
      const first = Array.isArray(o.items) && o.items.length > 0
        ? o.items[0]
        : (o.item || { name: o.itemName || 'Item', price: o.total || o.price || '₹0.00' });

      const productsListLocal = (menuStore && menuStore.get().length > 0)
        ? menuStore.get()
        : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);
      const prod = findProductMatch(first);
      const isUnavailable = (!prod && productsListLocal.length > 0);
      const fullProd = prod ? { ...prod } : null;
      const resolvedImage = fullProd
        ? (fullProd.image || fullProd.imageUrl || fullProd.imageURL || fullProd.image_url || fullProd.img || '')
        : (first.image || first.image_url || PLACEHOLDER_IMAGE);
      const resolvedPrice = fullProd ? (fullProd.price || first.price) : (first.price || '₹0.00');
      const itemObj = fullProd
        ? { ...fullProd, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice }
        : { name: first.name, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice, unavailable: isUnavailable };

      if (!itemObj.paidPrice) itemObj.paidPrice = (first && (first.price || first.paidPrice)) || o.total || null;

      return {
        id: o.id || (`order-${idx}`),
        item: itemObj,
        quantity: Array.isArray(o.items) && o.items.length > 0 ? (o.items[0].quantity || 1) : (o.quantity || 1),
        itemCount: Array.isArray(o.items) ? o.items.length : 1,
        instructions: (Array.isArray(o.items) && o.items.length > 0 && o.items[0].instructions) || o.instructions || '',
        rawItem: first,
        paidAmount: o.total || itemObj.paidPrice || itemObj.price,
        status: o.status || o.paymentStatus || '',
        paymentMethod: o.paymentMethod || '',
        timestamp: parseOrderTimestamp(o)
      };
    }).reverse();
  };

  const loadLocalOrderHistory = () => {
    try {
      const saved = localStorage.getItem('orderHistory');
      if (!saved) return false;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0) return false;
      setOrderHistory(buildOrderHistory(parsed));
      return true;
    } catch (err) {
      console.error('Profile: error loading local order history', err);
      return false;
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [tempInstructions, setTempInstructions] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [addedItems, setAddedItems] = useState(new Set());

  const handleAddToCart = (item, quantity = 1, instructions = "") => {
    // Ensure we add the canonical product (with image) if available in menu
    const productsListLocal = (menuStore && menuStore.get().length > 0) ? menuStore.get() : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);
    const matched = findProductMatch(item) || productsListLocal.find(p => String(p.name || '').toLowerCase() === String(item.name || '').toLowerCase());
    if (!matched) {
      // Item no longer present in menu - show small message and do not add
      setToastMessage(`${item.name} is no longer present`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    const resolvedImage = matched.image || matched.imageUrl || matched.imageURL || matched.image_url || matched.img || item.image || item.image_url || PLACEHOLDER_IMAGE;
    const toAdd = { ...matched, image: (resolvedImage || PLACEHOLDER_IMAGE), price: matched.price || item.price };
    addToCart(toAdd, quantity, instructions);
    setAddedItems(prev => new Set([...prev, item.name]));
    setToastMessage(`${item.name} added to cart!`);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
      setAddedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.name);
        return newSet;
      });
    }, 3000);
  };

  const handleLikedAddToCart = (item) => {
    setSelectedItem(item);
    setTempInstructions("");
    setIsModalOpen(true);
  };

  const handleSaveInstructions = () => {
    if (selectedItem) {
      // When saving from modal, ensure we map to canonical product in menu
      const productsListLocal = (menuStore && menuStore.get().length > 0) ? menuStore.get() : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);
      const matched = findProductMatch(selectedItem) || productsListLocal.find(p => String(p.name || '').toLowerCase() === String(selectedItem.name || '').toLowerCase());
      if (!matched) {
        // If menu not loaded, allow adding historical item as-is
        if (productsListLocal.length === 0) {
          addToCart({ ...selectedItem, image: selectedItem.image || PLACEHOLDER_IMAGE, price: selectedItem.price || selectedItem.paidPrice || '₹0.00' }, 1, tempInstructions);
          setToastMessage(`${selectedItem.name} added to cart (menu not loaded)`);
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
          setIsModalOpen(false);
          setSelectedItem(null);
          setTempInstructions("");
          return;
        }

        setToastMessage(`${selectedItem.name} is no longer present`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        return; // keep modal open so user can cancel or change
      }

      const resolvedImage = matched.image || matched.imageUrl || matched.imageURL || matched.img || selectedItem.image || PLACEHOLDER_IMAGE;
      addToCart({ ...matched, image: (resolvedImage || PLACEHOLDER_IMAGE), price: matched.price || selectedItem.price }, 1, tempInstructions);
      setToastMessage(`${selectedItem.name} added to cart!`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      setIsModalOpen(false);
      setSelectedItem(null);
      setTempInstructions("");
    }
  };

  const handleCancelInstructions = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
    setTempInstructions("");
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const formatDate = (date) => {
    if (!date || Number.isNaN(date.getTime?.())) return "Recent order";
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const formatPlateCount = (quantity) => {
    const count = Number(quantity) || 1;
    return `${count} ${count === 1 ? 'plate' : 'plates'}`;
  };

  const displayName = user.username || "Guest";
  const profileInitials = displayName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";
  const loyaltyLabel = orderHistory.length >= 8 ? "Gold Member" : orderHistory.length >= 3 ? "Loyal Member" : "New Member";
  const totalOrders = orderHistory.length;
  const favoriteCount = likedItems.length;
  const savingsEstimate = Math.max(0, totalOrders * 38);
  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString([], { month: "short", year: "numeric" }) : "since 2024";
  const paymentMethods = [
    { label: "Visa • 4242", detail: "Primary card" },
    { label: "Cash on delivery", detail: "Default at checkout" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("cart");
    navigate(getPathWithTable("/"));
  };

  return (
    <div className="profile-container">
      <header className="profile-header">
        <div className="back-icon" onClick={() => { if (onBackClick) onBackClick(); else navigate(-1); }}>
          <ChevronLeft size={20} />
        </div>
        <h1 className="profile-title">Profile</h1>
      </header>

      <div className="profile-content">
        <section className="profile-card">
          <div className="profile-avatar">{profileInitials}</div>
          <div className="profile-card-copy">
            <div className="profile-card-top">
              <div>
                <p className="profile-eyebrow">Welcome back</p>
                <h2>{displayName}</h2>
              </div>
              <span className="loyalty-pill">
                <Sparkles size={14} />
                {loyaltyLabel}
              </span>
            </div>
            <p className="profile-meta">Member {memberSince}</p>
            <div className="profile-stats">
              <div className="stat-pill">
                <strong>{totalOrders}</strong>
                <span>Orders</span>
              </div>
              <div className="stat-pill">
                <strong>{favoriteCount}</strong>
                <span>Favorites</span>
              </div>
              <div className="stat-pill">
                <strong>{formatPrice(savingsEstimate)}</strong>
                <span>Saved</span>
              </div>
            </div>
          </div>
        </section>

        <div className="profile-sections">
          <div className="account-card">
            <button className="account-card-trigger" onClick={() => toggleSection("orders")}>
              <div className="account-card-icon">
                <ShoppingBag size={18} />
              </div>
              <div className="account-card-copy">
                <h3>Orders</h3>
                <p>View your recent favorites and reorder</p>
              </div>
              <ChevronDown size={18} className={`chevron ${expandedSection === "orders" ? "expanded" : ""}`} />
            </button>
            {expandedSection === "orders" && (
              <div className="account-section-body">
                <div className="section-body-list">
                  {orderHistory.length === 0 ? (
                    <p className="empty-message">No orders yet</p>
                  ) : (
                    orderHistory.map((order) => {
                      const extraItems = Math.max(0, (order.itemCount || 1) - 1);
                      const menuPriceChanged = order.item.price && order.item.paidPrice && formatPrice(order.item.price) !== formatPrice(order.item.paidPrice);

                      return (
                        <div key={order.id} className="order-item">
                          <div className="order-card-main">
                            <img
                              src={order.item.image}
                              alt={order.item.name}
                              className="order-image"
                              onError={(e) => { console.warn('Image load failed', e.currentTarget.src, 'order', order && (order.id || order.item && (order.item.id || order.item.name))); e.currentTarget.src = getPlaceholder('No Image'); }}
                            />

                            <div className="order-details">
                              <div className="order-title-row">
                                <h4 className="order-title" title={order.item.name}>{order.item.name}</h4>
                                {extraItems > 0 && <span className="order-count-chip">+{extraItems}</span>}
                              </div>
                              <p className="order-timestamp">{formatDate(order.timestamp)}</p>

                              <div className="order-pill-row">
                                <span>{formatPlateCount(order.quantity)}</span>
                                {order.status && <span>{order.status}</span>}
                                {order.paymentMethod && <span>{order.paymentMethod}</span>}
                              </div>
                            </div>

                            <button
                              className={`order-reorder-btn ${addedItems.has(order.item.name) ? 'added' : ''}`}
                              onClick={() => handleAddToCart(order.item, order.quantity, order.instructions)}
                              disabled={addedItems.has(order.item.name) || order.item.unavailable}
                              title={order.item.unavailable ? 'Unavailable' : (addedItems.has(order.item.name) ? 'Added' : 'Reorder')}
                            >
                              <HiOutlineShoppingCart size={25} />
                              <span>{addedItems.has(order.item.name) ? 'Added' : 'Reorder'}</span>
                            </button>
                          </div>

                          <div className="order-card-footer">
                            <div className="order-paid-summary">
                              <span>Paid</span>
                              <strong>{formatPrice(order.paidAmount || order.item.paidPrice || order.item.price)}</strong>
                            </div>

                            {menuPriceChanged && (
                              <div className="order-menu-price">
                                Menu price {formatPrice(order.item.price)}
                              </div>
                            )}

                            {order.item.category && (
                              <div className="order-category">{order.item.category}</div>
                            )}
                          </div>

                          {order.item.description && (
                            <p className="order-desc-zone" title={order.item.description}>{order.item.description}</p>
                          )}

                          {order.instructions && (
                            <p className="order-instructions-zone" title={order.instructions}>
                              <strong>Instructions:</strong> {order.instructions}
                            </p>
                          )}

                          {order.item.unavailable && (
                            <p className="order-unavailable">This item is no longer available</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="account-card">
            <button className="account-card-trigger" onClick={() => toggleSection("favorites")}>
              <div className="account-card-icon">
                <Heart size={18} />
              </div>
              <div className="account-card-copy">
                <h3>Favorites</h3>
                <p>Your most-loved dishes</p>
              </div>
              <ChevronDown size={18} className={`chevron ${expandedSection === "favorites" ? "expanded" : ""}`} />
            </button>
            {expandedSection === "favorites" && (
              <div className="account-section-body">
                {likedItems.length === 0 ? (
                  <p className="empty-message">No liked items yet</p>
                ) : (
                  <div className="liked-list">
                    {likedItems.map((item) => (
                      <div key={item.name} className="liked-item">
                        <div className="liked-info">
                          <img src={item.image} alt={item.name} className="liked-image" onError={(e) => { console.warn('Image load failed', e.currentTarget.src, 'liked', item && (item.id || item.name)); e.currentTarget.src = getPlaceholder('No Image'); }} />
                          <div className="liked-details">
                            <h4 title={item.name}>{item.name}</h4>
                            <p className="liked-price">{formatPrice(item.price)}</p>
                          </div>
                        </div>
                        <button className="add-btn" onClick={() => handleLikedAddToCart(item)} title="Add to Cart" >
                          <HiOutlineShoppingCart size={25} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="account-card">
            <button className="account-card-trigger" onClick={() => toggleSection("payment")}>
              <div className="account-card-icon">
                <CreditCard size={18} />
              </div>
              <div className="account-card-copy">
                <h3>Payment</h3>
                <p>Cards and checkout methods</p>
              </div>
              <ChevronDown size={18} className={`chevron ${expandedSection === "payment" ? "expanded" : ""}`} />
            </button>
            {expandedSection === "payment" && (
              <div className="account-section-body">
                <div className="payment-list">
                  {paymentMethods.map((method) => (
                    <div key={method.label} className="payment-item">
                      <div>
                        <p className="payment-label">{method.label}</p>
                        <p className="payment-detail">{method.detail}</p>
                      </div>
                      <span className="payment-chip">Default</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="account-card logout-card">
            <button className="account-card-trigger" onClick={() => toggleSection("logout")}>
              <div className="account-card-icon logout-icon">
                <LogOut size={18} />
              </div>
              <div className="account-card-copy">
                <h3>Logout</h3>
                <p>Sign out securely</p>
              </div>
              <ChevronDown size={18} className={`chevron ${expandedSection === "logout" ? "expanded" : ""}`} />
            </button>
            {expandedSection === "logout" && (
              <div className="account-section-body logout-body">
                <p>You'll be signed out from this device and can log back in anytime.</p>
                <button className="logout-btn" onClick={handleLogout}>Logout</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Food Instructions</h3>
            <textarea
              placeholder="Add any special instructions..."
              value={tempInstructions}
              onChange={(e) => setTempInstructions(e.target.value)}
              rows={4}
            />
            <div className="modal-buttons">
              <button className="cancel-btn" onClick={handleCancelInstructions}>
                Cancel
              </button>
              <button className="save-btn" onClick={handleSaveInstructions}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <div className="toast">
          {toastMessage}
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

export default Profile;