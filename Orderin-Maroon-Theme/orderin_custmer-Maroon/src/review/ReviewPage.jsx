import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTableNumber } from "../hooks/useTableNumber";
import { useCart } from "../context/CartContext";
import { AlreadyReviewedError, hasCustomerReviewed, readLoggedInUser, saveCustomerReview } from "./reviewService";
import "../payments/PaymentSuccess.css";
import "./ReviewPage.css";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * Shown after the order is complete and before the bill.
 * The diner can leave their one review or skip; either way they go on to the
 * bill. Customers who have already reviewed (or aren't logged in) go straight
 * to the bill.
 */
function ReviewPage() {
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();
  const { orderHistory } = useCart();
  const [checking, setChecking] = useState(true);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const user = readLoggedInUser();
  const phone = user && user.phone;
  const goToBill = () => navigate(getPathWithTable("/bill"), { replace: true });

  useEffect(() => {
    let alive = true;
    if (!phone) {
      goToBill();
      return undefined;
    }
    hasCustomerReviewed(phone)
      .then((done) => {
        if (!alive) return;
        if (done) goToBill();
        else setChecking(false);
      })
      .catch(() => {
        // Can't check right now: still offer the review; saving re-checks.
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const latestOrderId = () => {
    try {
      const fromStorage = localStorage.getItem("orderin_countercode_orderId") || localStorage.getItem("orderin_orderId");
      return fromStorage || (Array.isArray(orderHistory) && orderHistory.length ? orderHistory[orderHistory.length - 1].id : null);
    } catch (e) {
      return null;
    }
  };

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      await saveCustomerReview(phone, { stars, text, orderId: latestOrderId() });
      goToBill();
    } catch (e) {
      if (e instanceof AlreadyReviewedError) {
        goToBill();
        return;
      }
      setError(e.message || "Couldn't save your review. You can skip and see your bill.");
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="payment-success-container">
        <div className="success-card review-card">
          <p className="order-id">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-success-container">
      <div className="success-card review-card">
        <h2>How was your meal?</h2>
        <p className="review-sub">Rate your experience. You can only leave one review, or skip it.</p>

        <div className="review-stars" role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className={`review-star ${stars >= n ? "on" : ""}`}
              onClick={() => setStars(n)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.4 8.168L12 18.896l-7.334 3.87 1.4-8.168L.132 9.21l8.2-1.192z" />
              </svg>
            </button>
          ))}
        </div>
        <p className="review-label" aria-live="polite">{LABELS[stars] || " "}</p>

        <label className="review-text">
          <span>Anything to add? (optional)</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Tell us what you liked or what we can do better" />
        </label>

        {error && (
          <p className="review-error" role="alert">
            {error}
          </p>
        )}

        <button type="button" className="view-bill-btn" disabled={!stars || saving} onClick={submit}>
          {saving ? "Saving…" : "Submit & view bill"}
        </button>
        <button type="button" className="back-home-btn" disabled={saving} onClick={goToBill}>
          Skip & view bill
        </button>
      </div>
    </div>
  );
}

export default ReviewPage;
