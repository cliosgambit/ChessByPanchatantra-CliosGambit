import React, { useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  IconButton,
  Spinner,
  Text,
  Link,
  VStack,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useAuth } from '../context/AuthContext';
import {
  getRoleHomePath,
  resetPasswordWithOtp,
  sendPasswordResetOtp,
} from '../services/authService';
import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPassword() {
  const { isAuthenticated, user, isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('email'); // email | otp | done
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  if (isAuthLoading) return null;
  if (isAuthenticated && user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  const clearMessages = () => {
    setError('');
    setInfo('');
    setFieldErrors({});
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    clearMessages();

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setFieldErrors({ email: 'Email is required' });
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setFieldErrors({ email: 'Enter a valid email address' });
      return;
    }

    setIsLoading(true);
    try {
      const data = await sendPasswordResetOtp(trimmed);
      setEmail(trimmed);
      setInfo(data.message || 'OTP sent to your email.');
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Could not send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    clearMessages();

    const nextErrors = {};
    if (!otp.trim()) nextErrors.otp = 'OTP is required';
    else if (!/^\d{6}$/.test(otp.trim())) nextErrors.otp = 'Enter the 6-digit code from your email';

    if (!password) nextErrors.password = 'Password is required';
    else if (password.length < 4) nextErrors.password = 'Password must be at least 4 characters';

    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    setIsLoading(true);
    try {
      const data = await resetPasswordWithOtp(email, otp.trim(), password);
      setInfo(data.message || 'Password reset successfully.');
      setStep('done');
    } catch (err) {
      setError(err.message || 'Could not reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    clearMessages();
    setIsLoading(true);
    try {
      const data = await sendPasswordResetOtp(email);
      setInfo(data.message || 'A new OTP was sent.');
    } catch (err) {
      setError(err.message || 'Could not resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box className="login-page" as="main">
      <Box
        as={motion.section}
        className="login-page__panel"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        aria-label="Reset password"
      >
        <h1 className="login-page__title">
          {step === 'done' ? 'Password updated' : 'Forgot password'}
        </h1>
        <p className="login-page__subtitle">
          {step === 'email' && 'Enter your registered email and we will send a one-time code.'}
          {step === 'otp' && `Enter the OTP sent to ${email}, then choose a new password.`}
          {step === 'done' && 'You can sign in with your new password.'}
        </p>

        <VStack spacing={5} align="stretch">
          {error && (
            <Alert status="error" borderRadius="md" fontSize="sm">
              <AlertIcon />
              {error}
            </Alert>
          )}
          {info && (
            <Alert status="success" borderRadius="md" fontSize="sm">
              <AlertIcon />
              {info}
            </Alert>
          )}

          {step === 'email' && (
            <VStack as="form" spacing={5} onSubmit={handleSendOtp} align="stretch">
              <FormControl isInvalid={!!fieldErrors.email}>
                <FormLabel className="login-label" fontSize="sm">
                  Email
                </FormLabel>
                <Input
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  bg="white"
                />
                <FormErrorMessage>{fieldErrors.email}</FormErrorMessage>
              </FormControl>

              <Button
                as={motion.button}
                className="login-submit"
                type="submit"
                w="100%"
                size="lg"
                isLoading={isLoading}
                loadingText="Sending code"
                spinner={<Spinner size="sm" />}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Send OTP
              </Button>
            </VStack>
          )}

          {step === 'otp' && (
            <VStack as="form" spacing={5} onSubmit={handleResetPassword} align="stretch">
              <FormControl isInvalid={!!fieldErrors.otp}>
                <FormLabel className="login-label" fontSize="sm">
                  OTP code
                </FormLabel>
                <Input
                  className="login-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                  bg="white"
                  letterSpacing="0.2em"
                  fontWeight="700"
                />
                <FormErrorMessage>{fieldErrors.otp}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!fieldErrors.password}>
                <FormLabel className="login-label" fontSize="sm">
                  New password
                </FormLabel>
                <InputGroup>
                  <Input
                    className="login-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    bg="white"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                      variant="ghost"
                      size="sm"
                      color="gray.600"
                      onClick={() => setShowPassword((v) => !v)}
                    />
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage>{fieldErrors.password}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!fieldErrors.confirmPassword}>
                <FormLabel className="login-label" fontSize="sm">
                  Confirm password
                </FormLabel>
                <Input
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  bg="white"
                />
                <FormErrorMessage>{fieldErrors.confirmPassword}</FormErrorMessage>
              </FormControl>

              <Button
                as={motion.button}
                className="login-submit"
                type="submit"
                w="100%"
                size="lg"
                isLoading={isLoading}
                loadingText="Resetting"
                spinner={<Spinner size="sm" />}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Reset password
              </Button>

              <Text fontSize="sm" textAlign="center" color="gray.500">
                Didn&apos;t get a code?{' '}
                <Button
                  variant="link"
                  className="login-link"
                  onClick={handleResend}
                  isDisabled={isLoading}
                  fontSize="sm"
                >
                  Resend OTP
                </Button>
              </Text>
            </VStack>
          )}

          {step === 'done' && (
            <Button
              className="login-submit"
              w="100%"
              size="lg"
              onClick={() => navigate('/login', { replace: true })}
            >
              Back to sign in
            </Button>
          )}

          {step !== 'done' && (
            <Text fontSize="sm" textAlign="center" color="gray.500">
              <Link as={RouterLink} to="/login" className="login-link">
                Back to sign in
              </Link>
            </Text>
          )}
        </VStack>
      </Box>
    </Box>
  );
}

export default ForgotPassword;
