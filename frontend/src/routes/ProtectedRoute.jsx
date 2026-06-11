import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Center, Spinner } from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';

function ProtectedRoute({ allowedRoles, requireAuth = true }) {
  const { isAuthenticated, user, isAuthLoading } = useAuth();
  const location = useLocation();

  if (isAuthLoading) {
    return (
      <Center minH="60vh">
        <Spinner size="xl" color="gold.500" thickness="3px" />
      </Center>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const role = (user?.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const allowed = isAdmin || allowedRoles.map((r) => r.toLowerCase()).includes(role);

    if (!allowed) {
      const fallback = getRoleHomePath(user?.role);
      if (location.pathname === fallback) {
        return <Outlet />;
      }
      return <Navigate to={fallback} replace />;
    }
  }

  return <Outlet />;
}

export default ProtectedRoute;
