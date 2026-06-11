import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearSession,
  fetchCurrentUser,
  getStoredToken,
  getStoredUser,
  loginRequest,
  logoutRequest,
  persistSession,
} from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState(getStoredUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const logout = useCallback(async () => {
    await logoutRequest();
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const data = await loginRequest(email, password, rememberMe);
    persistSession(data.token, data.user, rememberMe);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const existingToken = getStoredToken();
      if (!existingToken) {
        setIsAuthLoading(false);
        return;
      }

      try {
        const freshUser = await fetchCurrentUser();
        setUser(freshUser);
        persistSession(existingToken, freshUser, localStorage.getItem('rememberMe') === '1');
        setToken(existingToken);
      } catch {
        await logout();
      } finally {
        setIsAuthLoading(false);
      }
    };

    bootstrap();
  }, [logout]);

  const value = {
    token,
    user,
    isAuthLoading,
    isAuthenticated: Boolean(token && user),
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export default AuthContext;
