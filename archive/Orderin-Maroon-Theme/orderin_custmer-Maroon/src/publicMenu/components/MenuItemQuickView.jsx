import React, { useEffect } from "react";
import { X, Flame } from "lucide-react";
import { getPlaceholder } from "../../utils/placeholder";
import { getDietType, getSpiceLevel, isItemUnavailable, parsePrice } from "../../utils/menuItemHelpers";

// Public, tap-to-expand detail lightbox — deliberately NOT the protected
// /item/:slug route (ItemDetails.jsx), since that's behind ProtectedRoute
// and would force a login wall just to read a description. This is a
// read-only view (no customization editor) with a single "Add to Cart"
// affordance; full customization still happens post-login via the existing
// ItemDetails page.
function MenuItemQuickView({ item, onClose, onAdd }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!item) return null;

  const unavailable = isItemUnavailable(item);
  const diet = getDietType(item);
  const spiceLevel = getSpiceLevel(item);
  const { value, symbol } = parsePrice(item.price);

  return (
    <div className="pm-quickview-overlay" role="dialog" aria-modal="true" aria-label={item.name} onClick={onClose}>
      <div className="pm-quickview-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pm-quickview-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <img
          loading="lazy"
          src={item.image || item.imageURL || item.image_url || getPlaceholder("No Image")}
          alt={item.name}
          className="pm-quickview-img"
        />

        <div className="pm-quickview-body">
          {diet && <span className={`pm-diet-dot pm-diet-${diet}`} aria-hidden="true" />}
          <h2 className="pm-quickview-title">{item.name}</h2>
          {item.description && <p className="pm-quickview-desc">{item.description}</p>}

          <div className="pm-quickview-meta">
            <span className="pm-price-current">
              {symbol}
              {value.toFixed(2)}
            </span>
            {spiceLevel > 0 && (
              <span className="pm-spice-flames" aria-label={`Spice level ${spiceLevel} of 3`}>
                {Array.from({ length: spiceLevel }).map((_, i) => (
                  <Flame key={i} size={12} aria-hidden="true" />
                ))}
              </span>
            )}
          </div>

          {unavailable ? (
            <p className="pm-quickview-unavailable">Currently unavailable</p>
          ) : (
            <button type="button" className="pm-quickview-add-btn" onClick={() => onAdd(item)}>
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MenuItemQuickView;
