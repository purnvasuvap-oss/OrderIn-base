import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, Minus, Plus, ShoppingCart, Check } from "lucide-react";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useCart } from "../context/CartContext";
import { useTableNumber } from "../hooks/useTableNumber";
import Footer from "../Footer/Footer";
import "./ItemDetails.css";
import { getPlaceholder } from "../utils/placeholder";
import { resolveImageUrl } from "../utils/storageResolver";

function ItemDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { addToCart } = useCart();
  const { getPathWithTable } = useTableNumber();

  const [item, setItem] = useState(location.state?.item || null);
  const [loading, setLoading] = useState(!item);
  const [error, setError] = useState(null);

  const [quantity, setQuantity] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [isAddedToCart, setIsAddedToCart] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [resolvedImage, setResolvedImage] = useState(item ? (item.image || item.imageURL || item.image_url || '') : '');

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      try {
        const field = item && (item.image || item.imageURL || item.image_url || '');
        if (!field) { if (mounted) setResolvedImage(''); return; }
        if (field.startsWith('gs://')) {
          const r = await resolveImageUrl(field);
          if (mounted) setResolvedImage(r || field);
        } else {
          if (mounted) setResolvedImage(field);
        }
      } catch (e) { if (mounted) setResolvedImage(item.image || item.image_url || ''); }
    };
    resolve();
    return () => { mounted = false; };
  }, [item]);

  // helper: normalize string for matching
  const normalizeString = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // initialize favorite state from Firestore (if user logged in)
  useEffect(() => {
    let mounted = true;
    const initFav = async () => {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) return;
        const u = JSON.parse(stored);
        if (!u || !u.phone) return;
        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_1', 'customers', u.phone);
        const snap = await getDoc(customerRef);
        if (!mounted) return;
        if (!snap.exists()) {
          setIsFavorited(false);
          return;
        }
        const data = snap.data();
        const liked = Array.isArray(data.likedItems) ? data.likedItems : [];
        // consider match by id or name
        const match = liked.find(li => (li.id && item.id && String(li.id) === String(item.id)) || normalizeString(li.name) === normalizeString(item.name));
        setIsFavorited(Boolean(match));
      } catch (err) {
        console.error('Error initializing favorite state', err);
      }
    };
    initFav();
    return () => { mounted = false; };
  }, [item]);

  useEffect(() => {
    if (!item && id) {
      const fetchItem = async () => {
        try {
          const querySnapshot = await getDocs(collection(db, "Restaurant", "orderin_restaurant_1", "menu"));
          const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const foundItem = productsData.find(product => product.name.replace(/\s+/g, '-').toLowerCase() === id);
          if (foundItem) {
            setItem(foundItem);
          } else {
            setError('Item not found');
          }
          setLoading(false);
        } catch (err) {
          setError(err.message);
          setLoading(false);
        }
      };
      fetchItem();
    }
  }, [item, id]);

  if (loading) return <div className="itemdetails-loading">Loading item details...</div>;
  if (error) return <div className="itemdetails-error">{error}</div>;
  if (!item) return <div className="itemdetails-error">No item data found.</div>;

  // Find current item index and next/previous items
  // Note: For swipe functionality, we would need to fetch all products or use a context.
  // For now, disable swipe or implement later.
  const nextItem = null;
  const prevItem = null;

  // Swipe handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && nextItem) {
      // Swipe left - next item
      navigate(getPathWithTable(`/item/${nextItem.name.replace(/\s+/g, '-').toLowerCase()}`), { state: { item: nextItem } });
    }
    if (isRightSwipe && prevItem) {
      // Swipe right - previous item
      navigate(getPathWithTable(`/item/${prevItem.name.replace(/\s+/g, '-').toLowerCase()}`), { state: { item: prevItem } });
    }
  };

  const handleBack = (e) => {
    e.stopPropagation();
    navigate(getPathWithTable('/menu'));
  };

  const handleQuantityChange = (delta) => {
    setQuantity(prev => Math.max(1, prev + delta));
  };

  const handleAddToCart = () => {
    setIsModalOpen(true);
  };

  const handleSaveInstructions = () => {
    addToCart(item, quantity, instructions);
    setIsAddedToCart(true);
    setIsModalOpen(false);
  };

  const handleCancelInstructions = () => {
    setIsModalOpen(false);
  };

  const handleFavoriteToggle = async () => {
    // toggle and persist to Firestore under customers/<phone>.likedItems
    try {
      const stored = localStorage.getItem('user');
      if (!stored) {
        // Not logged in - optionally navigate to login or show toast
        alert('Please login to save favorites');
        return;
      }
      const u = JSON.parse(stored);
      if (!u || !u.phone) {
        alert('Please login to save favorites');
        return;
      }

      const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_1', 'customers', u.phone);
      const snap = await getDoc(customerRef);
      const existing = snap.exists() ? (Array.isArray(snap.data().likedItems) ? snap.data().likedItems : []) : [];

      if (!isFavorited) {
        // add
        const payload = {
          id: item.id || item.productId || item.name,
          name: item.name,
          image: item.image || '',
          price: item.price || '',
          addedAt: new Date().toISOString()
        };
        // prepend so newest appear first
        const newArr = [payload, ...existing.filter(Boolean)];
        await setDoc(customerRef, { likedItems: newArr }, { merge: true });
        setIsFavorited(true);
      } else {
        // remove by id or name
        const newArr = existing.filter(li => !( (li.id && item.id && String(li.id) === String(item.id)) || normalizeString(li.name) === normalizeString(item.name) ));
        await setDoc(customerRef, { likedItems: newArr }, { merge: true });
        setIsFavorited(false);
      }
    } catch (err) {
      console.error('Error toggling favorite', err);
    }
  };

  const totalPrice = (parseFloat(String(item.price || '').replace(/[^0-9.\-]/g, '')) * quantity).toFixed(2);

  return (
    <div
      className="itemdetails-overlay"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* HEADER */}
      <div className="itemdetails-header">
        <button className="bac-button" onClick={handleBack}>
          <ArrowLeft size={22} />
        </button>
      </div>

      {/* IMAGE */}
      <div className="itemdetails-image-container">
        {item.videos ? (
          <video
            src={item.videos}
            poster={resolvedImage || item.image || getPlaceholder('No Image')}
            autoPlay
            loop
            muted
            className="itemdetails-image"
            onError={(e) => {              console.warn('Media poster failed', e.target.poster, 'item', item && (item.id || item.name));              e.target.poster = getPlaceholder('No Image');
            }}
          />
        ) : (
          <img src={resolvedImage || item.image || getPlaceholder('No Image')} alt={item.name} className="itemdetails-image" onError={(e) => { console.warn('Image load failed', e.target.src, 'item', item && (item.id || item.name)); e.target.src = getPlaceholder('No Image'); }} />
        )}
      </div>

      {/* swipe indicator removed per design request */}

      {/* INFO SECTION */}
      <div className="itemdetails-info">
        <div className="itemdetails-header-row">
          <h2 className="itemdetails-title">{item.name}</h2>
          <Heart
            size={22}
            className={`heart-icon ${isFavorited ? 'favorited' : ''}`}
            onClick={handleFavoriteToggle}
          />
        </div>



        <p className="itemdetails-description">{item.description}</p>

        {/* Quantity Controls */}
        <div className="quantity-section">
          <button
            className="qty-btn"
            onClick={() => handleQuantityChange(-1)}
          >
            <Minus size={18} />
          </button>
          <span className="qty-value">{quantity}</span>
          <button className="qty-btn" onClick={() => handleQuantityChange(1)}>
            <Plus size={18} />
          </button>
        </div>

        {/* BOTTOM BAR */}
        <div className="bottom-bar">
          <div className="price-section">
            <p className="price-label">Total Price</p>
            <p className="price-value">₹{totalPrice}</p>
          </div>
          <button
            className={`add-to-cart-btn ${isAddedToCart ? 'added' : ''}`}
            onClick={handleAddToCart}
            disabled={isAddedToCart}
          >
            {isAddedToCart ? (
              <>
                <Check size={18} /> ✓ Added
              </>
            ) : (
              <>
                <ShoppingCart size={18} /> Add to Cart
              </>
            )}
          </button>
        </div>

        {/* MODAL */}
        {isModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Food Instructions</h3>
              <textarea
                placeholder="Add any special instructions..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
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
      </div>

      {/* show global footer inside overlay so footer is visible on item page */}
      <Footer
        onCartClick={() => navigate(getPathWithTable('/cart'))}
        onHomeClick={() => navigate(getPathWithTable('/menu'))}
        onProfileClick={() => navigate(getPathWithTable('/profile'))}
      />

    </div>
  );
}

export default ItemDetails;
