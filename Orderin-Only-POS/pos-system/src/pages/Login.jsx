import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChefHat, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS } from "../lib/auth";
import { fetchDemoAccounts } from "../lib/accessControl";
import "./Login.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Fetched from the real accessControl accounts, not hardcoded — see
  // fetchDemoAccounts. Testing-phase convenience only; drop this whole
  // "demo accounts" section once staff are using their real logins.
  const [demoAccounts, setDemoAccounts] = useState([]);

  useEffect(() => {
    fetchDemoAccounts().then(setDemoAccounts).catch(() => setDemoAccounts([]));
  }, []);

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

        {demoAccounts.length > 0 && (
          <div className="login-demo">
            <div className="login-demo-title">Demo accounts</div>
            <div className="login-demo-grid">
              {demoAccounts.map((acc) => (
                <button key={acc.role} type="button" className="login-demo-chip" onClick={() => fillDemo(acc)}>
                  {ROLE_LABELS[acc.role]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
