// NEW IMPORT for JWT
const jwt = require('jsonwebtoken');

const { spawn } = require('child_process');
const otpGenerator = require('otp-generator');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const SALT_ROUNDS = 10;

// Helper to run the Python email script (Your working version)
const executeSendEmail = (toEmail, otp) => {
    return new Promise((resolve, reject) => {
        // NOTE: Make sure this path is correct relative to your server's root.
        // If server.js is in backend/, and services is in backend/api/services, this path is correct.
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

// 1. Send OTP (Your working version - UNCHANGED)
exports.sendOtp = async (req, res) => {
    const { chess_com_id: id, email: userEmailInput } = req.body;

    if (!id) {
        return res.status(400).json({ message: "Chess.com ID is required." });
    }

    try {
        const { rows } = await db.query('SELECT * FROM "Login" WHERE LOWER("Chess_com_ID") = LOWER($1)', [id]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: "This Chess.com ID is not registered in our program." });
        }

        const otp = otpGenerator.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false, digits: true });
        const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);

        if (user.email === null && user.password === null) {
            if (!userEmailInput) {
                return res.status(400).json({ message: "Email is required for your first-time login." });
            }
            await db.query(
                'UPDATE "Login" SET email = $1, otp = $2, otp_expires_at = $3 WHERE LOWER("Chess_com_ID") = LOWER($4)',
                [userEmailInput, otp, otp_expires_at, id]
            );
            await executeSendEmail(userEmailInput, otp);
            return res.status(200).json({ message: `OTP sent to ${userEmailInput} for first-time login.` });
        }

        // --- EMAIL VERIFICATION FOR PASSWORD RESET ---
        if (user.email && userEmailInput && user.email !== userEmailInput) {
            return res.status(400).json({ message: "Email does not match our records. Please use your registered email address." });
        }

        await db.query(
            'UPDATE "Login" SET otp = $1, otp_expires_at = $2 WHERE LOWER("Chess_com_ID") = LOWER($3)',
            [otp, otp_expires_at, id]
        );
        await executeSendEmail(user.email, otp);
        return res.status(200).json({ message: `Password reset OTP sent to your registered email.` });

    } catch (err) {
        console.error("Error in sendOtp controller:", err.message);
        return res.status(500).json({ message: "An internal server error occurred. Please check server logs." });
    }
};

// 2. Verify OTP and Set/Reset Password (Your working version - UNCHANGED)
exports.verifyAndSetPassword = async (req, res) => {
    const { chess_com_id: id, otp, password } = req.body;

    if (!otp || !password) {
        return res.status(400).json({ message: "OTP and password are required." });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    try {
        const { rows } = await db.query('SELECT otp, otp_expires_at FROM "Login" WHERE LOWER("Chess_com_ID") = LOWER($1)', [id]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        if (user.otp !== otp || new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ message: "Invalid or expired OTP. Please request a new one." });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query(
            'UPDATE "Login" SET password = $1, otp = NULL, otp_expires_at = NULL WHERE LOWER("Chess_com_ID") = LOWER($2)',
            [hashedPassword, id]
        );

        res.status(200).json({ message: "Password has been set successfully! You can now proceed." });

    } catch (err) {
        console.error("Error in verifyAndSetPassword controller:", err);
        res.status(500).json({ message: "Could not update password due to a server error." });
    }
};

// --- NEW FUNCTION ---
// 3. Check chess.com ID status
exports.checkChessId = async (req, res) => {
    const { chess_com_id: id } = req.body;

    if (!id) {
        return res.status(400).json({ message: "Chess.com ID is required." });
    }

    try {
        const { rows } = await db.query('SELECT * FROM "Login" WHERE LOWER("Chess_com_ID") = LOWER($1)', [id]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ 
                message: "This Chess.com ID is not registered in our program.",
                status: "not_found"
            });
        }

        // Check if user has email and password set
        if (user.email && user.password) {
            return res.status(200).json({ 
                message: "User found with email and password.",
                status: "has_credentials",
                hasEmail: true,
                hasPassword: true
            });
        }

        // Check if user has email but no password
        if (user.email && !user.password) {
            return res.status(200).json({ 
                message: "User found with email but no password set.",
                status: "needs_password",
                hasEmail: true,
                hasPassword: false
            });
        }

        // User exists but has no email or password
        return res.status(200).json({ 
            message: "User found but needs email and password setup.",
            status: "needs_setup",
            hasEmail: false,
            hasPassword: false
        });

    } catch (err) {
        console.error("Error in checkChessId controller:", err.message);
        return res.status(500).json({ message: "An internal server error occurred." });
    }
};

// 4. Login for existing users with a password
exports.login = async (req, res) => {
    const { chess_com_id: id, password } = req.body;

    if (!id || !password) {
        return res.status(400).json({ message: "Chess.com ID and password are required." });
    }

    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is not configured in environment variables");
        return res.status(500).json({ message: "Server configuration error. Please contact administrator." });
    }

    try {
        console.log(`Login attempt for chess.com ID: ${id}`);
        
        // Fetch the user, including their Role
        const { rows } = await db.query('SELECT * FROM "Login" WHERE LOWER("Chess_com_ID") = LOWER($1)', [id]);
        const user = rows[0];

        // Check if user exists and has a password set
        if (!user || !user.password) {
            console.log(`Login failed: User not found or no password set for ID: ${id}`);
            return res.status(401).json({ message: "Invalid credentials or account setup is not complete." });
        }

        // Compare provided password with the stored hashed password
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            console.log(`Login failed: Invalid password for ID: ${id}`);
            return res.status(401).json({ message: "Invalid credentials." });
        }

        console.log(`Login successful for ID: ${id}, Role: ${user.Role}`);

        // If credentials are correct, create a JWT payload
        const payload = {
            user: {
                id: user.Chess_com_ID,
                role: user.Role || 'student', // Default to 'student' if Role is null
            },
        };

        // Sign the token and send it to the client
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' }, // Token will be valid for 7 days
            (err, token) => {
                if (err) {
                    console.error("JWT signing error:", err);
                    return res.status(500).json({ message: "Token generation failed." });
                }
                console.log(`JWT token generated successfully for ID: ${id}`);
                res.json({ token });
            }
        );

    } catch (err) {
        console.error("Error in login controller:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};