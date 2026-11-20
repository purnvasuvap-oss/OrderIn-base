import React from "react";
import { ShoppingBag, ChevronRight } from "lucide-react";
import { useCart } from "../context/CartContext";

/**
 * Floating "View cart" bar (Maroon modern UI). Shows how many items are in
 * the cart and the running total, just above the bottom dock. Hidden when
 * the cart is empty. Copes with no CartProvider (e.g. isolated tests).
 */
function CartBar({ onOpen }) {
  const cart = useCart() || {};
  const items = Array.isArray(cart.cartItems) ? cart.cartItems : [];
  const count = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  if (count <= 0) return null;
  const total = typeof cart.getTotalPrice === "function" ? cart.getTotalPrice() : null;

  return (
    <button type="button" className="mx-cart-bar" onClick={onOpen} aria-label={`View cart, ${count} item${count > 1 ? "s" : ""}`}>
      <span className="mx-cart-bar-icon" aria-hidden="true">
        <ShoppingBag size={18} />
      </span>
      <span className="mx-cart-bar-text">
        <strong>
          {count} item{count > 1 ? "s" : ""}
        </strong>
        {total !== null && <span>₹{total}</span>}
      </span>
      <span className="mx-cart-bar-cta">
        View cart <ChevronRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}

export default CartBar;
