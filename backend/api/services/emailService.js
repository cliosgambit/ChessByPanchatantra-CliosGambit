const nodemailer = require('nodemailer');

function getMailConfig() {
  const user = (process.env.GMAIL_USER || '').trim().replace(/^["']|["']$/g, '');
  // Gmail app passwords are often stored with spaces; SMTP expects them stripped
  const pass = (process.env.GMAIL_APP_PASS || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '');

  return { user, pass };
}

function createTransporter() {
  const { user, pass } = getMailConfig();

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASS must be set in environment variables.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

/**
 * Send a password-reset OTP email.
 * @param {string} toEmail
 * @param {string} otp
 */
async function sendOtpEmail(toEmail, otp) {
  const { user } = getMailConfig();
  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: `"Clio's Gambit" <${user}>`,
    to: toEmail,
    subject: "Your Clio's Gambit password reset code",
    text: [
      `Your one-time password (OTP) is: ${otp}`,
      '',
      'This code expires in 10 minutes.',
      'If you did not request a password reset, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; color: #111;">
        <h2 style="margin: 0 0 12px; color: #e62e2d;">Clio's Gambit</h2>
        <p style="margin: 0 0 16px;">Use this code to reset your password:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 0 0 16px;">${otp}</p>
        <p style="margin: 0; color: #555; font-size: 14px;">This code expires in 10 minutes.</p>
      </div>
    `,
  });

  return info;
}

/**
 * Verify SMTP credentials without sending a message.
 */
async function verifyMailTransport() {
  const transporter = createTransporter();
  await transporter.verify();
  return true;
}

module.exports = {
  sendOtpEmail,
  verifyMailTransport,
  getMailConfig,
};
