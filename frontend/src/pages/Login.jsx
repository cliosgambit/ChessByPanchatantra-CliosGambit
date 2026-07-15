import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Box } from '@chakra-ui/react';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';
import './Login.css';

function Login() {
  const { isAuthenticated, user, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return null;
  }

  if (isAuthenticated && user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  return (
    <Box className="login-page" as="main">
      <Box
        as={motion.section}
        className="login-page__panel"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        aria-label="Sign in"
      >
        <h1 className="login-page__title">Sign in</h1>
        <p className="login-page__subtitle">
          Use your email and password to continue
        </p>
        <LoginForm />
      </Box>
    </Box>
  );
}

export default Login;
