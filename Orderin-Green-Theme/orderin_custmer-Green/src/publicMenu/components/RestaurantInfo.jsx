import React from "react";
import { Clock, MapPin, Phone, Mail } from "lucide-react";

// "No static data" rule: this page is entirely optional. If the restaurant
// doc has none of these fields set, hasRestaurantInfoContent() returns
// false and PublicMenu.jsx simply leaves this page out of the book — no
// fabricated placeholder copy is ever shown.
export const hasRestaurantInfoContent = (restaurant) =>
  Boolean(restaurant?.description || restaurant?.hours || restaurant?.address || restaurant?.phone || restaurant?.email);

function RestaurantInfo({ restaurant }) {
  if (!hasRestaurantInfoContent(restaurant)) return null;

  return (
    <div className="pm-page pm-info-page">
      <h2 className="pm-page-title">About {restaurant.name || "Us"}</h2>
      {restaurant.description && <p className="pm-info-description">{restaurant.description}</p>}

      <div className="pm-info-meta">
        {restaurant.hours && (
          <div className="pm-info-row">
            <Clock size={16} aria-hidden="true" />
            <span>{restaurant.hours}</span>
          </div>
        )}
        {restaurant.address && (
          <div className="pm-info-row">
            <MapPin size={16} aria-hidden="true" />
            <span>{restaurant.address}</span>
          </div>
        )}
        {restaurant.phone && (
          <div className="pm-info-row">
            <Phone size={16} aria-hidden="true" />
            <span>{restaurant.phone}</span>
          </div>
        )}
        {restaurant.email && (
          <div className="pm-info-row">
            <Mail size={16} aria-hidden="true" />
            <span>{restaurant.email}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default RestaurantInfo;
