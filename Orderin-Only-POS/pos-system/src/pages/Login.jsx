import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChefHat, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../lib/auth";
import "./Login.css";

const DEMO_ACCOUNTS = [
  { username: "admin", password: "admin123", role: "admin" },
  { username: "manager", password: "manager123", role: "manager" },
  { username: "cashier", password: "cashier123", role: "cashier" },
  { username: "kitchen", password: "kitchen123", role: "kitchen" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(username, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Always land on the signed-in user's role home rather than honoring a
    // "from" redirect: since logging out doesn't leave the protected page,
    // a stale forced-redirect from the *previous* session's ProtectedRoute
    // can otherwise carry over and send the next user to the wrong page.
    navigate(res.home, { replace: true });
  };

  const fillDemo = (acc) => {
    setUsername(acc.username);
    setPassword(acc.password);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark"><ChefHat size={22} /></div>
          <div>
            <div className="login-brand-name">Orderin POS</div>
            <div className="login-brand-tag">Restaurant Operations Platform</div>
          </div>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="login-label">Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. cashier" autoFocus />

          <label className="login-label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 6, height: 42 }}>
            {loading ? <Loader2 size={16} className="spin" /> : "Sign in"}
          </button>
        </form>

        <div className="login-demo">
          <div className="login-demo-title">Demo accounts</div>
          <div className="login-demo-grid">
            {DEMO_ACCOUNTS.map((acc) => (
              <button key={acc.username} type="button" className="login-demo-chip" onClick={() => fillDemo(acc)}>
                {ROLE_LABELS[acc.role]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
