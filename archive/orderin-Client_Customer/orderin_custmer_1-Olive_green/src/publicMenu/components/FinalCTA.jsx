import React from "react";
import { ShoppingBag } from "lucide-react";

// Presentation only — the actual "am I logged in, should this open the
// login modal or go straight to /menu" decision lives in PublicMenu.jsx
// (Step 7), passed in as onOrderNow so this component doesn't need to know
// about auth/localStorage at all.
function FinalCTA({ restaurantName, onOrderNow }) {
  return (
    <div className="pm-page pm-final-page">
      <h2 className="pm-page-title">Ready to Order?</h2>
      <p className="pm-final-copy">
        Your table is set. Let's bring you the best of {restaurantName || "our kitchen"}.
      </p>
      <button type="button" className="pm-order-now-btn" onClick={onOrderNow}>
        <ShoppingBag size={20} aria-hidden="true" />
        Order Now
      </button>
    </div>
  );
}

export default FinalCTA;
