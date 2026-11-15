import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import { auth, firebaseEnabled } from "../lib/firebase";
import { ROLE_HOME, ROLES } from "../lib/auth";
import { logAudit } from "../lib/repo";

const CLAIM_ROLE = {
  owner: ROLES.ADMIN,
  platformAdmin: ROLES.ADMIN,
  manager: ROLES.MANAGER,
  captain: ROLES.MANAGER,
  cashier: ROLES.CASHIER,
  kitchen: ROLES.KITCHEN,
};

function staffFromFirebase(fbUser, token) {
  const role = CLAIM_ROLE[token?.claims?.role];
  if (!role) return null;
  return {
    id: fbUser.uid,
    username: fbUser.email || "",
    name: fbUser.displayName || fbUser.email || "Staff",
    role,
    status: "active",
    restaurantId: token.claims.restaurantId || "",
  };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (!firebaseEnabled) {
      setReady(true);
      return undefined;
    }
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setReady(true);
        return;
      }
      const token = await fbUser.getIdTokenResult();
      setUser(staffFromFirebase(fbUser, token));
      setReady(true);
    });
  }, []);

  const login = useCallback(async (email, password) => {
    if (!firebaseEnabled) return { ok: false, error: "Firebase Auth is not configured on this terminal." };
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await cred.user.getIdTokenResult(true);
      const next = staffFromFirebase(cred.user, token);
      if (!next) {
        await signOut(auth);
        return { ok: false, error: "This login is not a staff account." };
      }
      setUser(next);
      logAudit({ user: next, action: "auth.login", entity: "auth", entityId: next.id, after: { username: next.username, role: next.role } });
      return { ok: true, user: next, home: ROLE_HOME[next.role] || "/dashboard" };
    } catch (err) {
      return { ok: false, error: "Incorrect email or password." };
    }
  }, []);

  const logout = useCallback(() => {
    const current = userRef.current;
    setUser(null);
    if (firebaseEnabled) signOut(auth).catch(() => {});
    navigate("/login", { replace: true, state: null });
    if (current) logAudit({ user: current, action: "auth.logout", entity: "auth", entityId: current.id });
  }, [navigate]);

  const changePassword = useCallback(async (_userId, newPassword) => {
    if (!auth.currentUser) throw new Error("Sign in again before changing the password.");
    await updatePassword(auth.currentUser, newPassword);
  }, []);

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
