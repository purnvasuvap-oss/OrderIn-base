// src/components/ProtectedRoute.js
import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const isAuthenticated = localStorage.getItem("auth");

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
