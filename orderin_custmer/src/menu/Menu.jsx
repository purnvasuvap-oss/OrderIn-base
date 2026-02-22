import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTableNumber } from "../hooks/useTableNumber";
import "./Menu.css";
import { FiSearch } from "react-icons/fi";
import { ChevronDown, X } from "lucide-react";
import Header from "../header/header";
import Footer from "../Footer/Footer";
import { getPlaceholder } from "../utils/placeholder";
import { resolveImageUrl } from "../utils/storageResolver";

// Export a stable store object to avoid changing export shapes during HMR. The store
// has a small subscribe API so consumers can react when products change.
export const menuStore = (() => {
  let _products = [];
  let _subs = [];
  const get = () => _products;
  const set = (v) => { _products = v; _subs.forEach(fn => { try { fn(v); } catch (e) { /* ignore */ } }); };
  const subscribe = (fn) => { _subs.push(fn); return () => { _subs = _subs.filter(f => f !== fn); }; };

  // Freeze the returned object so the export shape remains stable across HMR updates.
  const store = Object.freeze({ get, set, subscribe });

  // Dev-time health: log exported menuStore shape so we can confirm export stability during HMR
  if (typeof window !== 'undefined' && typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV !== 'production') {
    try { console.info('menuStore exported with keys', Object.keys(store)); } catch (e) { /* ignore */ }
  }

  return store;
})();

const withTimeout = (promise, ms) => {
  const t = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  return Promise.race([promise, t]);
};

const loadActivePromotions = async () => {
  try {
    const snap = await getDocs(collection(db, "Restaurant", "orderin_restaurant_1", "promotions"));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const now = Date.now();
    return list.filter((p) => {
      if (!p.expiryAt) return false;
      const expiry = typeof p.expiryAt === "object" && p.expiryAt.toMillis ? p.expiryAt.toMillis() : p.expiryAt;
      return expiry >= now;
    });
  } catch (err) {
    console.warn("loadActivePromotions", err);
    return [];
  }
};

const prefetchImageWithRetries = (url, attempts = 2, timeout = 3000) => {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    let attempt = 0;
    const tryLoad = () => {
      attempt += 1;
      const img = new Image();
      let finished = false;
      const t = setTimeout(() => {
        if (finished) return;
        finished = true;
        img.onload = img.onerror = null;
        if (attempt < attempts) setTimeout(tryLoad, 200);
        else resolve(false);
      }, timeout);
      img.onload = () => {
        if (finished) return;
        finished = true;
        clearTimeout(t);
        img.onload = img.onerror = null;
        resolve(true);
      };
      img.onerror = () => {
        if (finished) return;
        finished = true;
        clearTimeout(t);
        img.onload = img.onerror = null;
        if (attempt < attempts) setTimeout(tryLoad, 200);
        else resolve(false);
      };
      img.src = url;
    };
    tryLoad();
  });
};

function Menu({ setIsLoading }) {
  const { getPathWithTable } = useTableNumber();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Category");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [vegToggle, setVegToggle] = useState("all");
  const [showAd, setShowAd] = useState(false);
  const [adPromotion, setAdPromotion] = useState(null);
  const [adImageLoaded, setAdImageLoaded] = useState(false);
  const [adImageSrc, setAdImageSrc] = useState("");
  const adObjectUrlRef = useRef(null);
  const [fetchedProducts, setFetchedProducts] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const fetchMenu = async () => {
      try {
        setIsLoading(true);
        const snap = await withTimeout(getDocs(collection(db, "Restaurant", "orderin_restaurant_1", "menu")), 8000);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!alive) return;
        setFetchedProducts(data);
        menuStore.set(data);
        try {
          window.__menu_products__ = data;
          window.dispatchEvent(new CustomEvent("menu:loaded", { detail: data }));
        } catch (e) {
          /* ignore */
        }
        setIsLoading(false);

        // Diagnostic: log items with missing or unusual image values to aid debugging image load issues
        try {
          const stats = { total: data.length, missing: 0, gs: 0, http: 0, relative: 0, other: 0 };
          const examples = [];
          data.forEach((it) => {
            // Support snake_case 'image_url' used in some docs
            const img = (it.image || it.imageURL || it.imageUrl || it.image_url || it.img || '').toString();
            if (!img) { stats.missing += 1; if (examples.length < 5) examples.push({ id: it.id, name: it.name, image: img }); return; }
            if (img.startsWith('gs://')) stats.gs += 1;
            else if (img.startsWith('http://') || img.startsWith('https://')) stats.http += 1;
            else if (img.indexOf('/') !== -1) stats.relative += 1;
            else stats.other += 1;
            if (examples.length < 5 && (!img.startsWith('http') && !img.startsWith('gs://'))) examples.push({ id: it.id, name: it.name, image: img });
          });
          console.info('Menu image diagnostics', stats, examples);
        } catch (e) { /* ignore diagnostics errors */ }

        (async () => {
          try {
            const promos = await withTimeout(loadActivePromotions(), 5000);
            if (!promos || promos.length === 0) return;

            // Diagnostics: log promotions image field shapes to aid debugging
            try {
              const pstats = { total: promos.length, missing: 0, gs: 0, http: 0, relative: 0, other: 0 };
              const pex = [];
              promos.forEach((p) => {
                const img = (p.image || p.imageURL || p.imageUrl || p.image_url || '').toString();
                if (!img) { pstats.missing += 1; if (pex.length < 5) pex.push({ id: p.id, caption: p.caption, image: img }); return; }
                if (img.startsWith('gs://')) pstats.gs += 1;
                else if (img.startsWith('http://') || img.startsWith('https://')) pstats.http += 1;
                else if (img.indexOf('/') !== -1) pstats.relative += 1;
                else pstats.other += 1;
                if (pex.length < 5 && (!img.startsWith('http') && !img.startsWith('gs://'))) pex.push({ id: p.id, caption: p.caption, image: img });
              });
              console.info('Promotions image diagnostics', pstats, pex);
            } catch (e) { /* ignore */ }

            const seenKey = "promotionsSeen";
            const seen = JSON.parse(localStorage.getItem(seenKey) || "[]");
            const unseen = promos.filter((p) => !seen.includes(p.id));
            const candidate = unseen.length === 0 ? promos[Math.floor(Math.random() * promos.length)] : unseen[Math.floor(Math.random() * unseen.length)];
            if (!candidate) return;
            const normalized = { ...candidate, imageURL: candidate.imageURL || candidate.imageUrl || candidate.image || candidate.image_url || "" };
            setAdPromotion(normalized);
            setAdImageLoaded(false);
            setShowAd(true);
            try {
              seen.push(candidate.id);
              localStorage.setItem(seenKey, JSON.stringify(seen));
            } catch (e) {}
            // Resolve gs:// URIs if present
            let adUrl = normalized.imageURL;
            try {
              const resolved = await resolveImageUrl(normalized.imageURL);
              if (resolved) adUrl = resolved;
            } catch (e) {}
            setAdImageSrc(adUrl);
            const ok = await prefetchImageWithRetries(adUrl, 2, 2500);
            if (!ok) {
              try {
                const resp = await fetch(adUrl, { cache: 'no-store' });
                if (resp.ok) {
                  const contentType = resp.headers && resp.headers.get ? resp.headers.get('content-type') : null;
                  if (!contentType || !contentType.startsWith('image/')) {
                    console.warn('Promotion fetch returned non-image content-type, skipping blob fallback', adUrl, resp.status, contentType);
                    // fall back to placeholder instead of broken image
                    setAdImageSrc(getPlaceholder('Promotion'));
                    setAdImageLoaded(true);
                  } else {
                    const blob = await resp.blob();
                    if (adObjectUrlRef.current) {
                      URL.revokeObjectURL(adObjectUrlRef.current);
                      adObjectUrlRef.current = null;
                    }
                    const obj = URL.createObjectURL(blob);
                    adObjectUrlRef.current = obj;
                    setAdImageSrc(obj);
                    // Keep adImageLoaded as false until onLoad fires (the image might still error)
                  }
                }
              } catch (err) {
                console.warn('Promotion blob fallback failed', adUrl, err);
                try { setAdImageSrc(getPlaceholder('Promotion')); setAdImageLoaded(true); } catch (e) {}
              }
            }
          } catch (err) {}
        })();
      } catch (err) {
        console.warn("fetchMenu error", err);
        setIsLoading(false);
      }
    };
    fetchMenu();
    return () => {
      alive = false;
      if (adObjectUrlRef.current) {
        URL.revokeObjectURL(adObjectUrlRef.current);
        adObjectUrlRef.current = null;
      }
    };
  }, [setIsLoading]);

  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const handleCategorySelect = (c) => {
    setSelectedCategory(c === "all" ? "Category" : c);
    setIsDropdownOpen(false);
  };
  const toggleDropdown = () => setIsDropdownOpen(!isDropdownOpen);
  const handleVegToggle = (t) => setVegToggle(t);
  const handleCardClick = (item) => navigate(`/item/${String(item.name || "").replace(/\s+/g, "-").toLowerCase()}${window.location.search}`, { state: { item } });
  const handleCloseAd = () => {
    setShowAd(false);
    if (adObjectUrlRef.current) {
      URL.revokeObjectURL(adObjectUrlRef.current);
      adObjectUrlRef.current = null;
    }
  };
  const handleAdImageLoad = () => setAdImageLoaded(true);

  useEffect(() => {
    const docClick = (ev) => {
      if (dropdownRef.current && !dropdownRef.current.contains(ev.target)) setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", docClick);
    return () => document.removeEventListener("mousedown", docClick);
  }, []);

  const normalizeToken = (s) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isNonVegToken = (t) => {
    if (!t) return false;
    return t.includes("nonveg") || t.includes("nonveget");
  };
  const isVegToken = (t) => {
    if (!t) return false;
    if (isNonVegToken(t)) return false;
    return t.includes("veg") || t.includes("veget");
  };

  // Treat several status/availability values as unavailable (case-insensitive)
  const isUnavailableStatus = (status) => {
    if (status == null) return false;
    try {
      const norm = String(status).toLowerCase().trim();
      const key = norm.replace(/[^a-z0-9]/g, '');
      const unavailable = new Set(['no', 'low', 'soldout', 'unavailable', 'outofstock', 'false', '0', 'sold']);
      return unavailable.has(key);
    } catch (e) {
      return false;
    }
  };
  const isOnPromotion = (item) => {
    if (!item) return false;
    const keys = ['promotions', 'promotion', 'onPromotion', 'promo', 'promotionStatus', 'promotion_flag'];
    for (const k of keys) {
      const v = item[k];
      if (v == null) continue;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        const s = v.toLowerCase().trim();
        if (['true', '1', 'yes', 'on'].includes(s)) return true;
      }
    }
    return false;
  };

  const parsePrice = (priceStr) => {
    const s = String(priceStr || '');
    const num = parseFloat(s.replace(/[^0-9.\-]/g, '')) || 0;
    return { value: num, symbol: '₹' };
  };

  const categories = React.useMemo(() => {
    const setC = new Set();
    const list = ["all"];
    fetchedProducts.forEach((it) => {
      if (it.category) {
        const lower = it.category.toLowerCase();
        if (!setC.has(lower)) {
          setC.add(lower);
          list.push(it.category);
        }
      }
    });
    return list;
  }, [fetchedProducts]);

  const filteredProducts = fetchedProducts.filter((item) => {
    const name = (item.name || "").toLowerCase();
    const term = (searchTerm || "").toLowerCase();
    const token = normalizeToken(searchTerm);
    const itemToken = normalizeToken(item.type || item.tags || "");
    const searchNon = isNonVegToken(token);
    const searchVeg = !searchNon && isVegToken(token);
    const itemNon = isNonVegToken(itemToken);
    const itemVeg = isVegToken(itemToken);
    const matchesName = name.includes(term) || term === "";
    const matchesType =
      vegToggle === "all" || (vegToggle === "veg" && itemVeg) || (vegToggle === "nonveg" && itemNon);
    const matchesSearch = matchesName || (searchNon && itemNon) || (searchVeg && itemVeg);
    const matchesCategory =
      selectedCategory === "Category" || (item.category && item.category.toLowerCase() === (selectedCategory || "").toLowerCase());
    return matchesSearch && matchesType && matchesCategory;
  });

  return (
    <div className="menu-container">
      <Header />

      {showAd && adPromotion && (
        <div className={`ad-overlay visible`}>
          <div className="ad-popup">
            <button className="ad-close-btn" onClick={handleCloseAd}>
              <X size={20} />
            </button>
            <div className="ad-content">
              {!adImageLoaded && <div className="ad-image-spinner loading-spinner" aria-hidden="true"></div>}
              <img
                src={adImageSrc || adPromotion.imageURL}
                alt={adPromotion?.caption || "Promotion"}
                className="ad-image"
                style={{ display: adImageLoaded ? "block" : "none" }}
                onLoad={handleAdImageLoad}
                onError={(e) => {
                  console.warn('Image load failed', e.target.src, 'promotion', adPromotion && (adPromotion.id || adPromotion.caption));
                  // If a blob URL was used and it failed, probe the original promotion URL for diagnostics
                  (async () => {
                    try {
                      const original = adPromotion && (adPromotion.imageURL || adPromotion.imageUrl || adPromotion.image);
                      if (String(e.target.src || '').startsWith('blob:') && original) {
                        try {
                          const probe = await fetch(original, { method: 'GET', cache: 'no-store' });
                          console.warn('Promotion probe result', original, 'status', probe.status, 'content-type', probe.headers && probe.headers.get ? probe.headers.get('content-type') : null);
                        } catch (probeErr) {
                          console.warn('Promotion probe failed', original, probeErr);
                        }
                      }
                    } catch (err) { /* ignore */ }
                  })();
                  try {
                    if (adObjectUrlRef.current && String(e.target.src || '').startsWith('blob:')) {
                      URL.revokeObjectURL(adObjectUrlRef.current);
                      adObjectUrlRef.current = null;
                    }
                  } catch (err) { /* ignore */ }
                  e.target.src = getPlaceholder('Promotion');
                  setAdImageLoaded(true);
                }}
              />
              <h2 className="ad-caption">{adPromotion?.caption}</h2>
              <p className="ad-description">{adPromotion?.description}</p>
            </div>
          </div>
        </div>
      )}

      <div className="search-bar-container">
        <div className="search-bar">
          <FiSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search menu items..."
            className="search-input"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        <div className="filters-container">
          <div className="category-dropdown" ref={dropdownRef}>
            <button className="category-button" onClick={toggleDropdown}>
              {selectedCategory} <ChevronDown size={16} />
            </button>
            {isDropdownOpen && (
              <div className="dropdown-menu">
                {categories.map((category) => (
                  <div key={category} className="dropdown-item" onClick={() => handleCategorySelect(category)}>
                    {category === "all" ? "All" : category.charAt(0).toUpperCase() + category.slice(1)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={`veg-toggle ${vegToggle}`}>
            <button className="toggle-button" aria-label="Veg" title="Veg" onClick={() => handleVegToggle("veg")}></button>
            <button className="toggle-button" aria-label="All" title="All" onClick={() => handleVegToggle("all")}></button>
            <button className="toggle-button" aria-label="Non-Veg" title="Non-Veg" onClick={() => handleVegToggle("nonveg")}></button>
          </div>
        </div>
      </div>

      <div className="app-container">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((item, index) => {
            const isUnavailable = isUnavailableStatus(item.availability || item.status || item.availabilty);
            return (
              <div
                className={`card ${isUnavailable ? 'unavailable' : ''}`}
                key={item.id || index}
                onClick={() => {
                  if (isUnavailable) {
                    console.debug('Navigation blocked: item unavailable', item && (item.id || item.name));
                    return;
                  }
                  handleCardClick(item);
                }}
                role="button"
                aria-disabled={isUnavailable}
                tabIndex={isUnavailable ? -1 : 0}
              >
                <img
                  loading="lazy"
                  src={item.image || item.imageURL || item.image_url || getPlaceholder('No Image')}
                  alt={item.name}
                  className="card-img"
                  onError={(e) => {
                    console.warn('Image load failed', e.target.src, 'item', item && (item.id || item.name));
                    e.target.src = getPlaceholder('No Image');
                  }}
                />
                <div className="card-body">
                  <h3 className="card-title">{item.name}</h3>
                  <p className="card-price">
                    {isOnPromotion(item) ? (() => {
                      const { value, symbol } = parsePrice(item.price);
                      const increased = (value * 1.25).toFixed(2);
                      return (
                        <>
                          <span className="price-normal">{symbol}{Number(value).toFixed(2)}</span>
                          <span className="price-increased">{symbol}{Number(increased).toFixed(2)}</span>
                        </>
                      );
                    })() : (
                      <span className="price-normal">{parsePrice(item.price).symbol}{parsePrice(item.price).value.toFixed(2)}</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="no-results">
            <p>No items found matching your search.</p>
          </div>
        )}
      </div>

      <Footer onCartClick={() => navigate(getPathWithTable("/cart"))} onHomeClick={() => navigate(getPathWithTable("/menu"))} onProfileClick={() => navigate(getPathWithTable("/profile"))} />
    </div>
  );
}

export default Menu;
