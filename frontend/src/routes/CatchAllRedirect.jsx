import React from 'react';
import { Navigate } from 'react-router-dom';
import { Center, Spinner } from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';

/** Unknown routes: send authed users home, others to login — avoids login↔dashboard bounce. */
function CatchAllRedirect() {
  const { isAuthenticated, user, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <Center minH="60vh">
        <Spinner size="lg" color="gold.500" />
      </Center>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={getRoleHomePath(user?.role)} replace />;
  }

  return <Navigate to="/login" replace />;
}

export default CatchAllRedirect;
