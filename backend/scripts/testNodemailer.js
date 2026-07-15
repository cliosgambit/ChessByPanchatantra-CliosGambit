/**
 * One-off SMTP check: verifies Gmail credentials, then sends a test OTP email
 * to GMAIL_USER (or TEST_TO_EMAIL if set).
 *
 * Usage: node scripts/testNodemailer.js
 */
require('dotenv').config();
const { sendOtpEmail, verifyMailTransport, getMailConfig } = require('../api/services/emailService');

async function main() {
  const { user } = getMailConfig();
  const to = (process.env.TEST_TO_EMAIL || user || '').trim();

  if (!to) {
    console.error('No recipient: set GMAIL_USER or TEST_TO_EMAIL');
    process.exit(1);
  }

  console.log('Verifying SMTP transport...');
  await verifyMailTransport();
  console.log('SMTP OK');

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  console.log(`Sending test OTP email to ${to}...`);
  const info = await sendOtpEmail(to, otp);
  console.log('Email sent:', {
    messageId: info.messageId,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
  });
  console.log(`Test OTP was: ${otp}`);
}

main().catch((err) => {
  console.error('Nodemailer test failed:', err.message);
  process.exit(1);
});
