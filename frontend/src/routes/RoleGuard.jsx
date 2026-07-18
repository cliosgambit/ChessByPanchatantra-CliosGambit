import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';
import { normalizeRole } from '../utils/roles';

/**
 * Role-based route guard. Allowed roles must be listed explicitly.
 */
function RoleGuard({ allowedRoles = [] }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const role = normalizeRole(user?.role);
  const allowed = allowedRoles.map((r) => r.toLowerCase()).includes(role);

  if (!allowed) {
    return <Navigate to={getRoleHomePath(user?.role)} replace />;
  }

  return <Outlet />;
}

export default RoleGuard;
