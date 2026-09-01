// Centralized restaurant-id resolution.
//
// The rest of the app still hardcodes "orderin_restaurant_4" directly at
// ~15 call sites (Cart.jsx, CartContext.jsx, Menu.jsx, Bill.jsx, firebaseConfig.js,
// etc. — verified via grep of this app's current source) — this file is NOT a
// refactor of those; it's a single new source of truth used only by the
// pre-login public menu code, so a future multi-restaurant rollout has one
// place to start from instead of another hardcoded literal.
export const DEFAULT_RESTAURANT_ID = "orderin_restaurant_4";

// Reads an optional ?restaurantId= query param (mirrors the existing ?table=
// pattern in src/hooks/useTableNumber.js), falling back to the single
// hardcoded restaurant this app currently serves.
export const resolveRestaurantId = (searchParams) => {
  const fromQuery = searchParams?.get?.("restaurantId");
  return fromQuery || DEFAULT_RESTAURANT_ID;
};
