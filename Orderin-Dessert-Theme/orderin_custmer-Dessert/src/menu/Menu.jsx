import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTableNumber } from "../hooks/useTableNumber";
import { menuStore } from "./menuStore";
import "./Menu.css";
import {
  Search,
  Mic,
  X,
  SlidersHorizontal,
  Star,
  Flame,
  Plus,
  Leaf,
  Bike,
} from "lucide-react";
import Header from "../header/header";
import Footer from "../Footer/Footer";
import { getPlaceholder } from "../utils/placeholder";
import { resolveImageUrl } from "../utils/storageResolver";

const CART_STORAGE_KEY = "orderin_cart";
const ACTIVE_ORDER_STORAGE_KEY = "orderin_active_order";

const withTimeout = (promise, ms) => {
  const t = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  return Promise.race([promise, t]);
};

const loadActivePromotions = async () => {
  try {
    const snap = await getDocs(collection(db, "Restaurant", "orderin_restaurant_3", "promotions"));
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

// ---- Small presentation helpers -------------------------------------------------

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Late night cravings";
};

// Deterministic fallback rating (3.8 - 4.8) so cards never look unfinished
// while real `rating` data is still being populated in Firestore.
const hashToRating = (id) => {
  const str = String(id || "item");
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return Math.round((3.8 + (h % 11) / 10) * 10) / 10;
};

const readCart = () => {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
  } catch (e) {
    return [];
  }
};

const writeCart = (cart) => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: cart }));
  } catch (e) {
    /* ignore */
  }
};

function Menu({ setIsLoading }) {
  const { getPathWithTable, tableNumber: tableNumberFromHook } = useTableNumber();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [vegToggle, setVegToggle] = useState("all");
  const [adPromotion, setAdPromotion] = useState(null);
  const [adImageLoaded, setAdImageLoaded] = useState(false);
  const [adImageSrc, setAdImageSrc] = useState("");
  const adObjectUrlRef = useRef(null);
  const [fetchedProducts, setFetchedProducts] = useState([]);
  const [restaurantName, setRestaurantName] = useState("Our Restaurant");
  const [activeOrder, setActiveOrder] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [pulseId, setPulseId] = useState(null);
  const recognitionRef = useRef(null);

  const tableNumber = tableNumberFromHook || null;

  // Restaurant name (falls back gracefully if the doc has no `name` field)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "Restaurant", "orderin_restaurant_3"));
        if (alive && snap.exists() && snap.data().name) {
          setRestaurantName(snap.data().name);
        }
      } catch (e) {
        /* keep default name */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Active order status, if one exists locally (e.g. set after checkout)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_ORDER_STORAGE_KEY);
      if (raw) setActiveOrder(JSON.parse(raw));
    } catch (e) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchMenu = async () => {
      try {
        setIsLoading(true);
        const snap = await withTimeout(getDocs(collection(db, "Restaurant", "orderin_restaurant_3", "menu")), 8000);
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
            const img = (it.image || it.imageURL || it.imageUrl || it.image_url || it.img || "").toString();
            if (!img) {
              stats.missing += 1;
              if (examples.length < 5) examples.push({ id: it.id, name: it.name, image: img });
              return;
            }
            if (img.startsWith("gs://")) stats.gs += 1;
            else if (img.startsWith("http://") || img.startsWith("https://")) stats.http += 1;
            else if (img.indexOf("/") !== -1) stats.relative += 1;
            else stats.other += 1;
            if (examples.length < 5 && !img.startsWith("http") && !img.startsWith("gs://")) {
              examples.push({ id: it.id, name: it.name, image: img });
            }
          });
          console.info("Menu image diagnostics", stats, examples);
        } catch (e) {
          /* ignore diagnostics errors */
        }

        (async () => {
          try {
            const promos = await withTimeout(loadActivePromotions(), 5000);
            if (!promos || promos.length === 0) return;

            try {
              const pstats = { total: promos.length, missing: 0, gs: 0, http: 0, relative: 0, other: 0 };
              const pex = [];
              promos.forEach((p) => {
                const img = (p.image || p.imageURL || p.imageUrl || p.image_url || "").toString();
                if (!img) {
                  pstats.missing += 1;
                  if (pex.length < 5) pex.push({ id: p.id, caption: p.caption, image: img });
                  return;
                }
                if (img.startsWith("gs://")) pstats.gs += 1;
                else if (img.startsWith("http://") || img.startsWith("https://")) pstats.http += 1;
                else if (img.indexOf("/") !== -1) pstats.relative += 1;
                else pstats.other += 1;
                if (pex.length < 5 && !img.startsWith("http") && !img.startsWith("gs://")) {
                  pex.push({ id: p.id, caption: p.caption, image: img });
                }
              });
              console.info("Promotions image diagnostics", pstats, pex);
            } catch (e) {
              /* ignore */
            }

            const seenKey = "promotionsSeen";
            const seen = JSON.parse(localStorage.getItem(seenKey) || "[]");
            const unseen = promos.filter((p) => !seen.includes(p.id));
            const candidate = unseen.length === 0 ? promos[Math.floor(Math.random() * promos.length)] : unseen[Math.floor(Math.random() * unseen.length)];
            if (!candidate) return;
            const normalized = { ...candidate, imageURL: candidate.imageURL || candidate.imageUrl || candidate.image || candidate.image_url || "" };
            setAdPromotion(normalized);
            setAdImageLoaded(false);
            try {
              seen.push(candidate.id);
              localStorage.setItem(seenKey, JSON.stringify(seen));
            } catch (e) {}
            let adUrl = normalized.imageURL;
            try {
              const resolved = await resolveImageUrl(normalized.imageURL);
              if (resolved) adUrl = resolved;
            } catch (e) {}
            setAdImageSrc(adUrl);
            const ok = await prefetchImageWithRetries(adUrl, 2, 2500);
            if (!ok) {
              try {
                const resp = await fetch(adUrl, { cache: "no-store" });
                if (resp.ok) {
                  const contentType = resp.headers && resp.headers.get ? resp.headers.get("content-type") : null;
                  if (!contentType || !contentType.startsWith("image/")) {
                    console.warn("Promotion fetch returned non-image content-type, skipping blob fallback", adUrl, resp.status, contentType);
                    setAdImageSrc(getPlaceholder("Promotion"));
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
                  }
                }
              } catch (err) {
                console.warn("Promotion blob fallback failed", adUrl, err);
                try {
                  setAdImageSrc(getPlaceholder("Promotion"));
                  setAdImageLoaded(true);
                } catch (e) {}
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
  const clearSearch = () => setSearchTerm("");



  const handleCategorySelect = (c) => setSelectedCategory(c);
  const handleVegToggle = (t) => setVegToggle((prev) => (prev === t ? "all" : t));
  const handleCardClick = (item) => navigate(`/item/${String(item.name || "").replace(/\s+/g, "-").toLowerCase()}${window.location.search}`, { state: { item } });
  const handleAdImageLoad = () => setAdImageLoaded(true);

  const handleQuickAdd = (e, item) => {
    e.stopPropagation();
    const cart = readCart();
    const idx = cart.findIndex((c) => c.id === item.id);
    if (idx >= 0) cart[idx].qty += 1;
    else cart.push({ id: item.id, name: item.name, price: parsePrice(item.price).value, qty: 1 });
    writeCart(cart);
    setPulseId(item.id);
    setTimeout(() => setPulseId((cur) => (cur === item.id ? null : cur)), 450);
  };

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

  const getDietType = (item) => {
    const token = normalizeToken(item.type || item.tags || "");
    if (isNonVegToken(token)) return "nonveg";
    if (isVegToken(token)) return "veg";
    return null;
  };

  const isBestseller = (item) => {
    if (!item) return false;
    if (item.bestseller === true || item.isBestseller === true) return true;
    return normalizeToken(item.tags || "").includes("bestseller");
  };

  const getSpiceLevel = (item) => {
    if (!item) return 0;
    if (typeof item.spiceLevel === "number") return Math.max(0, Math.min(3, item.spiceLevel));
    if (item.spicy === true) return 2;
    const tags = normalizeToken(item.tags || "") + normalizeToken(item.type || "");
    if (tags.includes("extraspicy") || tags.includes("veryspicy")) return 3;
    if (tags.includes("spicy")) return 2;
    if (tags.includes("mild")) return 1;
    return 0;
  };

  const isUnavailableStatus = (status) => {
    if (status == null) return false;
    try {
      const norm = String(status).toLowerCase().trim();
      const key = norm.replace(/[^a-z0-9]/g, "");
      const unavailable = new Set(["no", "low", "soldout", "unavailable", "outofstock", "false", "0", "sold"]);
      return unavailable.has(key);
    } catch (e) {
      return false;
    }
  };

  const isOnPromotion = (item) => {
    if (!item) return false;
    const keys = ["promotions", "promotion", "onPromotion", "promo", "promotionStatus", "promotion_flag"];
    for (const k of keys) {
      const v = item[k];
      if (v == null) continue;
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") {
        const s = v.toLowerCase().trim();
        if (["true", "1", "yes", "on"].includes(s)) return true;
      }
    }
    return false;
  };

  const parsePrice = (priceStr) => {
    const s = String(priceStr || "");
    const num = parseFloat(s.replace(/[^0-9.\-]/g, "")) || 0;
    return { value: num, symbol: "₹" };
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
    const matchesType = vegToggle === "all" || (vegToggle === "veg" && itemVeg) || (vegToggle === "nonveg" && itemNon);
    const matchesSearch = matchesName || (searchNon && itemNon) || (searchVeg && itemVeg);
    const matchesCategory = selectedCategory === "all" || (item.category && item.category.toLowerCase() === selectedCategory.toLowerCase());
    return matchesSearch && matchesType && matchesCategory;
  });

 

  return (
    <div className="menu-container">
      <Header />

      <div className="hero-bar">
        <div className="hero-greeting">
          <p className="hero-eyebrow">{getGreeting()}</p>
          <h1 className="hero-title">{restaurantName}</h1>
        </div>
        <div className="hero-meta">
          {tableNumber && <span className="table-chip">Table {tableNumber}</span>}
          {activeOrder?.status && (
            <button className="order-status-pill" onClick={() => navigate(getPathWithTable("/orders"))}>
              <Bike size={14} />
              {activeOrder.status}
            </button>
          )}
        </div>
      </div>

      <div className="search-row">
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search for dishes, cuisines..."
            className="search-input"
            value={searchTerm}
            onChange={handleSearchChange}
          />
          {searchTerm && (
            <button className="icon-btn clear-btn" onClick={clearSearch} title="Clear search">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="selection-row" role="tablist" aria-label="Menu categories">
        {categories.map((category) => (
          <button
            key={category}
            role="tab"
            aria-selected={selectedCategory === category}
            className={`selection ${selectedCategory === category ? "active" : ""}`}
            onClick={() => handleCategorySelect(category)}
          >
            {category === "all" ? "All" : category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>

      {adPromotion && (
        <div className="promotion-banner">
          <div className="promotion-content">
            <div className="promo-badge">Special Offer</div>
            <div className="promotion-text">
              <h2 className="promotion-caption">{adPromotion?.caption}</h2>
              <p className="promotion-description">{adPromotion?.description}</p>
            </div>
            <div className="promotion-image-wrapper">
              {!adImageLoaded && <div className="promotion-image-spinner loading-spinner" aria-hidden="true"></div>}
              <img
                src={adImageSrc || adPromotion.imageURL}
                alt={adPromotion?.caption || "Promotion"}
                className="promotion-image"
                style={{ display: adImageLoaded ? "block" : "none" }}
                onLoad={handleAdImageLoad}
                onError={(e) => {
                  console.warn("Image load failed", e.target.src, "promotion", adPromotion && (adPromotion.id || adPromotion.caption));
                  e.target.src = getPlaceholder("Promotion");
                  setAdImageLoaded(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="menu-grid-section">
        {filteredProducts.length > 0 ? (
          (() => {
            const categoryOrder = [];
            const buckets = new Map();

            filteredProducts.forEach((item) => {
              const cat = (item.category || "").trim() || "Uncategorized";
              if (!buckets.has(cat)) {
                buckets.set(cat, []);
                categoryOrder.push(cat);
              }
              buckets.get(cat).push(item);
            });

            return categoryOrder.map((cat) => (
              <div className="category-section" key={cat}>
                <div className="category-section-header">
                  <span>{cat}</span>
                  <span className="category-count">{buckets.get(cat).length}</span>
                </div>
                <div className="food-grid">
                  {buckets.get(cat).map((item, index) => {
                    const isUnavailable = isUnavailableStatus(item.availability || item.status || item.availabilty);
                    const diet = getDietType(item);
                    const bestseller = isBestseller(item);
                    const spiceLevel = getSpiceLevel(item);
                    const rating = typeof item.rating === "number" ? item.rating : hashToRating(item.id);
                    const { value, symbol } = parsePrice(item.price);
                    const onPromo = isOnPromotion(item);
                    const increased = (value * 1.25).toFixed(2);

                    return (
                      <div
                        className={`food-card ${isUnavailable ? "unavailable" : ""}`}
                        key={item.id || `${cat}-${index}`}
                        onClick={() => {
                          if (isUnavailable) return;
                          handleCardClick(item);
                        }}
                        role="button"
                        aria-disabled={isUnavailable}
                        tabIndex={isUnavailable ? -1 : 0}
                      >
                        <div className="food-card-media">
                          <img
                            loading="lazy"
                            src={item.image || item.imageURL || item.image_url || getPlaceholder("No Image")}
                            alt={item.name}
                            className="food-card-img"
                            onError={(e) => {
                              console.warn("Image load failed", e.target.src, "item", item && (item.id || item.name));
                              e.target.src = getPlaceholder("No Image");
                            }}
                          />
                          <div className="media-gradient" aria-hidden="true" />
                          {bestseller && (
                            <span className="badge-bestseller">
                              <Flame size={11} /> Bestseller
                            </span>
                          )}
                        </div>

                        <div className="food-card-body">
                          <h3 className="food-card-title">
                            {item.name}
                            {spiceLevel > 0 && (
                              <span className="spice-flames" aria-label={`Spice level ${spiceLevel} of 3`}>
                                {Array.from({ length: spiceLevel }).map((_, i) => (
                                  <Flame key={i} size={11} />
                                ))}
                              </span>
                            )}
                          </h3>
                          <div className="price-row">
                            <span className="price-current">
                              {symbol}
                              {value.toFixed(2)}
                            </span>
                            {onPromo && (
                              <span className="price-original">
                                {symbol}
                                {increased}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()
        ) : (
          <div className="no-results">
            <p>No items found matching your search.</p>
          </div>
        )}
      </div>

      <button className="filter-fab" onClick={() => setIsFilterSheetOpen(true)}>
        <SlidersHorizontal size={25} />
        <span>Filter</span>
      </button>

      {isFilterSheetOpen && (
        <div className="filter-sheet-backdrop" onClick={() => setIsFilterSheetOpen(false)}>
          <div className="filter-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="filter-sheet-handle" />
            <h3 className="filter-sheet-title">Filters</h3>

            <p className="filter-sheet-label">Food type</p>
            <div className="filter-toggle-row">
              <button
                className={`filter-toggle-btn ${vegToggle === "nonveg" ? "active-nonveg" : ""}`}
                onClick={() => handleVegToggle("nonveg")}
              >
                <Leaf size={14} /> Veg
              </button>
              <button
                className={`filter-toggle-btn ${vegToggle === "veg" ? "active-veg" : ""}`}
                onClick={() => handleVegToggle("veg")}
              >
                <Flame size={14} /> Non-Veg
              </button>
            </div>

            <div className="filter-sheet-actions">
              <button
                className="btn-clear"
                onClick={() => {
                  setVegToggle("all");
                  setSelectedCategory("all");
                }}
              >
                Clear all
              </button>
              <button className="btn-apply" onClick={() => setIsFilterSheetOpen(false)}>
                Show results
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer onCartClick={() => navigate(getPathWithTable("/cart"))} onHomeClick={() => navigate(getPathWithTable("/menu"))} onProfileClick={() => navigate(getPathWithTable("/profile"))} />
    </div>
  );
}

export default Menu;