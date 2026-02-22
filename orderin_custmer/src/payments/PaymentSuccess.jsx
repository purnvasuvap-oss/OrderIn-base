import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useTableNumber } from "../hooks/useTableNumber";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./PaymentSuccess.css";
import "../Bill.css";

function PaymentSuccess() {
  const navigate = useNavigate();
  const { orderHistory, clearOrderTempState } = useCart();
  const { getPathWithTable } = useTableNumber();
  const [displayOrderId, setDisplayOrderId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');


  // On mount, fetch the latest paid order from Firestore backend
  useEffect(() => {
    const fetchLatestOrderFromBackend = async () => {
      try {
        const user = JSON.parse(localStorage.getItem("user"));
        if (!user || !user.phone) {
          console.log('PaymentSuccess: User not logged in, using fallback');
          setIsLoading(false);
          return;
        }

        const phoneNumber = user.phone;
        const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", phoneNumber);
        const customerSnap = await getDoc(customerRef);

        if (customerSnap.exists()) {
          const data = customerSnap.data();
          const pastOrders = Array.isArray(data.pastOrders) ? data.pastOrders : [];
          
          // Find the most recent paid order
          const paidOrder = pastOrders
            .filter(o => o.paymentStatus === 'paid')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

          if (paidOrder) {
            console.log('PaymentSuccess: fetched paid order from backend:', paidOrder.id);
            // Display the order ID (now uses human-readable format ORD-DDMMYY<sequence>)
            setDisplayOrderId(paidOrder.id);
            setIsLoading(false);
            return;
          }
        }
        
        // Fallback to localStorage or orderHistory if backend fetch fails
        const savedOrderId = localStorage.getItem('orderin_countercode_orderId') || localStorage.getItem('orderin_orderId');
        const fallbackOrderId = orderHistory[orderHistory.length - 1]?.id;
        const orderIdToDisplay = savedOrderId || fallbackOrderId || 'N/A';
        console.log('PaymentSuccess: using fallback orderId=', orderIdToDisplay);
        setDisplayOrderId(orderIdToDisplay);
        setIsLoading(false);
      } catch (err) {
        console.error('PaymentSuccess: Error fetching order from backend:', err);
        // Fallback to localStorage or orderHistory
        const savedOrderId = localStorage.getItem('orderin_countercode_orderId') || localStorage.getItem('orderin_orderId');
        const fallbackOrderId = orderHistory[orderHistory.length - 1]?.id;
        const orderIdToDisplay = savedOrderId || fallbackOrderId || 'N/A';
        setDisplayOrderId(orderIdToDisplay);
        setIsLoading(false);
      }
    };

    fetchLatestOrderFromBackend();

    // Clear all temporary localStorage after displaying (give UI time to render)
    // Use setTimeout to ensure state is set before clearing
    const clearTimer = setTimeout(() => {
      clearOrderTempState();
      console.log('PaymentSuccess: cleared temp state from localStorage');
    }, 1000);

    return () => clearTimeout(clearTimer);
  }, [orderHistory, clearOrderTempState]);

  return (
    <div className="payment-success-container">
      <div className="success-card">
        <div className="success-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="#00a693"
            className="success-svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2>Payment Successful!</h2>
        <p className="order-id">Order ID : {displayOrderId}</p>

        <button className="view-bill-btn" onClick={() => navigate(getPathWithTable('/bill'))}>
          View Bill
        </button>

        <button className="back-home-btn" onClick={() => setShowFeedback(true)}>
          Back to Home
        </button>
      </div>
      {showFeedback && (
        <div className="feedback-modal">
          <div className="feedback-card">
            <h3>Rate Your Experience</h3>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  onClick={() => setRating(star)}
                  style={{ cursor: 'pointer', width: 32, height: 32, marginRight: 6 }}
                  viewBox="0 0 24 24"
                >
                  <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.4 8.168L12 18.896l-7.334 3.87 1.4-8.168L.132 9.21l8.2-1.192z" fill={rating >= star ? '#00a693' : 'none'} stroke="#00a693" />
                </svg>
              ))}
            </div>
            <textarea
              placeholder="Tell us what you think..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="submit-feedback-btn" onClick={async () => {
                setFeedbackError('');
                setSavingFeedback(true);
                let errorOccurred = false;
                try {
                  const user = JSON.parse(localStorage.getItem('user'));
                  console.log('PaymentSuccess submitFeedback: user from localStorage=', user);
                  if (!user || !user.phone) {
                    const msg = 'No logged-in user (missing phone). Please log in to save feedback.';
                    console.warn('PaymentSuccess submitFeedback:', msg);
                    setFeedbackError(msg);
                    errorOccurred = true;
                  } else {
                    const phone = user.phone;
                    const customerRef = doc(db, 'Restaurant', 'orderin_restaurant_1', 'customers', phone);
                    console.log('Attempting to save feedback to', customerRef.path);
                    const entry = { stars: rating, text: feedback || '', createdAt: new Date().toISOString() };

                    // Try to update existing doc with arrayUnion; if doc doesn't exist, create it
                    try {
                      const snap = await getDoc(customerRef);
                      if (snap.exists()) {
                        try {
                          await updateDoc(customerRef, { feedback: arrayUnion(entry), updatedAt: serverTimestamp() });
                          console.log('PaymentSuccess feedback updated for', phone, entry);
                        } catch (uErr) {
                          console.warn('updateDoc failed, falling back to setDoc merge', uErr);
                          await setDoc(customerRef, { feedback: arrayUnion(entry), updatedAt: serverTimestamp() }, { merge: true });
                          console.log('PaymentSuccess feedback saved with setDoc merge for', phone);
                        }
                      } else {
                        // Create customer doc with feedback
                        await setDoc(customerRef, { feedback: [entry], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
                        console.log('PaymentSuccess created customer doc and saved feedback for', phone);
                      }
                    } catch (dbErr) {
                      console.error('PaymentSuccess: Firestore write failed', dbErr);
                      setFeedbackError(String(dbErr?.message || dbErr));
                      errorOccurred = true;
                    }
                    // success (no error set)
                    if (!errorOccurred) {
                      try { alert('Thank you — your feedback was saved.'); } catch (_) {}
                    }
                  }
                } catch (err) {
                  console.error('Error saving PaymentSuccess feedback:', err);
                  setFeedbackError(String(err?.message || err));
                  errorOccurred = true;
                } finally {
                  setSavingFeedback(false);
                  // Only close and navigate if there was no error
                  if (!errorOccurred) {
                    setShowFeedback(false);
                    navigate(getPathWithTable('/menu'));
                  }
                }
              }}>Submit Feedback</button>
              <button className="submit-feedback-btn" onClick={() => { setShowFeedback(false); navigate(getPathWithTable('/menu')); }}>Skip</button>
            </div>
            {savingFeedback && <div style={{ marginTop: 8 }}>Saving feedback...</div>}
            {feedbackError && <div style={{ marginTop: 8, color: 'crimson' }}>Error saving feedback: {feedbackError}</div>}
            
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentSuccess;
