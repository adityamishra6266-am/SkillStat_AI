// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { token, user, loading } = useAuth();

  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Client-side convenience only; the real boundary is the
  // backend's adminOnly middleware on /api/admin/*. This just avoids
  // rendering the admin page shell for a learner who types /admin
  // directly, sending them somewhere useful instead of an error page.
  if (adminOnly && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
