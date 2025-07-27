const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

/**
 * POST /api/auth/register
 *
 * Registers a new user. Expects `username` and `password` in the body. The
 * password is hashed before storage. Responds with a JWT and the username.
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    const existing = await User.findOne({ username: username.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists' });
    }
    const hashed = await bcrypt.hash(password, 10);
    // Determine role: if no users exist yet, grant admin role to first user
    const userCount = await User.estimatedDocumentCount();
    const role = userCount === 0 ? 'admin' : 'user';
    const user = new User({ username: username.toLowerCase().trim(), password: hashed, role });
    await user.save();
    // Include role in JWT payload so clients can know their role
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.status(201).json({ token, username: user.username, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

/**
 * POST /api/auth/login
 *
 * Authenticates a user. Expects `username` and `password` in the body. If
 * the credentials are valid, responds with a JWT and the username.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;