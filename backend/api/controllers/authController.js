const { signToken } = require('../../utils/jwt');
const { spawn } = require('child_process');
const otpGenerator = require('otp-generator');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const SALT_ROUNDS = 10;

const executeSendEmail = (toEmail, otp) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', ['./api/services/send_email.py', toEmail, otp], {
      env: { ...process.env },
    });
    pythonProcess.stdout.on('data', (data) => console.log(`Python Script: ${data}`));
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python Script Error: ${data}`);
      reject(new Error('Failed to send email due to an internal error.'));
    });
    pythonProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Email sending script failed.'));
    });
  });
};

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/** OTP by email (Login no longer uses Chess.com ID). */
exports.sendOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email || req.body.chess_com_id);

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT * FROM "Login" WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: 'This email is not registered.' });
    }

    const otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
      digits: true,
    });
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.query(
      'UPDATE "Login" SET otp = $1, otp_expires_at = $2 WHERE LOWER(email) = LOWER($3)',
      [otp, otp_expires_at, email]
    );
    await executeSendEmail(user.email, otp);
    return res.status(200).json({ message: 'Password reset OTP sent to your registered email.' });
  } catch (err) {
    console.error('Error in sendOtp controller:', err.message);
    return res.status(500).json({ message: 'An internal server error occurred. Please check server logs.' });
  }
};

exports.verifyAndSetPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email || req.body.chess_com_id);
  const { otp, password } = req.body;

  if (!email || !otp || !password) {
    return res.status(400).json({ message: 'Email, OTP and password are required.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ message: 'Password must be at least 4 characters long.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT otp, otp_expires_at FROM "Login" WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (user.otp !== otp || new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    await db.query(
      'UPDATE "Login" SET password = $1, otp = NULL, otp_expires_at = NULL WHERE LOWER(email) = LOWER($2)',
      [hashedPassword, email]
    );

    res.status(200).json({ message: 'Password has been set successfully! You can now proceed.' });
  } catch (err) {
    console.error('Error in verifyAndSetPassword controller:', err);
    res.status(500).json({ message: 'Could not update password due to a server error.' });
  }
};

exports.checkChessId = async (req, res) => {
  const email = normalizeEmail(req.body.email || req.body.chess_com_id);

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT * FROM "Login" WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        message: 'This email is not registered.',
        status: 'not_found',
      });
    }

    if (user.email && user.password) {
      return res.status(200).json({
        message: 'User found with email and password.',
        status: 'has_credentials',
        hasEmail: true,
        hasPassword: true,
      });
    }

    if (user.email && !user.password) {
      return res.status(200).json({
        message: 'User found with email but no password set.',
        status: 'needs_password',
        hasEmail: true,
        hasPassword: false,
      });
    }

    return res.status(200).json({
      message: 'User found but needs email and password setup.',
      status: 'needs_setup',
      hasEmail: false,
      hasPassword: false,
    });
  } catch (err) {
    console.error('Error in checkChessId controller:', err.message);
    return res.status(500).json({ message: 'An internal server error occurred.' });
  }
};

/** Legacy chess_com_id login body → treat as email if it looks like one. */
exports.login = async (req, res) => {
  const id = req.body.chess_com_id || req.body.email;
  const { password } = req.body;

  if (!id || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not configured in environment variables');
    return res.status(500).json({ message: 'Server configuration error. Please contact administrator.' });
  }

  try {
    const email = normalizeEmail(id);
    const { rows } = await db.query(
      `SELECT l.*, s.chess_com_id AS student_chess_com_id
       FROM "Login" l
       LEFT JOIN Students s ON s.login_id = l.id
       WHERE LOWER(l.email) = LOWER($1)
       LIMIT 1`,
      [email]
    );
    const user = rows[0];

    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid credentials or account setup is not complete.' });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const safeUser = {
      id: user.id != null ? String(user.id) : user.email,
      full_name: user.Player_Name || user.email,
      email: user.email || null,
      role: (user.Role || 'student').toLowerCase(),
      chess_com_id: user.student_chess_com_id || null,
    };

    const token = signToken(safeUser, false);
    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Error in login controller:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
