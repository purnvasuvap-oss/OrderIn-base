import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * ProtectedRoute Component
 * 
 * Guards pages that require authentication.
 * If user is not logged in, redirects to login page.
 * Uses localStorage to check user authentication state.
 */
function ProtectedRoute({ children }) {
  // Check if user is authenticated (stored in localStorage from login)
  const user = localStorage.getItem('user');
  const isAuthenticated = user !== null && user !== undefined;

  if (!isAuthenticated) {
    // User not logged in, redirect to login with replace to avoid history
    return <Navigate to="/" replace />;
  }

  // User is authenticated, render the component
  return children;
}

export default ProtectedRoute;
