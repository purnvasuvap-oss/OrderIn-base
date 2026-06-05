// src/pages/InventoryLogin.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifySectionPasscode } from "../firebase";
import routes from "../routes";

export default function InventoryLogin() {
  const [pin, setPin] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isValid = await verifySectionPasscode("InventoryAccess", pin);
      if (isValid) {
        localStorage.setItem("inventoryAuth", "true");
        navigate(routes.inventory);
      } else {
        alert("Wrong Passcode");
      }
    } catch (error) {
      console.error("Error during inventory login:", error);
      alert("Login failed. Please try again.");
    }
  };

  return (
    <div className="sub-login login-redesign">
      <aside className="sub-login-left login-brand-panel" aria-hidden="false">
        <div className="sub-brand-section">
          <div className="login-logo-card">
            <img src="/images/OrderIn.png" alt="OrderIn logo" className="sub-orderin-logo" />
          </div>
          <div className="sub-by-row">
            <span className="sub-by-text">by</span>
            <p className="sub-company-name-text">PurnVasu Tech Solutions Pvt. Ltd.</p>
          </div>
        </div>

        <div className="sub-illustration login-visual">
          <div className="sub-circle-outer" aria-hidden="true">
            <div className="sub-circle-inner" aria-hidden="true"></div>
            <img
              src="/images/OFD.png"
              alt="food illustration"
              className="sub-food-img"
            />
          </div>
          <div className="login-brand-caption">
            <span>OrderIn Console</span>
            <p className="sub-tagline">Personalized Restaurant<br/>Control Unit</p>
          </div>
        </div>
      </aside>

      <main className="sub-login-right login-auth-area">
        <div className="login-auth-panel">
          <header className="sub-login-header">
            <p className="login-eyebrow">Restaurant Portal</p>
            <h2 className="sub-restaurant-name">XYZ Restaurant</h2>
            <p className="sub-welcome-text">Welcome back</p>
          </header>

          <section className="sub-login-card" aria-label="login form">
            <div className="login-card-heading">
              <div>
                <h3>Inventory Section Login</h3>
                <p className="sub">To your account to continue</p>
              </div>
              <span className="login-status-pill is-active">Active</span>
            </div>

            <form onSubmit={handleSubmit} className="sub-login-form">
              <div className="sub-field">
                <label className="sub-field-label" htmlFor="pin">PIN</label>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button type="submit" className="sub-primary-cta">Enter</button>
              <button
                type="button"
                className="sub-dashboard-back"
                onClick={() => navigate(routes.dashboard)}
              >
                Back to Dashboard
              </button>
            </form>
          </section>

          <div className="sub-contact-info login-support-card">
            <span>Support</span>
            <p>
              Contact PurnVasu for queries<br/>
              <strong>OrderIn.vap@gmail.com</strong>
            </p>
          </div>
        </div>
      </main>

      <div className="sub-red-blob" aria-hidden="true">
        <img src="/images/Vector.png" alt="decorative vector" />
      </div>
    </div>
  );
}
