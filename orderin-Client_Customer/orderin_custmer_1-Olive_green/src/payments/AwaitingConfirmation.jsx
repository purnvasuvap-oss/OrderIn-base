import React from "react";
import { Clock, CheckCircle, XCircle, ChevronLeft, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTableNumber } from "../hooks/useTableNumber";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useCart } from "../context/CartContext";
import { safeDeleteUnpaidOrders } from "../utils/orderCleanupUtils";
import "./AwaitingConfirmation.css";

function AwaitingConfirmation() {
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();
  const { clearCart, clearOrderTempState } = useCart();
  const [status, setStatus] = useState("waiting");
  const [orderData, setOrderData] = useState(null);
  const [waitTime, setWaitTime] = useState(0);
  const [showRejectedPopup, setShowRejectedPopup] = useState(false);

  const pendingOrderId =
    sessionStorage.getItem("pendingOrderId") ||
    localStorage.getItem("orderin_awaiting_orderId") ||
    localStorage.getItem("orderin_countercode_orderId") ||
    null;

  const handleBackToMenu = async () => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (user && user.phone && pendingOrderId) {
        await safeDeleteUnpaidOrders(user.phone, pendingOrderId);
      }
    } catch (err) {
      console.error("Error cleaning up on back:", err);
    }
    clearCart();
    clearOrderTempState();
    navigate(getPathWithTable("/menu"));
  };
  const handleViewCart = async () => {
  try {
    const user = JSON.parse(localStorage.getItem("user"));

    if (user?.phone && pendingOrderId) {
      await safeDeleteUnpaidOrders(user.phone, pendingOrderId);
    }
  } catch (err) {
    console.error(err);
  }

  clearOrderTempState();

  navigate(getPathWithTable("/cart"));
};
  // Fix #15: Show loading state while snapshot is being set up
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (!pendingOrderId) {
      navigate(getPathWithTable("/menu"));
      return;
    }

    const timer = setInterval(() => {
      setWaitTime((prev) => prev + 1);
    }, 1000);

    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || !user.phone) return;

    const customerRef = doc(db, "Restaurant", "orderin_restaurant_3", "customers", user.phone);

    const unsubscribe = onSnapshot(customerRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
      const currentOrder = pastOrders.find((o) => String(o.id || "") === String(pendingOrderId));
      if (!currentOrder) return;
      setOrderData(currentOrder);
      const orderStatus = String(currentOrder.status || "Pending").toLowerCase();
      if (orderStatus === "confirmed") {
        setStatus("confirmed");
        clearInterval(timer);
        
        // Store the confirmed order data for the Payments page
        sessionStorage.setItem("confirmedOrderId", currentOrder.id || pendingOrderId);
        sessionStorage.setItem("confirmedOrderData", JSON.stringify(currentOrder));
        localStorage.setItem("orderin_confirmed_orderid", currentOrder.id || pendingOrderId);
        localStorage.setItem("orderin_confirmed_orderdata", JSON.stringify(currentOrder));
        
        setTimeout(() => {
          // Navigate to Payments page for payment method selection
          navigate(getPathWithTable("/payments"));
        }, 2000);
      } else if (orderStatus === "rejected" || orderStatus === "cancelled") {
        setStatus("rejected");
        clearInterval(timer);
        setShowRejectedPopup(true);
      }
    });

    return () => {
      clearInterval(timer);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [pendingOrderId]);

  const minutes = Math.floor(waitTime / 60);
  const seconds = waitTime % 60;
  const displayTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className="awaiting-confirmation-container">
      <div className="awaiting-confirmation-card">
        <div className="awaiting-header">
          <button className="awaiting-back-btn" onClick={handleBackToMenu}><ChevronLeft size={22} /></button>
          <h1>Order Confirmation</h1>
        </div>

        {status === "waiting" && (
          <div className="awaiting-status awaiting-waiting">
            <div className="awaiting-spinner"><Clock size={48} color="#f59e0b" /></div>
            <h2>Awaiting Confirmation</h2>
            <p className="awaiting-description">Please wait while the restaurant reviews your order.</p>
            <div className="awaiting-timer"><Clock size={18} /><span>Waiting for <strong>{displayTime}</strong></span></div>
            {orderData && (
              <div className="awaiting-order-details">
                <p><strong>Order:</strong> #{pendingOrderId}</p>
                <p><strong>Items:</strong> {orderData.items?.length || 0} items</p>
                <p><strong>Total:</strong> ₹{Number(orderData.total || orderData.totalCost || 0).toFixed(2)}</p>
              </div>
            )}
            <div className="awaiting-progress-bar">
              <div className="awaiting-progress-fill" style={{ width: `${Math.min(100, (waitTime / 60) * 20)}%` }} />
            </div>
          </div>
        )}

        {status === "confirmed" && (
          <div className="awaiting-status awaiting-confirmed">
            <div className="awaiting-icon-check"><CheckCircle size={48} color="#16a34a" /></div>
            <h2>Order Confirmed! 🎉</h2>
            <p className="awaiting-description">The restaurant has accepted your order. Redirecting you to select a payment method...</p>
            <div className="awaiting-redirecting">
              <div className="awaiting-dot-pulse"><span></span><span></span><span></span></div>
            </div>
          </div>
        )}
      </div>

      {showRejectedPopup && (
        <div className="awaiting-modal-overlay">
          <div className="awaiting-modal">
            <div className="awaiting-modal-icon rejected"><XCircle size={48} color="#dc2626" /></div>
            <h2>Order Not Available</h2>
            <p className="awaiting-modal-desc">Unfortunately, the restaurant is unable to fulfill your order at this time.</p>
            <div className="awaiting-modal-order-info">
              <p><strong>Order #{pendingOrderId}</strong></p>
              {orderData && <p>Total: ₹{Number(orderData.total || orderData.totalCost || 0).toFixed(2)}</p>}
            </div>
            <p className="awaiting-modal-suggestion">Please try ordering different items or visit again later.</p>
            <button className="awaiting-modal-btn" onClick={handleBackToMenu}><ShoppingBag size={18} /> Continue Shopping</button>
            <button className="awaiting-modal-btn-secondary" onClick={handleViewCart}>View Cart</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AwaitingConfirmation;
