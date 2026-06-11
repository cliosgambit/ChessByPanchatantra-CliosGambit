import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';

/**
 * Role-based route guard. Admins always pass. Others must match allowedRoles.
 */
function RoleGuard({ allowedRoles = [] }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const role = (user?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const allowed =
    isAdmin || allowedRoles.map((r) => r.toLowerCase()).includes(role);

  if (!allowed) {
    return <Navigate to={getRoleHomePath(user?.role)} replace />;
  }

  return <Outlet />;
}

export default RoleGuard;
