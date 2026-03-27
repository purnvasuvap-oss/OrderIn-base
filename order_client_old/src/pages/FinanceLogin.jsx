// src/pages/FinanceLogin.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifySectionPasscode } from "../firebase";
import routes from "../routes";

export default function FinanceLogin() {
  const [pin, setPin] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isValid = await verifySectionPasscode("FinanceAccess", pin);
      if (isValid) {
        localStorage.setItem("financeAuth", "true");
        navigate(routes.finance);
      } else {
        alert("Wrong Passcode");
      }
    } catch (error) {
      console.error("Error during finance login:", error);
      alert("Login failed. Please try again.");
    }
  };

  return (
    <div className="sub-login">
      {/* Left branding column */}
      <aside className="sub-login-left" aria-hidden="false">
        <div className="sub-brand-section">
          <img src="/images/OrderIn.png" alt="OrderIn logo" className="sub-orderin-logo" />
          <div className="sub-by-row">
            <span className="sub-by-text">by</span>
            <p className="sub-company-name-text">PurnVasu Tech Solutions Pvt. Ltd.</p>
          </div>
        </div>

        <div className="sub-illustration">
          <div className="sub-circle-outer" aria-hidden="true">
            <div className="sub-circle-inner" aria-hidden="true"></div>
            {/* image overlays the inner circle */}
            <img
              src="/images/OFD.png"
              alt="food illustration"
              className="sub-food-img"
            />
          </div>
          <p className="sub-tagline">✅ Personalized Restaurant<br/>Control Unit</p>
        </div>
      </aside>

      {/* Right content */}
      <main className="sub-login-right">
        <header className="sub-login-header">
          <h2 className="sub-restaurant-name">XYZ Restaurant</h2>
          <p className="sub-welcome-text">Welcome XYZ Restaurant</p>
        </header>

        <section className="sub-login-card" aria-label="login form">
          <h3>Finance Section Login</h3>
          <p className="sub">To your account to continue</p>

          <form onSubmit={handleSubmit} className="sub-login-form">
            <label className="sub-sr-only" htmlFor="pin">PIN</label>
            <input
              id="pin"
              name="pin"
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />

            <button type="submit" className="sub-primary-cta">Enter</button>
          </form>
        </section>

        <div className="sub-contact-info">
          <p>
            Contact PurnVasu for queries:<br/>
            Email: <strong>OrderIn.vap@gmail.com</strong>
          </p>
        </div>
      </main>

      {/* Decorative right-bottom image (vector PNG from attachments) */}
      <div className="sub-red-blob" aria-hidden="true">
        <img src="/images/Vector.png" alt="decorative vector" />
      </div>
    </div>
  );
}