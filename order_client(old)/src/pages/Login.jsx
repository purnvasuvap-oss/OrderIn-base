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
    <div className="login-page">
      {/* Left branding column */}
      <aside className="login-left" aria-hidden="false">
        <div className="brand-section">
          <img src="/images/OrderIn.png" alt="OrderIn logo" className="login-orderin-logo" />
          <div className="by-row">
            <span className="by-text">by</span>
            <p className="company-name-text">PurnVasu Tech Solutions Pvt. Ltd.</p>
          </div>
        </div>

        <div className="illustration">
          <div className="circle-outer" aria-hidden="true">
            <div className="circle-inner" aria-hidden="true"></div>
            {/* image overlays the inner circle */}
            <img
              src="/images/OFD.png"
              alt="food illustration"
              className="food-img"
            />
          </div>
          <p className="tagline">✅ Personalized Restaurant<br/>Control Unit</p>
        </div>
      </aside>

      {/* Right content */}
      <main className="login-right">
        <header className="login-header">
          <h2 className="restaurant-name">XYZ Restaurant</h2>
          <p className="welcome-text">Welcome XYZ Restaurant</p>
        </header>

        <section className="login-card" aria-label="login form">
          <h3>Login</h3>
          <p className="sub">To your account to continue</p>

          <form onSubmit={handleLogin} className="login-form">
            <label className="sr-only" htmlFor="userId">User Id</label>
            <input
              id="userId"
              name="userId"
              type="text"
              placeholder="User Id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />

            <label className="sr-only" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button type="submit" className="primary-cta" disabled={!restaurantStatus.allowed}>
              Login
            </button>
            {restaurantStatus.status === 'Inactive' && restaurantStatus.daysLeft !== null && (
              <p className="status-note">Limited access: {restaurantStatus.daysLeft} day(s) left</p>
            )}
          </form>
        </section>

        <div className="contact-info">
          <p>
            Contact PurnVasu for queries:<br/>
            Email: <strong>OrderIn.vap@gmail.com</strong>
          </p>
        </div>
      </main>

      {/* Decorative right-bottom image (vector PNG from attachments) */}
      <div className="red-blob" aria-hidden="true">
        <img src="/images/Vector.png" alt="decorative vector" />
      </div>
    </div>
  );
}
