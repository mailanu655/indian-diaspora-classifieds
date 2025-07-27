const mongoose = require('mongoose');

/**
 * User schema for authentication. Stores a username and a hashed password.
 * The username must be unique. Passwords should be hashed using bcrypt
 * before saving. See `routes/auth.js` for registration logic.
 */
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  // Role of the user: can be 'user' or 'admin'. Admins have access to moderation endpoints.
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
});

module.exports = mongoose.model('User', UserSchema);