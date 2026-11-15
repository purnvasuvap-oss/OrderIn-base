import React, { useEffect, useRef } from "react";

// Shown when an unauthenticated customer tries to Add to Cart or Order Now.
// Never a forced redirect — browsing continues uninterrupted if they pick
// "Continue Browsing".
function LoginRequiredModal({ isOpen, onLogin, onContinueBrowsing }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onContinueBrowsing();
    };
    window.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onContinueBrowsing]);

  if (!isOpen) return null;

  return (
    <div className="pm-login-modal-overlay" onClick={onContinueBrowsing}>
      <div
        className="pm-login-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-login-modal-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pm-login-modal-title" className="pm-login-modal-title">Ready to order?</h2>
        <p className="pm-login-modal-copy">Login to continue.</p>
        <button type="button" className="pm-login-modal-btn-primary" onClick={onLogin}>
          Login
        </button>
        <button type="button" className="pm-login-modal-btn-secondary" onClick={onContinueBrowsing}>
          Continue Browsing
        </button>
      </div>
    </div>
  );
}

export default LoginRequiredModal;
