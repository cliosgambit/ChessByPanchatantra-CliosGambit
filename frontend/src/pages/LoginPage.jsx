import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  Heading,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Center,
  useColorModeValue,
  Text,
  HStack,
  InputGroup,
  InputRightElement,
  IconButton,
} from '@chakra-ui/react';
import { useAuth } from '../AppContext';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useNavigate } from 'react-router-dom';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  
  // Form states
  const [chessComId, setChessComId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI states
  const [step, setStep] = useState('check_id'); // check_id, password_login, email_setup, otp_verification, success
  const [userStatus, setUserStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const cardBg = useColorModeValue('white', 'gray.700');
  const textColor = useColorModeValue('gray.600', 'gray.400');

  // Timer effect for OTP resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Step 1: Check chess.com ID
  const handleCheckChessId = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/check-chess-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chess_com_id: chessComId }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setError(data.message);
          setStep('not_found');
        } else {
          throw new Error(data.message || 'An unknown error occurred.');
        }
        return;
      }

      setUserStatus(data);
      
      if (data.status === 'has_credentials') {
        setStep('password_login');
      } else if (data.status === 'needs_password') {
        setStep('email_setup');
      } else if (data.status === 'needs_setup') {
        setStep('email_setup');
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Login with password
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      console.log('Attempting login for:', chessComId);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chess_com_id: chessComId, password }),
      });
      const data = await response.json();

      console.log('Login response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.message || 'Invalid credentials.');
      }

      if (!data.token) {
        throw new Error('No token received from server.');
      }

      console.log('Token received, calling login function');
      
      // Store the token and redirect
      login(data.token);
      setStep('success');
      setMessage('Login successful! Redirecting...');
      
      // Redirect after a short delay
      setTimeout(() => {
        window.location.href = '#/';
      }, 2000);
      
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Send OTP for email setup or password reset
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chess_com_id: chessComId, email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'An unknown error occurred.');
      }

      setMessage(data.message);
      setResendCooldown(60);
      setStep('otp_verification');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Verify OTP and set password
  const handleVerifyAndSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/verify-set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chess_com_id: chessComId, otp, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'An unknown error occurred.');
      }

      setMessage('Password set successfully! Logging you in...');
      // Direct login after password set
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chess_com_id: chessComId, password }),
      });
      const loginData = await loginResponse.json();
      if (!loginResponse.ok || !loginData.token) {
        throw new Error(loginData.message || 'Login failed after password set.');
      }
      login(loginData.token);
      setStep('success');
      setMessage('Login successful! Redirecting...');
      setTimeout(() => {
        window.location.href = '#/';
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToId = () => {
    setStep('check_id');
    setError('');
    setMessage('');
    setEmail('');
    setPassword('');
    setOtp('');
    setUserStatus(null);
  };

  const handleResendOtp = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chess_com_id: chessComId, email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend OTP.');
      }

      setMessage('OTP resent successfully!');
      setResendCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [step, navigate]);

  return (
    <Center minH="calc(100vh - 80px)" px={4}>
      <Box
        p={8}
        borderWidth={1}
        borderRadius="lg"
        boxShadow="xl"
        bg={cardBg}
        w={{ base: '100%', sm: '400px', md: '450px' }}
      >
        <VStack spacing={6}>
          <Heading color="teal.500">Member Login</Heading>
          
          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step !== 'success' && message && (
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {/* STEP 1: Enter Chess.com ID */}
          {step === 'check_id' && (
            <form onSubmit={handleCheckChessId} style={{ width: '100%' }}>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Chess.com ID</FormLabel>
                  <Input
                    type="text"
                    placeholder="e.g., Hikaru"
                    value={chessComId}
                    onChange={(e) => setChessComId(e.target.value)}
                    autoFocus
                  />
                </FormControl>
                <Button
                  type="submit"
                  colorScheme="teal"
                  width="full"
                  isLoading={isLoading}
                  disabled={!chessComId.trim()}
                >
                  Check ID
                </Button>
              </VStack>
            </form>
          )}

          {/* STEP: User not found */}
          {step === 'not_found' && (
            <VStack spacing={4}>
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button onClick={handleBackToId} colorScheme="teal" width="full">
                Try Different ID
              </Button>
            </VStack>
          )}

          {/* STEP 2: Login with password */}
          {step === 'password_login' && (
            <form onSubmit={handlePasswordLogin} style={{ width: '100%' }}>
              <VStack spacing={4}>
                <Text fontSize="sm" color={textColor}>
                  Welcome back! Please enter your password.
                </Text>
                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    <InputRightElement width="3rem">
                      <IconButton
                        h="1.75rem"
                        size="sm"
                        onClick={() => setShowPassword((s) => !s)}
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        variant="ghost"
                        tabIndex={-1}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>
                <HStack width="full" spacing={2}>
                  <Button
                    type="submit"
                    colorScheme="teal"
                    flex={1}
                    isLoading={isLoading}
                    disabled={!password}
                  >
                    Login
                  </Button>
                  <Button
                    onClick={() => setStep('email_setup')}
                    variant="outline"
                    flex={1}
                  >
                    Forgot Password
                  </Button>
                </HStack>
                <Button onClick={handleBackToId} variant="ghost" size="sm">
                  ← Back to ID
                </Button>
              </VStack>
            </form>
          )}

          {/* STEP 3: Email setup for password reset or first-time setup */}
          {step === 'email_setup' && (
            <form onSubmit={handleSendOtp} style={{ width: '100%' }}>
              <VStack spacing={4}>
                <Text fontSize="sm" color={textColor}>
                  {userStatus?.hasEmail 
                    ? "Enter your email to receive a password reset OTP."
                    : "Please provide your email address to set up your account."
                  }
                </Text>
                <FormControl isRequired>
                  <FormLabel>Email Address</FormLabel>
                  <Input
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </FormControl>
                <Button
                  type="submit"
                  colorScheme="teal"
                  width="full"
                  isLoading={isLoading}
                  disabled={!email.trim() || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : (userStatus?.hasEmail ? 'Send Reset OTP' : 'Send Setup OTP')}
                </Button>
                <Button onClick={handleBackToId} variant="ghost" size="sm">
                  ← Back to ID
                </Button>
              </VStack>
            </form>
          )}

          {/* STEP 4: OTP verification and password setup */}
          {step === 'otp_verification' && (
            <form onSubmit={handleVerifyAndSetPassword} style={{ width: '100%' }}>
              <VStack spacing={4}>
                <Text fontSize="sm" color={textColor}>
                  Enter the 6-digit OTP sent to your email.
                </Text>
                <FormControl isRequired>
                  <FormLabel>One-Time Password (OTP)</FormLabel>
                  <Input
                    type="text"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    autoFocus
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Set Password</FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <InputRightElement width="3rem">
                      <IconButton
                        h="1.75rem"
                        size="sm"
                        onClick={() => setShowPassword((s) => !s)}
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        variant="ghost"
                        tabIndex={-1}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>
                <Button
                  type="submit"
                  colorScheme="teal"
                  width="full"
                  isLoading={isLoading}
                  disabled={!otp || !password}
                >
                  Verify & Set Password
                </Button>
                <HStack width="full" spacing={2}>
                  <Button
                    onClick={handleResendOtp}
                    variant="outline"
                    flex={1}
                    isLoading={isLoading}
                    disabled={resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </Button>
                  <Button onClick={handleBackToId} variant="ghost" size="sm">
                    ← Back to ID
                  </Button>
                </HStack>
              </VStack>
            </form>
          )}
          
          {/* STEP 5: Success message */}
          {step === 'success' && (
             <Alert
                status="success"
                variant="subtle"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                textAlign="center"
                py={6}
                borderRadius="md"
              >
                <AlertIcon boxSize="40px" mr={0} />
                <AlertTitle mt={4} mb={1} fontSize="lg">
                    Success!
                </AlertTitle>
                <AlertDescription maxWidth="sm">
                    {message}
                    {typeof window !== 'undefined' && !localStorage.getItem('token') && (
                      <Text mt={2} color="gray.600">
                        Please log in with your new password to continue.
                      </Text>
                    )}
                </AlertDescription>
                 {typeof window !== 'undefined' && !localStorage.getItem('token') ? (
                    <Button mt={5} colorScheme="teal" onClick={() => navigate('/login')}>
                      Go to Login Page
                    </Button>
                  ) : (
                    <Button mt={5} colorScheme="teal" onClick={() => navigate('/dashboard')}>
                      Go to Modules
                    </Button>
                  )}
            </Alert>
          )}
        </VStack>
      </Box>
    </Center>
  );
};

export default LoginPage;