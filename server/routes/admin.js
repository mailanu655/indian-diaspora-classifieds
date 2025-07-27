const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const Post = require('../models/Post');
const User = require('../models/User');

/**
 * Admin posts management
 *
 * GET /api/admin/posts
 * Returns posts filtered by approval status. Admins can specify
 * `approved=false` to retrieve unapproved posts for moderation or
 * `approved=true` to view already approved posts. If the query is omitted,
 * all posts are returned. The user field is populated with the author's
 * username for context.
 */
router.get('/posts', authenticate, adminOnly, async (req, res) => {
  try {
    const { approved } = req.query;
    const filter = {};
    if (approved !== undefined) {
      filter.approved = approved === 'true';
    }
    const posts = await Post.find(filter)
      .populate('user', 'username')
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching posts for admin' });
  }
});

/**
 * PUT /api/admin/posts/:id/approve
 *
 * Approve a specific post. The post's `approved` flag is set to true.
 */
router.put('/posts/:id/approve', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findByIdAndUpdate(id, { approved: true }, { new: true });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while approving post' });
  }
});

/**
 * DELETE /api/admin/posts/:id
 *
 * Permanently remove a post and any associated images. This action cannot be undone.
 */
router.delete('/posts/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    // Remove images from filesystem
    const fs = require('fs');
    const path = require('path');
    if (post.images && post.images.length > 0) {
      await Promise.all(
        post.images.map((img) => {
          const filePath = path.join(__dirname, '..', img);
          return fs.promises.unlink(filePath).catch(() => {});
        })
      );
    }
    await post.remove();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while deleting post' });
  }
});

/**
 * GET /api/admin/users
 *
 * Retrieve all users. Returns each user's username and role. Useful for
 * managing user roles.
 */
router.get('/users', authenticate, adminOnly, async (req, res) => {
  try {
    const users = await User.find({}, 'username role');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
});

/**
 * PUT /api/admin/users/:id
 *
 * Update a user's role. Expects a JSON body with a `role` field set to
 * either 'user' or 'admin'. Returns the updated user object. Prevents
 * demoting the only remaining admin to ensure at least one admin exists.
 */
router.put('/users/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Role must be 'user' or 'admin'" });
    }
    // If demoting an admin, ensure there will remain at least one admin
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role === 'admin' && role === 'user') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res
          .status(400)
          .json({ message: 'Cannot demote the only admin user' });
      }
    }
    user.role = role;
    await user.save();
    res.json({ username: user.username, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while updating user role' });
  }
});

module.exports = router;