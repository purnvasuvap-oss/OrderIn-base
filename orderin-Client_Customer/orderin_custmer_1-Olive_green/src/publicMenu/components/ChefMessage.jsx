import React from "react";

// Same graceful-skip pattern as RestaurantInfo — no fabricated chef quote.
export const hasChefMessageContent = (restaurant) =>
  Boolean(restaurant?.chefMessage || restaurant?.chefName);

function ChefMessage({ restaurant }) {
  if (!hasChefMessageContent(restaurant)) return null;

  return (
    <div className="pm-page pm-chef-page">
      {restaurant.chefImage && (
        <img
          src={restaurant.chefImage}
          alt={restaurant.chefName || "Chef"}
          className="pm-chef-photo"
          loading="lazy"
        />
      )}
      <p className="pm-chef-eyebrow">A Note From Our Chef</p>
      {restaurant.chefName && <h2 className="pm-page-title">{restaurant.chefName}</h2>}
      {restaurant.chefMessage && <p className="pm-chef-message">&ldquo;{restaurant.chefMessage}&rdquo;</p>}
    </div>
  );
}

export default ChefMessage;
