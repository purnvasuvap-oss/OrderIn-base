import React from "react";
import { getPlaceholder } from "../../utils/placeholder";

// Page 1 — always shown (unlike the other shell pages, a cover page is
// never skipped: it just falls back to a plain title if logo/banner fields
// aren't set on the restaurant doc yet).
function RestaurantCover({ restaurant, tableNumber }) {
  const bannerStyle = restaurant?.bannerUrl
    ? { backgroundImage: `url(${restaurant.bannerUrl})` }
    : undefined;

  return (
    <div className="pm-page pm-cover-page" style={bannerStyle}>
      <div className="pm-cover-overlay" aria-hidden="true" />
      <div className="pm-cover-content">
        {restaurant?.logoUrl && (
          <img
            src={restaurant.logoUrl}
            alt={`${restaurant.name || "Restaurant"} logo`}
            className="pm-cover-logo"
            loading="lazy"
          />
        )}
        <h1 className="pm-cover-title">{restaurant?.name || "Welcome"}</h1>
        <p className="pm-cover-subtitle">Digital Menu</p>
        {tableNumber && <span className="pm-cover-table">Table {tableNumber}</span>}
        <p className="pm-cover-hint" aria-hidden="true">Flip to explore →</p>
        {/* Placeholder only until the restaurant doc has a real logoUrl. */}
        {!restaurant?.logoUrl && (
          <img
            src="https://static.vecteezy.com/system/resources/previews/052/792/818/non_2x/restaurant-logo-design-vector.jpg"
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pm-cover-placeholder-pic"
            // Hotlinked external image — hide it instead of showing a broken icon.
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
      </div>
    </div>
  );
}

export default RestaurantCover;
