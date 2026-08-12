import React from 'react';
import './AcceptingOrdersModal.css';

/**
 * Global "restaurant not serving" popup — shown across the whole app
 * (not just the login page) whenever Restaurant/{id}.acceptingOrders is
 * false, so an already-logged-in customer browsing the menu/cart/etc. is
 * told immediately rather than only discovering it if they try to check out.
 */
function AcceptingOrdersModal({ onClose }) {
  return (
    <div className="ao-modal-overlay">
      <div className="ao-modal">
        <div className="ao-modal-icon">🚫</div>
        <h2>Restaurant Is Not Serving Right Now</h2>
        <p className="ao-modal-desc">
          This restaurant isn't accepting new orders at the moment. You can still
          browse the menu, but please try placing your order again later.
        </p>
        <button className="ao-modal-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

export default AcceptingOrdersModal;
