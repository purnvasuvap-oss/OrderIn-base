// src/pages/PayrollLogin.jsx
//
// Payroll access uses the existing client-side PayrollAccess section passcode.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import { verifySectionPasscode } from "../firebase";
import { signOutPayrollUser } from "../services/payrollAuthService";

export const PAYROLL_SESSION_KEYS = ["payrollAuth", "payrollAdminId", "payrollAdminName"];
export const clearPayrollSession = () => PAYROLL_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));

const MAX_ATTEMPTS = 5;

export default function PayrollLogin() {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();
  const locked = attempts >= MAX_ATTEMPTS;

  // Landing on the login page always ends any previous payroll session.
  React.useEffect(() => {
    clearPayrollSession();
    ["staffPortalAuth", "staffPortalStaffId", "staffPortalRole", "staffPortalPermissions"].forEach((key) => sessionStorage.removeItem(key));
    signOutPayrollUser().then(() => setAuthReady(true)).catch((err) => {
      console.error("Could not clear previous payroll auth session:", err);
      setError("Could not clear the previous login. Reload the page and try again.");
    });
  }, []);

  const grant = () => {
    sessionStorage.setItem("payrollAuth", "true");
    sessionStorage.setItem("payrollAdminId", "payroll-owner");
    sessionStorage.setItem("payrollAdminName", "Admin");
    navigate(routes.staffPayroll, { replace: true });
  };

  const fail = (message) => {
    const next = attempts + 1;
    setAttempts(next);
    setPin("");
    setError(next >= MAX_ATTEMPTS ? "Too many attempts. Payroll login is locked — reload the page later to try again." : message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked || busy || !authReady || !pin.trim()) return;
    setBusy(true);
    setError("");
    try {
      const isValid = await verifySectionPasscode("PayrollAccess", pin.trim());
      if (isValid) {
        grant();
      } else {
        fail("Wrong payroll passcode.");
      }
    } catch (error) {
      console.error("Error during payroll login:", error);
      setError("Login failed. Please try again.");
    } finally {
      setBusy(false);
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
            <img src="/images/OFD.png" alt="food illustration" className="sub-food-img" />
          </div>
          <div className="login-brand-caption">
            <span>OrderIn Console</span>
            <p className="sub-tagline">Personalized Restaurant<br />Control Unit</p>
          </div>
        </div>
      </aside>

      <main className="sub-login-right login-auth-area">
        <div className="login-auth-panel">
          <header className="sub-login-header">
            <p className="login-eyebrow">Restaurant Portal</p>
            <h2 className="sub-restaurant-name">XYZ Restaurant</h2>
            <p className="sub-welcome-text">Admin access</p>
          </header>

          <section className="sub-login-card" aria-label="payroll login form">
            <div className="login-card-heading">
              <div>
                <h3>Payroll Login</h3>
                <p className="sub">Admin (owner) only — managers and staff can't open payroll</p>
              </div>
              <span className="login-status-pill is-active">Admin</span>
            </div>

            <form onSubmit={handleSubmit} className="sub-login-form">
              {error && <p className="sub-field-error" role="alert">{error}</p>}
              <div className="sub-field">
                <label className="sub-field-label" htmlFor="payroll-pin">Payroll passcode</label>
                <input
                  id="payroll-pin"
                  name="pin"
                  type="password"
                  placeholder="Enter payroll passcode"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={locked || busy || !authReady}
                />
              </div>

              <button type="submit" className="sub-primary-cta" disabled={locked || busy || !authReady}>
                {locked ? "Locked — try later" : busy ? "Checking…" : !authReady ? "Preparing secure login…" : "Open Payroll"}
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
              Contact PurnVasu for queries<br />
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
