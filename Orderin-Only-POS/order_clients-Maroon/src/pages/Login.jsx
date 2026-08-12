// src/pages/Login.js
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { verifyMainLogin, getRestaurantStatus } from "../firebase";
import "./Login.css";

export default function Login() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantStatus, setRestaurantStatus] = useState({ status: 'Unknown', allowed: true, daysLeft: null });
  const loginFormRef = useRef(null);
  const navigate = useNavigate();
  const accessState =
    restaurantStatus.status === "Unknown"
      ? "checking"
      : restaurantStatus.status === "Inactive" && restaurantStatus.allowed
        ? "limited"
        : restaurantStatus.allowed
          ? "active"
          : "disabled";
  const accessLabel =
    accessState === "checking"
      ? "Checking"
      : accessState === "limited"
        ? "Limited"
        : accessState === "active"
          ? "Active"
          : "Disabled";

  useEffect(() => {
    // If already authenticated, avoid keeping `/` login in history
    // (prevents browser/device back/undo/redo from trapping user on login screen).
    const existingAuth = localStorage.getItem("auth");
    if (existingAuth) {
      window.history.replaceState({}, document.title, window.location.pathname);
      navigate("/dashboard", { replace: true });
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const statusInfo = await getRestaurantStatus();
        if (mounted) setRestaurantStatus(statusInfo);
      } catch (err) {
        console.warn("Failed to load restaurant status:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);


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
        localStorage.removeItem("menuAuth");
        localStorage.removeItem("financeAuth");
        localStorage.removeItem("inventoryAuth");
        sessionStorage.removeItem("menuAuth");
        sessionStorage.removeItem("financeAuth");
        sessionStorage.removeItem("inventoryAuth");
        navigate("/dashboard", { replace: true });
      } else {
        alert("Invalid Credentials");
      }
    } catch (error) {
      console.error("Error during login:", error);
      alert("Login failed. Please try again.");
    }
  };

  useEffect(() => {
    const handleEnterSubmit = (event) => {
      if (event.key !== "Enter" || event.defaultPrevented) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.tagName === "TEXTAREA") return;
        if (target.closest("form")) return;
      }

      event.preventDefault();
      loginFormRef.current?.requestSubmit();
    };

    window.addEventListener("keydown", handleEnterSubmit);
    return () => window.removeEventListener("keydown", handleEnterSubmit);
  }, []);

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
                <h3>Sign in</h3>
                <p className="sub">To your account to continue</p>
              </div>
              <span className={`login-status-pill is-${accessState}`}>{accessLabel}</span>
            </div>

            <form ref={loginFormRef} onSubmit={handleLogin} className="sub-login-form">
              <div className="sub-field">
                <label className="sub-field-label" htmlFor="userId">User ID</label>
                <input
                  id="userId"
                  name="userId"
                  type="text"
                  placeholder="Enter user ID"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="sub-field">
                <label className="sub-field-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button type="submit" className="sub-primary-cta" disabled={!restaurantStatus.allowed}>
                Login
              </button>
              {restaurantStatus.status === 'Inactive' && restaurantStatus.daysLeft !== null && (
                <p className="status-note">Limited access: {restaurantStatus.daysLeft} day(s) left</p>
              )}
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
