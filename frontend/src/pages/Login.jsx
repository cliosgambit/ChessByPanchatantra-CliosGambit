import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Box,
  Card,
  CardBody,
  Heading,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';

function Login() {
  const { isAuthenticated, user, isAuthLoading } = useAuth();

  const pageBg = useColorModeValue('navy.800', 'navy.900');
  const cardBg = useColorModeValue('rgba(255,255,255,0.92)', 'rgba(15,23,41,0.88)');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const cardBorderColor = useColorModeValue('rgba(201,162,39,0.35)', 'gold.600');

  if (isAuthLoading) {
    return null;
  }

  if (isAuthenticated && user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
      py={10}
      bgGradient={`linear(135deg, ${pageBg} 0%, #1a2744 50%, ${pageBg} 100%)`}
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        w="420px"
        h="420px"
        borderRadius="full"
        bg="gold.500"
        opacity={0.08}
        filter="blur(80px)"
        top="-80px"
        right="-80px"
      />
      <Box
        position="absolute"
        w="360px"
        h="360px"
        borderRadius="full"
        bg="teal.400"
        opacity={0.06}
        filter="blur(70px)"
        bottom="-60px"
        left="-60px"
      />

      <Card
        as={motion.div}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        w="100%"
        maxW="440px"
        bg={cardBg}
        backdropFilter="blur(16px)"
        borderWidth="1px"
        borderColor={cardBorderColor}
        boxShadow="2xl"
        borderRadius="2xl"
      >
        <CardBody p={{ base: 6, md: 8 }}>
          <Heading
            size="lg"
            textAlign="center"
            mb={1}
            bgGradient="linear(to-r, gold.400, gold.600)"
            bgClip="text"
          >
            Chess By Panchatantra
          </Heading>
          <Text textAlign="center" fontSize="sm" color={subColor} mb={8}>
            Sign in with your email and password
          </Text>
          <LoginForm />
        </CardBody>
      </Card>
    </Box>
  );
}

export default Login;
