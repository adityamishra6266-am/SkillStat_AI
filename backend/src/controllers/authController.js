// backend/src/controllers/authController.js

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const SALT_ROUNDS = 10;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateToken(user) {
  return jwt.sign(
    // `role` ('user' | 'admin', see the users table's existing
    // `role` column added in migration 002) rides in the JWT itself so
    // authMiddleware can authorize admin routes without an extra DB
    // lookup on every request. user.role is always defined by the time
    // this is called (see register/login below).
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res) {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [fullName, email, hashedPassword]
    );

    await pool.query('INSERT INTO profiles (user_id) VALUES (?)', [result.insertId]);

    // Every account created through public registration is a learner
    // ('user') — the admin role is never self-service; it is granted by
    // promoting an existing account directly in the database (see the
    // existing report for the exact statement). Matches the `role`
    // column's own DEFAULT 'user'.
    const user = { id: result.insertId, name: fullName, email, role: 'user' };
    const token = generateToken(user);

    return res.status(201).json({ success: true, message: 'Account created successfully.', token, user });
  } catch (err) {
    console.error('[Register Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [rows] = await pool.query('SELECT id, name, email, password, role FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken(user);
    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[Login Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
}

async function me(req, res) {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('[Me Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { register, login, me };
