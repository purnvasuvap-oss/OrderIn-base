import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronDown, Plus } from "lucide-react";
import { AiOutlineShoppingCart } from "react-icons/ai";
import Footer from "../Footer/Footer";
import { useNavigate } from 'react-router-dom';
import { useCart } from "../context/CartContext";
import { useTableNumber } from "../hooks/useTableNumber";
// Import menuStore from canonical Menu module
import { menuStore } from "../menu/Menu";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./Profile.css";
import { getPlaceholder } from "../utils/placeholder";
import { resolveImageUrl } from "../utils/storageResolver";

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
        if (!stored) return;
        const u = JSON.parse(stored);
        if (!u || !u.phone) return;

        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_1', 'customers', u.phone);
        const snap = await getDoc(customerRef);
        if (!snap.exists()) {
          // no customer doc yet
          setOrderHistory([]);
          return;
        }

        const data = snap.data();
        const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];

        // Map firestore pastOrders into UI-friendly items, attempting to match menu products
        const mapped = pastOrders.map((o, idx) => {
          // o.items might be an array of items; we'll display first item summary for list
          const first = Array.isArray(o.items) && o.items.length > 0 ? o.items[0] : { name: o.itemName || 'Item', price: o.total || '₹0.00' };

          // Try to find product in current menu products using smarter matching
          const productsListLocal = (menuStore && menuStore.get().length > 0) ? menuStore.get() : (typeof window !== 'undefined' ? (window.__menu_products__ || []) : []);
          const prod = findProductMatch(first);
          // If products list is empty we can't conclude item is unavailable; only mark unavailable when products list exists but no match
          const isUnavailable = (!prod && productsListLocal.length > 0);

          // If we found a product match, prefer the full menu product details so UI shows canonical image/description/price
          const fullProd = prod ? { ...prod } : null;
          const resolvedImage = fullProd ? (fullProd.image || fullProd.imageUrl || fullProd.imageURL || fullProd.image_url || fullProd.img || '') : (first.image || first.image_url || PLACEHOLDER_IMAGE);
          const resolvedPrice = fullProd ? (fullProd.price || first.price) : (first.price || '₹0.00');
          const itemObj = fullProd ? { ...fullProd, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice } // take full product object from menu but normalize image/price
            : { name: first.name, image: (resolvedImage || PLACEHOLDER_IMAGE), price: resolvedPrice, unavailable: isUnavailable };
          // include paidPrice from the historical record so UI can show what was actually paid
          if (!itemObj.paidPrice) itemObj.paidPrice = (first && (first.price || first.paidPrice)) || o.total || null;

          // timestamp can be stored as ISO string or createdAt field
          let timestamp = new Date().toISOString();
          if (o.createdAt) {
            try {
              timestamp = typeof o.createdAt === 'string' ? o.createdAt : (o.createdAt.toDate ? o.createdAt.toDate().toISOString() : new Date(o.createdAt).toISOString());
            } catch (e) {
              timestamp = new Date().toISOString();
            }
          }

          return {
            id: o.id || (`order-${idx}`),
            item: itemObj,
            quantity: o.items && o.items.length > 0 ? (o.items[0].quantity || 1) : (o.quantity || 1),
            instructions: (o.items && o.items.length > 0 && o.items[0].instructions) || o.instructions || '',
            rawItem: first,
            timestamp: new Date(timestamp)
          };
        }).reverse();

        setOrderHistory(mapped);
      } catch (err) {
        console.error('Profile: error fetching pastOrders', err);
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
        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_1', 'customers', u.phone);
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [tempInstructions, setTempInstructions] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [addedItems, setAddedItems] = useState(new Set());

  const handleAddToCart = (item, quantity = 1, instructions = "") => {
    // Ensure we add the canonical product (with image) if available in menu
    const matched = findProductMatch(item) || (products || []).find(p => String(p.name || '').toLowerCase() === String(item.name || '').toLowerCase());
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
    return date.toLocaleDateString() + " at " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        <div className="user-info">
          <div className="user-detail">
            <label>Name:</label>
            <span>{user.username}</span>
          </div>
          <div className="user-detail">
            <label>Phone:</label>
            <span>{user.phone}</span>
          </div>
        </div>

        <div className="profile-sections">
          {/* Order History Section */}
          <div className="profile-section order-history">
            <div className="section-header" onClick={() => toggleSection('orders')}>
              <h3>Order History</h3>
              <ChevronDown
                size={20}
                className={`chevron ${expandedSection === 'orders' ? 'expanded' : ''}`}
              />
            </div>
            {expandedSection === 'orders' && (
              <div className="section-content">
                <div className="scrollable-content">
                  {orderHistory.length === 0 ? (
                    <p className="empty-message">No orders yet</p>
                  ) : (
                    orderHistory.map((order) => (
                      <div key={order.id} className="order-item">
                        <div className="order-info">
                          <img src={order.item.image} alt={order.item.name} className="order-image" onError={(e) => { console.warn('Image load failed', e.currentTarget.src, 'order', order && (order.id || order.item && (order.item.id || order.item.name))); e.currentTarget.src = getPlaceholder('No Image'); }} />
                          <div className="order-details">
                            <div className="order-title-zone">
                              <h4 className="order-title">{order.item.name}</h4>
                              {order.item.category && <span className="order-category">{order.item.category}</span>}
                              <div className="order-timestamp">{formatDate(order.timestamp)}</div>
                            </div>

                            <div className="order-meta-zone">
                              <span className="order-qty">{order.quantity} plates</span>
                              <span className="dot">•</span>
                              <span className="order-paid">Paid: {formatPrice(order.item.paidPrice || order.item.price)}</span>
                              {order.item.price && order.item.price !== order.item.paidPrice && (
                                <><span className="dot">•</span><span className="order-menu-price">Menu: {formatPrice(order.item.price)}</span></>
                              )}
                            </div>

                            {order.item.description && (
                              <p className="order-desc-zone">
                                {order.item.description}
                              </p>
                            )}

                            {order.instructions && (
                              <p className="order-instructions-zone">
                                <strong>Specifications:</strong> {order.instructions}
                              </p>
                            )}

                            {order.item.unavailable && (
                              <p className="order-unavailable">This item is no longer available</p>
                            )}
                          </div>
                        </div>
                        <button
                          className={`add-btn ${addedItems.has(order.item.name) ? 'added' : ''}`}
                          onClick={() => handleAddToCart(order.item, order.quantity, order.instructions)}
                          disabled={addedItems.has(order.item.name) || order.item.unavailable}
                          title={order.item.unavailable ? 'Unavailable' : (addedItems.has(order.item.name) ? 'Added' : 'Add to Cart')}
                        >
                          <AiOutlineShoppingCart size={20} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Liked List Section */}
          <div className="profile-section">
            <div className="section-header" onClick={() => toggleSection('liked')}>
              <h3>Liked List</h3>
              <ChevronDown
                size={20}
                className={`chevron ${expandedSection === 'liked' ? 'expanded' : ''}`}
              />
            </div>
            {expandedSection === 'liked' && (
              <div className="section-content">
                {likedItems.length === 0 ? (
                  <p className="empty-message">No liked items yet</p>
                ) : (
                  likedItems.map((item) => (
                    <div key={item.name} className="liked-item">
                      <div className="liked-info">
                        <img src={item.image} alt={item.name} className="liked-image" onError={(e) => { console.warn('Image load failed', e.currentTarget.src, 'liked', item && (item.id || item.name)); e.currentTarget.src = getPlaceholder('No Image'); }} />
                        <div className="liked-details">
                          <h4>{item.name}</h4>
                          <p className="liked-price">{formatPrice(item.price)}</p>
                        </div>
                      </div>
                      <button
                        className="add-btn"
                        onClick={() => handleLikedAddToCart(item)}
                        title="Add to Cart"
                      >
                        <AiOutlineShoppingCart size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL */}
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

      {/* TOAST */}
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
