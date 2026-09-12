// src/pages/StaffLogin.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifySectionPasscode } from "../firebase";
import routes from "../routes";
import { authenticateStaffPin, permissionsForRole, STAFF_PERMISSIONS } from "../services/staffService";

export default function StaffLogin() {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    sessionStorage.removeItem("staffAuth");
    sessionStorage.removeItem("staffRole");
    localStorage.removeItem("staffAuth");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked) return;
    try {
      const staff = await authenticateStaffPin(pin);
      if (staff) {
        sessionStorage.setItem("staffAuth", "true");
        sessionStorage.setItem("staffId", staff.id);
        sessionStorage.setItem("staffRole", staff.role);
        sessionStorage.setItem(
          "staffPermissions",
          JSON.stringify(permissionsForRole(staff.role).permissions),
        );
        const canManage = permissionsForRole(staff.role).can(STAFF_PERMISSIONS.manageStaff);
        navigate(canManage ? routes.staffManagement : routes.staffSelfService, { replace: true });
      } else {
        // Keep the existing manager-only section passcode working for
        // installations that have not yet created manager staff records.
        const isManagerPasscode = await verifySectionPasscode("StaffAccess", pin);
        if (isManagerPasscode) {
          sessionStorage.setItem("staffAuth", "true");
          sessionStorage.setItem("staffRole", "General Manager");
          sessionStorage.setItem("staffPermissions", JSON.stringify([
            "staff.view", "staff.manage", "roster.edit", "requests.approve",
            "attendance.correct", "payroll.view", "audit.view", "notifications.manage",
          ]));
          navigate(routes.staffManagement, { replace: true });
          return;
        }
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (nextAttempts >= 5) setLocked(true);
        alert("Wrong Passcode or PIN");
      }
    } catch (error) {
      console.error("Error during staff login:", error);
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
                <h3>Staff Management Login</h3>
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
