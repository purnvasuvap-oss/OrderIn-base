// Centralized restaurant-id resolution.
//
// The rest of the app still hardcodes "orderin_restaurant_3" directly at
// ~14 call sites (Cart.jsx, CartContext.jsx, Menu.jsx, Bill.jsx, etc.) —
// this file is NOT a refactor of those; it's a single new source of truth
// used only by the pre-login public menu code, so a future multi-restaurant
// rollout has one place to start from instead of another hardcoded literal.
export const DEFAULT_RESTAURANT_ID = "orderin_restaurant_3";

// Reads an optional ?restaurantId= query param (mirrors the existing ?table=
// pattern in src/hooks/useTableNumber.js), falling back to the single
// hardcoded restaurant this app currently serves.
export const resolveRestaurantId = (searchParams) => {
  const fromQuery = searchParams?.get?.("restaurantId");
  return fromQuery || DEFAULT_RESTAURANT_ID;
};
