import React from "react";
import { useLocation } from "react-router-dom";
import { AiOutlineHome, AiOutlineShoppingCart, AiOutlineUser } from "react-icons/ai";
import { useCart } from "../context/CartContext";
import './Footer.css';

function Footer({ onCartClick, onHomeClick, onProfileClick }) {
  const location = useLocation();
  const { cartItems } = useCart();
  const cartCount = cartItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const cartCountLabel = cartCount > 99 ? "99+" : String(cartCount);

  return (
    <div className="footer-bar">
      <div
      className={`icon-container ${location.pathname === '/menu' ? 'active' : ''}`}
        onClick={onHomeClick}
      >
        <AiOutlineHome className="footer-icon" />
        <span>Home</span>
      </div>
      <div
        className={`icon-container ${location.pathname === '/cart' ? 'active' : ''}`}
        onClick={onCartClick}
      >
        <span className="footer-icon-wrap">
          <AiOutlineShoppingCart className="footer-icon" />
          {cartCount > 0 && <span className="cart-count-badge">{cartCountLabel}</span>}
        </span>
        <span>Cart</span>
      </div>
      <div
        className={`icon-container ${location.pathname === '/profile' ? 'active' : ''}`}
        onClick={onProfileClick}
      >
        <AiOutlineUser className="footer-icon" />
        <span>Profile</span>
      </div>
    </div>
  );
}

export default Footer;
