// src/pages/StaffPortalLogin.jsx
//
// Dedicated login for individual staff members ("My Staff Portal"). Deliberately
// uses its own session keys (staffPortalAuth / staffPortalStaffId / staffPortalRole /
// staffPortalPermissions) that are completely separate from the Staff Management
// session (staffAuth / staffId / staffRole / staffPermissions, set by StaffLogin.jsx)
// so logging into one never grants access to the other, and each is its own
// per-browser-session (sessionStorage) login.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import routes from "../routes";
import { authenticateStaffPin, permissionsForRole } from "../services/staffService";

export default function StaffPortalLogin() {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    sessionStorage.removeItem("staffPortalAuth");
    sessionStorage.removeItem("staffPortalStaffId");
    sessionStorage.removeItem("staffPortalRole");
    sessionStorage.removeItem("staffPortalPermissions");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked) return;
    try {
      const staff = await authenticateStaffPin(pin);
      if (staff) {
        sessionStorage.setItem("staffPortalAuth", "true");
        sessionStorage.setItem("staffPortalStaffId", staff.id);
        sessionStorage.setItem("staffPortalRole", staff.role);
        sessionStorage.setItem(
          "staffPortalPermissions",
          JSON.stringify(permissionsForRole(staff.role).permissions),
        );
        navigate(routes.staffSelfService, { replace: true });
      } else {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (nextAttempts >= 5) setLocked(true);
        alert("Wrong PIN");
      }
    } catch (error) {
      console.error("Error during staff portal login:", error);
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
                <h3>My Staff Portal Login</h3>
                <p className="sub">Enter the PIN issued to you by your manager</p>
              </div>
              <span className="login-status-pill is-active">Active</span>
            </div>

            <form onSubmit={handleSubmit} className="sub-login-form">
              <div className="sub-field">
                <label className="sub-field-label" htmlFor="portal-pin">PIN</label>
                <input
                  id="portal-pin"
                  name="pin"
                  type="password"
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={locked}
                />
              </div>

              <button type="submit" className="sub-primary-cta" disabled={locked}>
                {locked ? "Locked — try later" : "Enter"}
              </button>
              <button
                type="button"
                className="sub-dashboard-back"
                onClick={() => navigate(routes.dashboard, { replace: true })}
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
