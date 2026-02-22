import React from "react";
import { useLocation } from "react-router-dom";
import { AiOutlineHome, AiOutlineShoppingCart, AiOutlineUser } from "react-icons/ai";
import { useTableNumber } from "../hooks/useTableNumber";
import './Footer.css';

function Footer({ onCartClick, onHomeClick, onProfileClick }) {
  const location = useLocation();
  const { getPathWithTable } = useTableNumber();

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
        <AiOutlineShoppingCart className="footer-icon" />
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