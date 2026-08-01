import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Heart,
  Minus,
  Plus,
  ShoppingCart,
  Check,
  Share2,
  Leaf,
  Flame,
  Link2,
} from "lucide-react";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useCart } from "../context/CartContext";
import { useTableNumber } from "../hooks/useTableNumber";
import Footer from "../Footer/Footer";
import "./ItemDetails.css";
import { getPlaceholder } from "../utils/placeholder";
import { resolveImageUrl } from "../utils/storageResolver";
import {
  parsePriceValue,
  normalizeGroupOptions,
  getCustomizationGroups,
  getDefaultsForCategory,
  buildSelectedOptions,
  sumOptionPrices,
  buildCartKey,
} from "../utils/pricing";

function ItemDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { addToCart, cartItems, updateQuantity, updateInstructions } = useCart();
  const { getPathWithTable } = useTableNumber();

  const [item, setItem] = useState(location.state?.item || null);
  const [loading, setLoading] = useState(!item);
  const [error, setError] = useState(null);

  const [quantity, setQuantity] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [isFavorited, setIsFavorited] = useState(false);
  const [resolvedImage, setResolvedImage] = useState(item ? (item.image || item.imageURL || item.image_url || '') : '');
  const [linkCopied, setLinkCopied] = useState(false);
  const [customSelections, setCustomSelections] = useState({});

  // helper: normalize string for matching
  const normalizeString = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const customizationGroups = item ? getCustomizationGroups(item, getDefaultsForCategory) : [];
  const liveSelectedOptions = buildSelectedOptions(customizationGroups, customSelections);

  // Two selections are "the same line" only if every chosen option matches (order follows the group order, stable per item).
  const optionsMatch = (a = [], b = []) =>
    a.length === b.length && a.every((o, i) => b[i] && o.group === b[i].group && o.label === b[i].label);

  const cartItemForCurrentItem = cartItems.find((cartItem) => {
    if (!item || !cartItem) return false;
    const itemId = item.id || item.productId || item.itemId;
    const cartId = cartItem.id || cartItem.productId || cartItem.itemId;
    const nameMatches =
      (itemId && cartId && String(itemId) === String(cartId)) ||
      normalizeString(cartItem.name) === normalizeString(item.name);
    if (!nameMatches) return false;
    return optionsMatch(cartItem.selectedOptions, liveSelectedOptions);
  });

  const cartQuantity = Number(cartItemForCurrentItem?.quantity) || 0;
  const savedInstructions = cartItemForCurrentItem?.instructions || "";
  const instructionDraft = instructions.trim();
  const isCurrentSelectionAdded =
    Boolean(cartItemForCurrentItem) &&
    quantity === cartQuantity &&
    instructionDraft === savedInstructions;
  const actionLabel = (() => {
    if (isCurrentSelectionAdded) return "Added";
    if (!cartItemForCurrentItem) return "Add to Cart";
    return quantity > cartQuantity ? "Add Again" : "Update Cart";
  })();

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

  useEffect(() => {
    if (!item) return;
    if (cartItemForCurrentItem) {
      setQuantity(Math.max(1, Number(cartItemForCurrentItem.quantity) || 1));
      setInstructions(cartItemForCurrentItem.instructions || "");
    } else {
      setQuantity(1);
      setInstructions("");
    }
  }, [
    item,
    cartItemForCurrentItem?.quantity,
    cartItemForCurrentItem?.instructions,
    cartItemForCurrentItem?.name
  ]);

  // initialize favorite state from Firestore (if user logged in)
  useEffect(() => {
    let mounted = true;
    const initFav = async () => {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) return;
        const u = JSON.parse(stored);
        if (!u || !u.phone) return;
        const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_3', 'customers', u.phone);
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
          const querySnapshot = await getDocs(collection(db, "Restaurant", "orderin_restaurant_3", "menu"));
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

  // seed default customization selections once item is available
  useEffect(() => {
    if (!item) return;
    const groups = getCustomizationGroups(item, getDefaultsForCategory);
    setCustomSelections((prev) => {
      const next = { ...prev };
      groups.forEach((g) => {
        const opts = normalizeGroupOptions(g.options);
        if (!next[g.id] && opts.length) {
          next[g.id] = opts[0].label;
        }
      });
      return next;
    });
  }, [item]);

  if (loading) return <div className="itemdetails-loading">Loading item details…</div>;
  if (error) return <div className="itemdetails-error">{error}</div>;
  if (!item) return <div className="itemdetails-error">No item data found.</div>;

  // Swipe navigation removed - nextItem/prevItem were hardcoded to null (dead code)

  const handleBack = (e) => {
    e.stopPropagation();
    navigate(getPathWithTable('/menu'));
  };

  const handleQuantityChange = (delta) => {
    setQuantity(prev => Math.max(1, prev + delta));
  };

  const handleAddToCart = () => {
    if (isCurrentSelectionAdded) return;
    setIsModalOpen(true);
  };

  const buildInstructionsWithCustomizations = (baseText) => {
    const customLine = customizationGroups
      .map((g) => (customSelections[g.id] ? `${g.label}: ${customSelections[g.id]}` : null))
      .filter(Boolean)
      .join(' · ');
    const trimmedBase = baseText.trim();
    if (!customLine) return trimmedBase;
    return trimmedBase ? `${customLine} — ${trimmedBase}` : customLine;
  };

  const completeAddToCart = (instructionText = "", shouldSaveInstructions = false) => {
    const cleanedInstructions = shouldSaveInstructions
      ? buildInstructionsWithCustomizations(instructionText)
      : "";
    if (cartItemForCurrentItem) {
      updateQuantity(cartItemForCurrentItem.cartKey, quantity);
      if (shouldSaveInstructions) {
        updateInstructions(cartItemForCurrentItem.cartKey, cleanedInstructions);
      }
    } else {
      addToCart(item, quantity, shouldSaveInstructions ? cleanedInstructions : "", liveSelectedOptions);
    }
    setIsModalOpen(false);
    setInstructions(shouldSaveInstructions ? instructionText.trim() : (cartItemForCurrentItem?.instructions || ""));
  };

  const handleSaveInstructions = () => {
    completeAddToCart(instructions, true);
  };

  const handleCancelInstructions = () => {
    completeAddToCart("", false);
  };

  const handleFavoriteToggle = async () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) {
        alert('Please login to save favorites');
        return;
      }
      const u = JSON.parse(stored);
      if (!u || !u.phone) {
        alert('Please login to save favorites');
        return;
      }

      const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_3', 'customers', u.phone);
      const snap = await getDoc(customerRef);
      const existing = snap.exists() ? (Array.isArray(snap.data().likedItems) ? snap.data().likedItems : []) : [];

      if (!isFavorited) {
        const payload = {
          id: item.id || item.productId || item.name,
          name: item.name,
          image: item.image || '',
          price: item.price || '',
          addedAt: new Date().toISOString()
        };
        const newArr = [payload, ...existing.filter(Boolean)];
        await setDoc(customerRef, { likedItems: newArr }, { merge: true });
        setIsFavorited(true);
      } else {
        const newArr = existing.filter(li => !( (li.id && item.id && String(li.id) === String(item.id)) || normalizeString(li.name) === normalizeString(item.name) ));
        await setDoc(customerRef, { likedItems: newArr }, { merge: true });
        setIsFavorited(false);
      }
    } catch (err) {
      console.error('Error toggling favorite', err);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: item.name,
      text: `Check out ${item.name} on the menu`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      throw new Error('Web Share unavailable');
    } catch (e) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1800);
      } catch (clipErr) {
        console.error('Unable to share or copy link', clipErr);
      }
    }
  };

  const effectiveUnitPrice = parsePriceValue(item.price) + sumOptionPrices(liveSelectedOptions);
  const totalPrice = (effectiveUnitPrice * quantity).toFixed(2);

  const isBestseller = Boolean(item.bestseller || item.isBestseller);
  const isVeg = item.isVeg === true || (typeof item.dietType === 'string' && item.dietType.toLowerCase() === 'veg');
  const isNonVeg = item.isVeg === false || (typeof item.dietType === 'string' && item.dietType.toLowerCase() === 'non-veg');

  const nutritionTags = [];
  if (item.calories) nutritionTags.push({ key: 'calories', label: `${item.calories} kcal`, icon: null });
  if (isVeg) nutritionTags.push({ key: 'veg', label: 'Vegetarian', icon: Leaf });
  if (isNonVeg) nutritionTags.push({ key: 'nonveg', label: 'Non-Vegetarian', icon: null });
  if (item.spiceLevel) nutritionTags.push({ key: 'spice', label: item.spiceLevel, icon: Flame });
  if (Array.isArray(item.tags)) {
    item.tags.forEach((t, idx) => nutritionTags.push({ key: `tag-${idx}`, label: t, icon: null }));
  }

  const ingredients = Array.isArray(item.ingredients) ? item.ingredients.filter(Boolean) : [];

  return (
    <div
      className="itemdetails-overlay"
    >
      {/* HERO */}
      <div className="hero-section">
        {item.videos ? (
          <video
            src={item.videos}
            poster={resolvedImage || item.image || getPlaceholder('No Image')}
            autoPlay
            loop
            muted
            className="hero-media"
            onError={(e) => { console.warn('Media poster failed', e.target.poster, 'item', item && (item.id || item.name)); e.target.poster = getPlaceholder('No Image'); }}
          />
        ) : (
          <img
            src={resolvedImage || item.image || getPlaceholder('No Image')}
            alt={item.name}
            className="hero-media"
            onError={(e) => { console.warn('Image load failed', e.target.src, 'item', item && (item.id || item.name)); e.target.src = getPlaceholder('No Image'); }}
          />
        )}
        <div className="hero-scrim" />

        <div className="hero-topbar">
          <button className="floating-icon-btn" onClick={handleBack} aria-label="Back to menu">
            <ArrowLeft size={20} />
          </button>
          <div className="floating-icon-group">
            <button className="floating-icon-btn" onClick={handleShare} aria-label="Share this item">
              {linkCopied ? <Check size={18} /> : <Share2 size={18} />}
            </button>
            <button
              className="floating-icon-btn"
              onClick={handleFavoriteToggle}
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={18} className={isFavorited ? 'heart-filled' : ''} />
            </button>
          </div>
        </div>

        {linkCopied && <div className="link-toast"><Link2 size={13} /> Link copied</div>}
      </div>

      {/* CONTENT CARD */}
      <div className="content-card">
        {isBestseller && (
          <div className="chef-stamp" aria-label="Bestseller">
            <span className="chef-stamp-star">★</span>
            <span>Chef's Pick</span>
          </div>
        )}

        <div className="content-inner">
          <p className="eyebrow">{item.category || 'On The Menu'}</p>

          <div className="title-row">
            <h1 className="item-title">{item.name}</h1>
            {(isVeg || isNonVeg) && (
              <span className={`diet-dot ${isVeg ? 'veg' : 'nonveg'}`} aria-hidden="true" />
            )}
          </div>

          <p className="item-description">{item.description}</p>

          {nutritionTags.length > 0 && (
            <div className="chip-row">
              {nutritionTags.map((tag) => {
                const Icon = tag.icon;
                return (
                  <span className="nutrition-chip" key={tag.key}>
                    {Icon && <Icon size={13} />}
                    {tag.label}
                  </span>
                );
              })}
            </div>
          )}

          <div className="section-divider" />

          <section className="detail-section">
            <h3 className="section-heading">Ingredients</h3>
            {ingredients.length > 0 ? (
              <div className="chip-row">
                {ingredients.map((ing, idx) => (
                  <span className="ingredient-chip" key={`${ing}-${idx}`}>{ing}</span>
                ))}
              </div>
            ) : (
              <p className="section-placeholder">Ingredient details coming soon — ask your server for allergen information.</p>
            )}
          </section>

          <div className="section-divider" />

          <section className="detail-section">
            <h3 className="section-heading">Customize</h3>
            <div className="customize-groups">
              {customizationGroups.map((group) => {
                const options = normalizeGroupOptions(group.options);
                return (
                  <div className="customize-group" key={group.id || group.label}>
                    <p className="customize-label">{group.label}</p>
                    <div className="chip-row">
                      {options.map((opt) => {
                        const isActive = customSelections[group.id] === opt.label;
                        return (
                          <button
                            type="button"
                            key={opt.label}
                            className={`option-chip ${isActive ? 'active' : ''}`}
                            onClick={() => setCustomSelections((prev) => ({ ...prev, [group.id]: opt.label }))}
                          >
                            {opt.label}
                            {opt.price > 0 && <span className="option-chip-price">+₹{opt.price}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="section-divider" />

          <section className="detail-section quantity-section-wrap">
            <h3 className="section-heading">Quantity</h3>
            <div className="quantity-section">
              <button
                className="qty-btn"
                onClick={() => handleQuantityChange(-1)}
                aria-label="Decrease quantity"
              >
                <Minus size={20} />
              </button>
              <span className="qty-value">{quantity}</span>
              <button className="qty-btn" onClick={() => handleQuantityChange(1)} aria-label="Increase quantity">
                <Plus size={20} />
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className="bottom-bar">
        <div className="price-section">
          <p className="price-label">Total Price</p>
          <p className="price-value">₹{totalPrice}</p>
        </div>
        <button
          className={`add-to-cart-btn ${isCurrentSelectionAdded ? 'added' : cartItemForCurrentItem ? 'needs-update' : ''}`}
          onClick={handleAddToCart}
          disabled={isCurrentSelectionAdded}
        >
          {isCurrentSelectionAdded ? (
            <>
              <Check size={18} /> Added
            </>
          ) : (
            <>
              <ShoppingCart size={18} /> {actionLabel}
            </>
          )}
        </button>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="food-instructions-modal-overlay">
          <div className="food-instructions-modal-content">
            <h3>Food Instructions</h3>
            <textarea
              placeholder="Add any special instructions…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
            />
            <div className="food-instructions-modal-buttons">
              <button className="food-instructions-cancel-btn" onClick={handleCancelInstructions}>
                Cancel
              </button>
              <button className="food-instructions-save-btn" onClick={handleSaveInstructions}>
                Save
              </button>
            </div>
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

export default ItemDetails;