const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user, rememberMe = false) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = {
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    },
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: rememberMe ? '30d' : '7d',
  });
}

function verifyToken(token) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
