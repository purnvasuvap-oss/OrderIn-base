import React, { useState, useEffect, useRef } from "react";
import { useCart } from "../context/CartContext";
import { useNavigate } from 'react-router-dom';
import { useTableNumber } from '../hooks/useTableNumber';
import { LogOut } from 'lucide-react';
import './header.css';

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const sideMenuRef = useRef(null);
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
      if (sideMenuRef.current && !sideMenuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
     <>
       <div className="header-bar">
         <img src="/OrderIn.png" alt="OrderIn" className="orderin-logo-header" />
         <div className="table-number">Table {currentTableNo}</div>
         <svg className="menu-icon" onClick={toggleMenu} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
           <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
         </svg>
       </div>
       <div ref={sideMenuRef} className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
          <div className="side-menu-content">
           <div className="menu-item" onClick={() => { navigate(getPathWithTable('/about-orderin')); setIsMenuOpen(false); }}>About OrderIn</div>
           <div className="menu-item" onClick={() => { navigate(getPathWithTable('/about')); setIsMenuOpen(false); }}>About Restaurant</div>
           <div className="menu-item" onClick={() => { navigate(getPathWithTable('/help')); setIsMenuOpen(false); }}>Help</div>
           <div className="menu-item logout-item" onClick={handleLogout}>
             <LogOut size={18} /> Logout
           </div>
         </div>
       </div>
     </>
  );
}

export default Header;
