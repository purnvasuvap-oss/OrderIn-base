import React from "react";
import { getPlaceholder } from "../../utils/placeholder";

// Shows every active (non-expired) promotion from the existing `promotions`
// collection as a grid — unlike the authenticated Menu page, which only
// rotates a single random banner, a dedicated book page can show them all.
export const hasOfferContent = (promotions) => Array.isArray(promotions) && promotions.length > 0;

function OfferPage({ promotions }) {
  if (!hasOfferContent(promotions)) return null;

  return (
    <div className="pm-page pm-offer-page">
      <h2 className="pm-page-title">Special Offers</h2>
      <div className="pm-offer-list">
        {promotions.map((promo) => {
          const img = promo.imageURL || promo.image || promo.imageUrl || promo.image_url || "";
          return (
            <div className="pm-offer-card" key={promo.id}>
              <img
                loading="lazy"
                src={img || getPlaceholder("Offer")}
                alt={promo.caption || "Special offer"}
                className="pm-offer-img"
                onError={(e) => {
                  e.target.src = getPlaceholder("Offer");
                }}
              />
              <div className="pm-offer-body">
                {promo.caption && <h3 className="pm-offer-caption">{promo.caption}</h3>}
                {promo.description && <p className="pm-offer-desc">{promo.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OfferPage;
