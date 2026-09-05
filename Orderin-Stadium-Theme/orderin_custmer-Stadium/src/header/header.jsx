import React, { useState, useEffect, useRef } from "react";
import { useCart } from "../context/CartContext";
import { useNavigate } from 'react-router-dom';
import { useTableNumber } from '../hooks/useTableNumber';
import { LogOut } from 'lucide-react';
import './header.css';

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const sideMenuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const { currentTableNo } = useCart();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  const handleLogout = () => {
    // Clear user data from localStorage
    localStorage.removeItem('user');
    localStorage.removeItem('tableNo');
    
    // Clear cart if needed
    sessionStorage.clear();
    
    // Disable back navigation by clearing history
    window.history.pushState(null, null, window.location.href);
    
    // Add popstate listener to prevent browser back
    const handlePopState = (e) => {
      window.history.pushState(null, null, window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    
    // Close menu and navigate to login
    setIsMenuOpen(false);
    navigate('/login');
  };

useEffect(() => {
  const handleClickOutside = (event) => {
    // `wrapperRef` was never attached to any element (always null), so this
    // check was permanently false and the menu never closed on an outside
    // click. `sideMenuRef` is the ref actually attached to the menu panel.
    if (
      sideMenuRef.current &&
      !sideMenuRef.current.contains(event.target)
    ) {
      setIsMenuOpen(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, []);

  // Keyboard support for the div-based menu icon/items below: Enter and
  // Space both count as "activate", matching native button behaviour.
  const onActivateKey = (handler) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
  const goAboutOrderIn = () => { navigate(getPathWithTable('/about-orderin')); setIsMenuOpen(false); };
  const goAboutRestaurant = () => { navigate(getPathWithTable('/about')); setIsMenuOpen(false); };
  const goHelp = () => { navigate(getPathWithTable('/help')); setIsMenuOpen(false); };

  return (
     <>
       <div className="header-bar">
         <img src="/OrderIn.png" alt="OrderIn" className="orderin-logo-header" />
         <div className="table-number">Table {currentTableNo}</div>
         <svg
           className="menu-icon"
           ref={menuButtonRef}
           onClick={() => setIsMenuOpen(prev => !prev)}
           role="button"
           tabIndex={0}
           aria-label="Open menu"
           aria-haspopup="true"
           aria-expanded={isMenuOpen}
           onKeyDown={onActivateKey(() => setIsMenuOpen(prev => !prev))}
           width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
           <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
         </svg>
       </div>
       <div ref={sideMenuRef} className={`side-menu ${isMenuOpen ? 'open' : ''}`} role="menu">
          <div className="side-menu-content">
           <div className="menu-item" role="menuitem" tabIndex={0} onClick={goAboutOrderIn} onKeyDown={onActivateKey(goAboutOrderIn)}>About OrderIn</div>
           <div className="menu-item" role="menuitem" tabIndex={0} onClick={goAboutRestaurant} onKeyDown={onActivateKey(goAboutRestaurant)}>About Restaurant</div>
           <div className="menu-item" role="menuitem" tabIndex={0} onClick={goHelp} onKeyDown={onActivateKey(goHelp)}>Help</div>
           <div className="menu-item logout-item" role="menuitem" tabIndex={0} onClick={handleLogout} onKeyDown={onActivateKey(handleLogout)}>
             <LogOut size={18} /> Logout
           </div>
         </div>
       </div>
     </>
  );
}

export default Header;
