import React from "react";
import { Navigate } from "react-router-dom";

export default function SectionProtectedRoute({ storageKey, redirectTo, children }) {
  const hasSectionAccess = sessionStorage.getItem(storageKey) === "true";

  if (!hasSectionAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
