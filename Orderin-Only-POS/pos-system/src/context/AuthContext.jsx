import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { STORES, getAll, putOne } from "../lib/db";
import { verifyPassword, hashPassword, ROLE_HOME } from "../lib/auth";
import { logAudit } from "../lib/repo";

const AuthContext = createContext(null);
const SESSION_KEY = "orderin_pos_session";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    (async () => {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          const users = await getAll(STORES.users);
          const fresh = users.find((u) => u.id === saved.id);
          if (fresh && fresh.status === "active") setUser(fresh);
          else localStorage.removeItem(SESSION_KEY);
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (username, password) => {
    const users = await getAll(STORES.users);
    const found = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!found) return { ok: false, error: "No account with that username." };
    if (found.status !== "active") return { ok: false, error: "This account is disabled." };
    const valid = await verifyPassword(password, found.passwordHash);
    if (!valid) return { ok: false, error: "Incorrect password." };
    setUser(found);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: found.id }));
    logAudit({ user: found, action: "auth.login", entity: "auth", entityId: found.id, after: { username: found.username, role: found.role } });
    return { ok: true, user: found, home: ROLE_HOME[found.role] || "/dashboard" };
  }, []);

  const logout = useCallback(() => {
    const current = userRef.current;
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    navigate("/login", { replace: true, state: null });
    if (current) logAudit({ user: current, action: "auth.logout", entity: "auth", entityId: current.id });
  }, [navigate]);

  const changePassword = useCallback(async (userId, newPassword) => {
    const users = await getAll(STORES.users);
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const next = { ...target, passwordHash: await hashPassword(newPassword) };
    await putOne(STORES.users, next);
    if (user?.id === userId) setUser(next);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
