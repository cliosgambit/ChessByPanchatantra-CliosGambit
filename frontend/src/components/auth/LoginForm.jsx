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
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
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
      const message =
        err.response?.data?.message || err.message || 'Login failed. Please try again.';
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
        <FormLabel color="navy.700" fontSize="sm">
          Email
        </FormLabel>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          bg="white"
          borderColor="gray.200"
          _focus={{ borderColor: 'gold.500', boxShadow: '0 0 0 1px #c9a227' }}
        />
        <FormErrorMessage>{emailError}</FormErrorMessage>
      </FormControl>

      <FormControl isInvalid={!!passwordError}>
        <FormLabel color="navy.700" fontSize="sm">
          Password
        </FormLabel>
        <InputGroup>
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            bg="white"
            borderColor="gray.200"
            _focus={{ borderColor: 'gold.500', boxShadow: '0 0 0 1px #c9a227' }}
          />
          <InputRightElement>
            <IconButton
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
              variant="ghost"
              size="sm"
              onClick={() => setShowPassword((v) => !v)}
            />
          </InputRightElement>
        </InputGroup>
        <FormErrorMessage>{passwordError}</FormErrorMessage>
      </FormControl>

      <Checkbox
        isChecked={rememberMe}
        onChange={(e) => setRememberMe(e.target.checked)}
        colorScheme="yellow"
        size="sm"
      >
        Remember me
      </Checkbox>

      <Button
        as={motion.button}
        type="submit"
        w="100%"
        size="lg"
        bg="navy.700"
        color="white"
        _hover={{ bg: 'navy.600' }}
        _active={{ bg: 'navy.800' }}
        isLoading={isLoading}
        loadingText="Signing in"
        spinner={<Spinner size="sm" />}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Login
      </Button>

      <Text fontSize="sm" textAlign="center" color="gray.500">
        <Link as={RouterLink} to="/login" color="gold.600" fontWeight="600">
          Forgot password?
        </Link>{' '}
        — contact your administrator to reset your account.
      </Text>
    </VStack>
  );
}

export default LoginForm;
