import React, { useEffect, useMemo, useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { resolveRestaurantId } from "../config/restaurant";
import { useTableNumber } from "../hooks/useTableNumber";
import { useCart } from "../context/CartContext";
import { usePublicMenuData } from "./usePublicMenuData";
import BookLayout, { BookPage } from "./BookLayout";
import RestaurantCover from "./components/RestaurantCover";
import RestaurantInfo, { hasRestaurantInfoContent } from "./components/RestaurantInfo";
import ChefMessage, { hasChefMessageContent } from "./components/ChefMessage";
import CategoryPage from "./components/CategoryPage";
import OfferPage, { hasOfferContent } from "./components/OfferPage";
import MenuItemQuickView from "./components/MenuItemQuickView";
import FinalCTA from "./components/FinalCTA";
import LoginRequiredModal from "./components/LoginRequiredModal";
import PageSkeleton from "./components/PageSkeleton";
import BookEmptyState from "./components/BookEmptyState";
import "./publicMenu.css";

// Cards per physical book page — keeps each category page readable on a
// phone screen; categories with more items simply get multiple book pages.
const CARDS_PER_PAGE = 4;

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// Public, pre-login digital flipbook menu — the new QR landing page (routing
// moved Login to /login, this is what "/" renders).
function PublicMenu({ setIsLoading }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tableNumber, getPathWithTable } = useTableNumber();
  const { addToCart } = useCart();
  const restaurantId = useMemo(() => resolveRestaurantId(searchParams), [searchParams]);
  const { loading, error, restaurant, categories, popularItems, todaysSpecialItems, promotions, reload } =
    usePublicMenuData(restaurantId);
  const [quickViewItem, setQuickViewItem] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    setIsLoading?.(loading);
  }, [loading, setIsLoading]);

  const isAuthenticated = () => Boolean(localStorage.getItem("user"));

  const handleAddToCart = useCallback(
    (item) => {
      if (!isAuthenticated()) {
        setShowLoginModal(true);
        return;
      }
      addToCart(item, 1, "", []);
      setQuickViewItem(null);
    },
    [addToCart]
  );

  const handleOrderNow = useCallback(() => {
    if (isAuthenticated()) {
      navigate(getPathWithTable("/menu"));
    } else {
      setShowLoginModal(true);
    }
  }, [navigate, getPathWithTable]);

  const handleModalLogin = useCallback(() => {
    setShowLoginModal(false);
    navigate(getPathWithTable("/login"));
  }, [navigate, getPathWithTable]);

  const handleContinueBrowsing = useCallback(() => setShowLoginModal(false), []);

  // Memoized so opening/closing the quick-view or login-required modals
  // (unrelated state changes in this same component) doesn't rebuild the
  // whole pages array and hand react-pageflip a new list every render.
  const pages = useMemo(() => {
    if (!restaurant) return [];

    const list = [
      <BookPage key="cover">
        <RestaurantCover restaurant={restaurant} tableNumber={tableNumber} />
      </BookPage>,
    ];

    if (hasRestaurantInfoContent(restaurant)) {
      list.push(
        <BookPage key="about">
          <RestaurantInfo restaurant={restaurant} />
        </BookPage>
      );
    }

    if (hasChefMessageContent(restaurant)) {
      list.push(
        <BookPage key="chef">
          <ChefMessage restaurant={restaurant} />
        </BookPage>
      );
    }

    categories.forEach(({ category, items }) => {
      chunk(items, CARDS_PER_PAGE).forEach((pageItems, chunkIdx) => {
        list.push(
          <BookPage key={`category-${category}-${chunkIdx}`}>
            <CategoryPage
              title={category}
              items={pageItems}
              onSelectItem={setQuickViewItem}
              onAddItem={handleAddToCart}
            />
          </BookPage>
        );
      });
    });

    if (hasOfferContent(promotions)) {
      list.push(
        <BookPage key="offers">
          <OfferPage promotions={promotions} />
        </BookPage>
      );
    }

    if (popularItems.length > 0) {
      chunk(popularItems, CARDS_PER_PAGE).forEach((pageItems, chunkIdx) => {
        list.push(
          <BookPage key={`popular-${chunkIdx}`}>
            <CategoryPage
              title="Popular Items"
              items={pageItems}
              onSelectItem={setQuickViewItem}
              onAddItem={handleAddToCart}
            />
          </BookPage>
        );
      });
    }

    if (todaysSpecialItems.length > 0) {
      chunk(todaysSpecialItems, CARDS_PER_PAGE).forEach((pageItems, chunkIdx) => {
        list.push(
          <BookPage key={`special-${chunkIdx}`}>
            <CategoryPage
              title="Today's Special"
              items={pageItems}
              onSelectItem={setQuickViewItem}
              onAddItem={handleAddToCart}
            />
          </BookPage>
        );
      });
    }

    list.push(
      <BookPage key="final-cta">
        <FinalCTA restaurantName={restaurant.name} onOrderNow={handleOrderNow} />
      </BookPage>
    );

    return list;
  }, [restaurant, tableNumber, categories, promotions, popularItems, todaysSpecialItems, handleAddToCart, handleOrderNow]);

  if (loading) {
    return (
      <div className="public-menu-root">
        <PageSkeleton />
      </div>
    );
  }

  if (error || !restaurant) {
    const message =
      error === "not-found"
        ? "We couldn't find this restaurant. Please check the QR code and try again."
        : "Something went wrong loading the menu.";
    return (
      <div className="public-menu-root">
        <BookEmptyState message={message} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="public-menu-root">
      <BookLayout pages={pages} />
      {quickViewItem && (
        <MenuItemQuickView
          item={quickViewItem}
          onClose={() => setQuickViewItem(null)}
          onAdd={handleAddToCart}
        />
      )}
      <LoginRequiredModal
        isOpen={showLoginModal}
        onLogin={handleModalLogin}
        onContinueBrowsing={handleContinueBrowsing}
      />
    </div>
  );
}

export default PublicMenu;
