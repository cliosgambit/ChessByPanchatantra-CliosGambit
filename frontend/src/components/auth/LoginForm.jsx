import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Alert,
  AlertIcon,
  Button,
  Checkbox,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  IconButton,
  Spinner,
  VStack,
  Text,
  Link,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useAuth } from '../../context/AuthContext';
import { getRoleHomePath } from '../../services/authService';

function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = () => {
    let valid = true;
    setEmailError('');
    setPasswordError('');

    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Enter a valid email address');
      valid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    } else if (password.length < 4) {
      setPasswordError('Password must be at least 4 characters');
      valid = false;
    }

    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      const data = await login(email.trim(), password, rememberMe);
      navigate(getRoleHomePath(data.user.role), { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const message =
        err.response?.data?.message ||
        (status === 401
          ? 'Invalid email or password. Use the email registered for your player account, or contact your coach.'
          : err.message || 'Login failed. Please try again.');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <VStack as="form" spacing={5} onSubmit={handleSubmit} align="stretch">
      {error && (
        <Alert status="error" borderRadius="md" fontSize="sm">
          <AlertIcon />
          {error}
        </Alert>
      )}

      <FormControl isInvalid={!!emailError}>
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
        <FormErrorMessage>{emailError}</FormErrorMessage>
      </FormControl>

      <FormControl isInvalid={!!passwordError}>
        <FormLabel className="login-label" fontSize="sm">
          Password
        </FormLabel>
        <InputGroup>
          <Input
            className="login-input"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
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
        <FormErrorMessage>{passwordError}</FormErrorMessage>
      </FormControl>

      <Checkbox
        className="login-checkbox"
        isChecked={rememberMe}
        onChange={(e) => setRememberMe(e.target.checked)}
        colorScheme="red"
        size="sm"
      >
        Remember me
      </Checkbox>

      <Button
        as={motion.button}
        className="login-submit"
        type="submit"
        w="100%"
        size="lg"
        isLoading={isLoading}
        loadingText="Signing in"
        spinner={<Spinner size="sm" />}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Login
      </Button>

      <Text fontSize="sm" textAlign="center" color="gray.500">
        <Link as={RouterLink} to="/forgot-password" className="login-link">
          Forgot password?
        </Link>
      </Text>
    </VStack>
  );
}

export default LoginForm;
