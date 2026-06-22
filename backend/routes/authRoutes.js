const express = require('express');
const emailAuth = require('../controllers/authController');
const chessAuth = require('../api/controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Chess.com ID flow (Login table)
router.post('/auth/check-chess-id', chessAuth.checkChessId);
router.post('/auth/send-otp', chessAuth.sendOtp);
router.post('/auth/verify-set-password', chessAuth.verifyAndSetPassword);

// Unified login: email/password or chess_com_id/password (both use Login table)
router.post('/auth/login', (req, res) => {
  if (req.body?.chess_com_id) {
    return chessAuth.login(req, res);
  }
  return emailAuth.login(req, res);
});

router.post('/auth/logout', authenticate, emailAuth.logout);
router.get('/auth/me', authenticate, emailAuth.me);

module.exports = router;
