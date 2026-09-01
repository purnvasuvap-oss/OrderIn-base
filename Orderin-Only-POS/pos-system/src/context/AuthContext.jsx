import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { STORES, getAll, putOne } from "../lib/db";
import { verifyPassword, hashPassword, ROLE_HOME } from "../lib/auth";
import { logAudit } from "../lib/repo";
import { enqueueSync } from "../lib/sync";
import { verifyAccessLogin, updateAccessPassword } from "../lib/accessControl";

const titleCase = (s) => s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1));

// Caches a successful accessControl login locally so session-restore (which
// looks the signed-in id up in local STORES.users) keeps working across page
// reloads and offline moments, without touching the separate device-local
// `users` store used by the demo/local-only accounts.
async function cacheAccessUser({ role, username, docId, collectionName }) {
  const id = `acc_${docId}`;
  const users = await getAll(STORES.users);
  const existing = users.find((u) => u.id === id);
  const next = {
    ...(existing || {}),
    id,
    username,
    name: existing?.name || titleCase(username),
    role,
    status: "active",
    source: "accessControl",
    accessCollection: collectionName,
    accessDocId: docId,
    createdAt: existing?.createdAt || Date.now(),
  };
  await putOne(STORES.users, next);
  return next;
}

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
    const trimmed = username.trim();

    // The restaurant's cloud-managed accessControl login (set up directly in
    // Firestore by the owner) is the authoritative account list when
    // reachable. A definitive match (right OR wrong password) short-circuits
    // here so a mistyped password never falls through and succeeds against
    // an unrelated device-local demo account sharing the same username.
    try {
      const access = await verifyAccessLogin(trimmed, password);
      if (access) {
        if (!access.valid) return { ok: false, error: "Incorrect password." };
        const user = await cacheAccessUser(access);
        setUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id }));
        logAudit({ user, action: "auth.login", entity: "auth", entityId: user.id, after: { username: user.username, role: user.role } });
        return { ok: true, user, home: ROLE_HOME[user.role] || "/dashboard" };
      }
    } catch (err) {
      console.warn("accessControl login check failed, falling back to local accounts:", err?.message || err);
    }

    // Offline, or a username not (yet) provisioned in accessControl — fall
    // back to the device-local demo accounts seeded by seed.js.
    const users = await getAll(STORES.users);
    const found = users.find((u) => u.username.toLowerCase() === trimmed.toLowerCase());
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
    // accessControl-sourced accounts are authenticated straight off their
    // Firestore doc (see login/verifyAccessLogin), so the new password has
    // to land there too — otherwise the old one would keep working online.
    if (target.source === "accessControl" && target.accessCollection && target.accessDocId) {
      await updateAccessPassword(target.accessCollection, target.accessDocId, newPassword);
    }
    const next = { ...target, passwordHash: await hashPassword(newPassword), updatedAt: Date.now() };
    await putOne(STORES.users, next);
    enqueueSync(STORES.users, "put", next);
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
