import React from "react";
import { Flame } from "lucide-react";
import { getPlaceholder } from "../../utils/placeholder";
import {
  getDietType,
  isBestseller,
  getSpiceLevel,
  isItemUnavailable,
  isOnPromotion,
  parsePrice,
} from "../../utils/menuItemHelpers";

// Reuses the exact same field-interpretation helpers as the authenticated
// Menu page (src/menu/Menu.jsx) via src/utils/menuItemHelpers.js, so a dish
// never looks different pre- vs post-login.
function MenuCard({ item, onSelect, onAdd }) {
  const unavailable = isItemUnavailable(item);
  const diet = getDietType(item);
  const bestseller = isBestseller(item);
  const spiceLevel = getSpiceLevel(item);
  const { value, symbol } = parsePrice(item.price);
  const onPromo = isOnPromotion(item);
  const increased = (value * 1.25).toFixed(2);

  const handleSelect = () => {
    if (!unavailable) onSelect(item);
  };

  return (
    <div
      className={`pm-menu-card ${unavailable ? "pm-unavailable" : ""}`}
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !unavailable) {
          e.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="pm-menu-card-media">
        <img
          loading="lazy"
          src={item.image || item.imageURL || item.image_url || getPlaceholder("No Image")}
          alt={item.name}
          className="pm-menu-card-img"
          onError={(e) => {
            e.target.src = getPlaceholder("No Image");
          }}
        />
        {diet && (
          <span className={`pm-diet-dot pm-diet-${diet}`} aria-label={diet === "veg" ? "Vegetarian" : "Non-vegetarian"} />
        )}
        {bestseller && (
          <span className="pm-badge-bestseller">
            <Flame size={10} aria-hidden="true" /> Bestseller
          </span>
        )}
        {unavailable && <span className="pm-badge-unavailable">Unavailable</span>}
      </div>

      <div className="pm-menu-card-body">
        <h3 className="pm-menu-card-title">{item.name}</h3>
        {item.description && <p className="pm-menu-card-desc">{item.description}</p>}

        <div className="pm-menu-card-footer">
          <div className="pm-menu-card-price">
            <span className="pm-price-current">
              {symbol}
              {value.toFixed(2)}
            </span>
            {onPromo && (
              <span className="pm-price-original">
                {symbol}
                {increased}
              </span>
            )}
          </div>

          {spiceLevel > 0 && (
            <span className="pm-spice-flames" aria-label={`Spice level ${spiceLevel} of 3`}>
              {Array.from({ length: spiceLevel }).map((_, i) => (
                <Flame key={i} size={10} aria-hidden="true" />
              ))}
            </span>
          )}

          <button
            type="button"
            className="pm-add-btn"
            disabled={unavailable}
            aria-label={`Add ${item.name} to cart`}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(item);
            }}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(MenuCard);
