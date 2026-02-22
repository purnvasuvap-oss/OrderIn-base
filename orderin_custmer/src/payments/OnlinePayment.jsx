import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTableNumber } from "../hooks/useTableNumber";
import { useCart } from "../context/CartContext";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { X } from "lucide-react";
import "./OnlinePayment.css";

function OnlinePayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getPathWithTable } = useTableNumber();
  const { markPaymentSuccessful } = useCart();
  const [orderId, setOrderId] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [debugMode, setDebugMode] = useState(true);
  const [iframeUrl, setIframeUrl] = useState('https://orderin-admin.web.app/pay');

  useEffect(() => {
    // This useEffect ONLY handles initialization
    const sessionOrderId = sessionStorage.getItem('pendingOrderId');
    const localOrderId = localStorage.getItem('orderin_onlinepayment_orderId');
    const sessionPaymentData = sessionStorage.getItem('paymentData');
    const localPaymentData = localStorage.getItem('orderin_paymentData');
    
    if (debugMode) {
      console.log('=== OnlinePayment Component Mounted ===');
      console.log('Location:', location.pathname, location.search);
      console.log('sessionStorage pendingOrderId:', sessionOrderId);
      console.log('localStorage orderin_onlinepayment_orderId:', localOrderId);
      console.log('sessionStorage paymentData:', sessionPaymentData);
      console.log('localStorage orderin_paymentData:', localPaymentData);
    }
    
    const foundOrderId = sessionOrderId || localOrderId;
    const foundPaymentData = sessionPaymentData 
      ? JSON.parse(sessionPaymentData) 
      : (localPaymentData ? JSON.parse(localPaymentData) : null);
    
    if (!foundOrderId) {
      console.error('ERROR: No order ID found in storage!');
      setIsLoading(false);
      return;
    }
    
    if (debugMode) {
      console.log('Found order ID:', foundOrderId);
      console.log('Found payment data:', foundPaymentData);
    }
    
    setOrderId(foundOrderId);
    setPaymentData(foundPaymentData);
    
    // Build URL with query parameters if payment data exists
    if (foundPaymentData) {
      const params = new URLSearchParams();
      params.append('orderId', foundPaymentData.orderId || '');
      params.append('subtotal', foundPaymentData.subtotal || '0');
      params.append('taxes', foundPaymentData.taxes || '0');
      params.append('total', foundPaymentData.total || '0');
      params.append('taxRate', foundPaymentData.taxRate || '0.04'); // 0.04 rupees per rupee
      params.append('useProvidedTax', foundPaymentData.useProvidedTax ? 'true' : 'false'); // Don't recalculate tax
      params.append('restaurantId', foundPaymentData.restaurantId || '');
      params.append('restaurantName', foundPaymentData.restaurantName || '');
      params.append('ifscCode', foundPaymentData.ifscCode || '');
      params.append('accountNumber', foundPaymentData.accountNumber || '');
      params.append('customerPhone', foundPaymentData.customerPhone || '');
      
      const urlWithParams = `https://orderin-admin.web.app/pay?${params.toString()}`;
      console.log('iframe URL with params:', urlWithParams);
      console.log('Sending to embedded page - Taxes:', foundPaymentData.taxes);
      setIframeUrl(urlWithParams);
    }
    
    setIsLoading(false);
  }, []); // Empty dependency array - run only once on mount

  // Separate effect for message handling
  useEffect(() => {
    if (!orderId) return;

    const handleMessage = async (event) => {
      console.log('[OnlinePayment] Message from origin:', event.origin);
      
      // Handle payment method selection (UPI/CARD/NET BANKING/WALLET)
      if (event.data && event.data.type === "PAYMENT_METHOD_SELECTED") {
        const paymentMethod = event.data.paymentMethod;
        console.log('[OnlinePayment] Payment method selected:', paymentMethod);
        
        // Update Firestore order with the selected payment method
        try {
          const user = JSON.parse(localStorage.getItem('user'));
          if (user && user.phone) {
            const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", user.phone);
            const customerSnap = await getDoc(customerRef);
            
            if (customerSnap.exists()) {
              const data = customerSnap.data();
              const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
              
              // Find and update the order with matching ID
              const updatedOrders = pastOrders.map(ord => 
                ord.id === orderId 
                  ? { ...ord, OnlinePayMethod: paymentMethod }
                  : ord
              );
              
              await setDoc(customerRef, { pastOrders: updatedOrders }, { merge: true });
              console.log('[OnlinePayment] Order updated with OnlinePayMethod:', paymentMethod);
            }
          }
        } catch (err) {
          console.error('[OnlinePayment] Error updating payment method:', err);
        }
      }
      
      // Handle payment success
      if (event.data && event.data.type === "PAYMENT_SUCCESS") {
        console.log("[OnlinePayment] Payment success received");
        markPaymentSuccessful(orderId);
        sessionStorage.removeItem('pendingOrderId');
        localStorage.removeItem('orderin_onlinepayment_orderId');
        sessionStorage.removeItem('paymentData');
        localStorage.removeItem('orderin_paymentData');
        setTimeout(() => navigate(getPathWithTable("/payment-success")), 300);
      }
      // Handle payment cancellation
      else if (event.data && event.data.type === "PAYMENT_CANCELLED") {
        console.log("[OnlinePayment] Payment cancelled");
        sessionStorage.removeItem('pendingOrderId');
        localStorage.removeItem('orderin_onlinepayment_orderId');
        sessionStorage.removeItem('paymentData');
        localStorage.removeItem('orderin_paymentData');
        setTimeout(() => navigate(getPathWithTable("/payments")), 300);
      }
      // Handle payment error
      else if (event.data && event.data.type === "PAYMENT_ERROR") {
        console.error("[OnlinePayment] Payment error:", event.data.message);
        sessionStorage.removeItem('pendingOrderId');
        localStorage.removeItem('orderin_onlinepayment_orderId');
        sessionStorage.removeItem('paymentData');
        localStorage.removeItem('orderin_paymentData');
        setTimeout(() => navigate(getPathWithTable("/payments")), 300);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [orderId, navigate, getPathWithTable, markPaymentSuccessful]);

  const handleBackClick = () => {
    console.log('[OnlinePayment] Back button clicked');
    sessionStorage.removeItem('pendingOrderId');
    localStorage.removeItem('orderin_onlinepayment_orderId');
    sessionStorage.removeItem('paymentData');
    localStorage.removeItem('orderin_paymentData');
    navigate(getPathWithTable("/payments"));
  };

  // Show error if no order ID
  if (!isLoading && !orderId) {
    return (
      <div className="online-payment-container">
        <div style={{
          backgroundColor: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: "8px",
          padding: "20px",
          maxWidth: "400px",
          textAlign: "center"
        }}>
          <h2>Error</h2>
          <p>No order ID found. Cannot load payment gateway.</p>
          <button 
            onClick={handleBackClick}
            style={{
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Go Back to Payments
          </button>
          {debugMode && (
            <div style={{ 
              marginTop: "20px", 
              textAlign: "left",
              fontSize: "12px",
              fontFamily: "monospace",
              backgroundColor: "#f8f9fa",
              padding: "10px",
              borderRadius: "4px"
            }}>
              <p><strong>Debug Info:</strong></p>
              <p>Location: {location.pathname}{location.search}</p>
              <p>Session pendingOrderId: {sessionStorage.getItem('pendingOrderId') || 'NOT FOUND'}</p>
              <p>Local orderin_onlinepayment_orderId: {localStorage.getItem('orderin_onlinepayment_orderId') || 'NOT FOUND'}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="online-payment-container">
        <div className="payment-loading">Loading payment gateway...</div>
      </div>
    );
  }

  return (
    <div className="online-payment-container">
      <button className="payment-back-button" onClick={handleBackClick} title="Go back to payments">
        <X size={24} />
      </button>
      <div style={{ position: "absolute", top: "20px", right: "20px", fontSize: "12px", color: "#666", zIndex: 999 }}>
        Order: {orderId}
        {paymentData && <div>Total: ₹{paymentData.total}</div>}
      </div>
      <iframe
        src={iframeUrl}
        title="Online Payment Gateway"
        className="payment-iframe"
        allow="payment"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
      />
    </div>
  );
}

export default OnlinePayment;
