import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccess, ROLE_HOME } from "../lib/auth";

export default function ProtectedRoute({ children, navKey }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (navKey && !canAccess(user.role, navKey)) {
    return <Navigate to={ROLE_HOME[user.role] || "/login"} replace />;
  }
  return children;
}
