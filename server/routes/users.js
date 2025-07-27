const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const User = require('../models/User');

/**
 * GET /api/users
 *
 * Return a list of all users (id and username). Only accessible to
 * authenticated users. The requesting user is included in the list,
 * allowing clients to choose conversation partners or display their own
 * information.
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const users = await User.find({}, 'username');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
});

module.exports = router;