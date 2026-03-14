// src/pages/Login.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { verifyMainLogin, getRestaurantStatus } from "../firebase";
import "./Login.css";

export default function Login() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantStatus, setRestaurantStatus] = useState({ status: 'Unknown', allowed: true, daysLeft: null });
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const statusInfo = await getRestaurantStatus();
        if (mounted) setRestaurantStatus(statusInfo);
      } catch (err) {
        console.warn('Failed to load restaurant status:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      if (!restaurantStatus.allowed) {
        if (restaurantStatus.status === 'Inactive' && restaurantStatus.daysLeft > 0) {
          // allowed case already handled by allowed flag, but guard here
        } else {
          alert(`Login disabled: restaurant status is ${restaurantStatus.status}`);
          return;
        }
      }

      const isValid = await verifyMainLogin(userId.trim(), password.trim());
      if (isValid) {
        localStorage.setItem("auth", "true");
        navigate("/dashboard");
      } else {
        alert("Invalid Credentials");
      }
    } catch (error) {
      console.error("Error during login:", error);
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
          <h3>Login</h3>
          <p className="sub">To your account to continue</p>

          <form onSubmit={handleLogin} className="sub-login-form">
            <label className="sub-sr-only" htmlFor="userId">User Id</label>
            <input
              id="userId"
              name="userId"
              type="text"
              placeholder="User Id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />

            <label className="sub-sr-only" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button type="submit" className="sub-primary-cta" disabled={!restaurantStatus.allowed}>
              Login
            </button>
            {restaurantStatus.status === 'Inactive' && restaurantStatus.daysLeft !== null && (
              <p className="status-note">Limited access: {restaurantStatus.daysLeft} day(s) left</p>
            )}
          </form>
        </section>

        <div className="sub-contact-info">
          <p>
            Contact PurnVasu for queries:<br/>
            Email: <strong>OrderIn.vap@gmail.com</strong>
          </p>
          <p className="sub-tagline sub-tagline-below-contact">✅ Personalized Restaurant<br/>Control Unit</p>
        </div>
      </main>

      {/* Decorative right-bottom image (vector PNG from attachments) */}
      <div className="sub-red-blob" aria-hidden="true">
        <img src="/images/Vector.png" alt="decorative vector" />
      </div>
    </div>
  );
}
