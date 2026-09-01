import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { fetchMenuItems, fetchPromotions } from "../utils/fetchRestaurantMenu";
import { isBestseller, isOnPromotion, groupItemsByCategory } from "../utils/menuItemHelpers";
import { menuStore } from "../menu/menuStore";

// Fetches everything the pre-login flipbook needs (restaurant profile, menu
// items, promotions) and derives the book's dynamic pages (categories,
// popular items, today's special) from that data — no hardcoded content.
//
// Also warms the same shared menuStore / window.__menu_products__ / the
// "menu:loaded" event that the authenticated Menu.jsx page populates, so if
// the customer adds items to their cart here and later logs in, CartContext
// can already resolve canonical prices/images instead of showing
// placeholders until Menu.jsx re-fetches.
export const usePublicMenuData = (restaurantId) => {
  const [state, setState] = useState({
    loading: true,
    error: null,
    restaurant: null,
    menuItems: [],
    promotions: [],
  });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!restaurantId) return;
    let alive = true;

    (async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [restaurantSnap, menuItems, promotions] = await Promise.all([
          getDoc(doc(db, "Restaurant", restaurantId)),
          fetchMenuItems(restaurantId),
          fetchPromotions(restaurantId),
        ]);

        if (!alive) return;

        if (!restaurantSnap.exists()) {
          setState({ loading: false, error: "not-found", restaurant: null, menuItems: [], promotions: [] });
          return;
        }

        const restaurant = { id: restaurantId, ...restaurantSnap.data() };

        // Share the fetch with the rest of the app (see comment above).
        try {
          menuStore.set(menuItems);
          window.__menu_products__ = menuItems;
          window.dispatchEvent(new CustomEvent("menu:loaded", { detail: menuItems }));
        } catch (e) {
          /* ignore — non-critical sharing step */
        }

        setState({ loading: false, error: null, restaurant, menuItems, promotions });
      } catch (err) {
        console.warn("usePublicMenuData: fetch failed", err);
        if (alive) {
          setState({ loading: false, error: "fetch-failed", restaurant: null, menuItems: [], promotions: [] });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [restaurantId, reloadToken]);

  const categories = useMemo(() => groupItemsByCategory(state.menuItems), [state.menuItems]);
  const popularItems = useMemo(() => state.menuItems.filter(isBestseller), [state.menuItems]);
  const todaysSpecialItems = useMemo(() => state.menuItems.filter(isOnPromotion), [state.menuItems]);

  return {
    loading: state.loading,
    error: state.error,
    restaurant: state.restaurant,
    menuItems: state.menuItems,
    promotions: state.promotions,
    categories,
    popularItems,
    todaysSpecialItems,
    reload,
  };
};
