const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const authenticate = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Configure multer for file uploads. Files are stored in the `uploads` directory relative to this file.
const upload = multer({
  dest: path.join(__dirname, '../uploads'),
  limits: { fileSize: 5 * 1024 * 1024 }, // limit files to 5 MB each
});

/**
 * GET /api/posts
 *
 * Fetches posts from the database with optional filters. If `neighborhood` or
 * `category` query parameters are present, only posts matching those values
 * (case-insensitive) are returned. Results are sorted by creation time in
 * descending order (most recent first).
 */
router.get('/', async (req, res) => {
  try {
    const { neighborhood, category, userId, q, tags } = req.query;
    const filter = {};
    if (neighborhood) {
      // Use case-insensitive regex for flexible filtering
      filter.neighborhood = new RegExp('^' + neighborhood + '$', 'i');
    }
    // If category is provided, treat it as a tag filter
    if (category) {
      filter.tags = { $in: [new RegExp('^' + category + '$', 'i')] };
    }
    // Filter by multiple tags (comma-separated)
    if (tags) {
      const tagList = String(tags)
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t)
        .map((t) => new RegExp('^' + t + '$', 'i'));
      filter.tags = { $in: tagList };
    }
    if (userId) {
      filter.user = userId;
    }
    if (q) {
      // Perform a case-insensitive search in the content field
      filter.content = new RegExp(q, 'i');
    }
    // Determine current user and admin status by decoding token if provided.
    let currentUserId = null;
    let isAdmin = false;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.id;
        isAdmin = decoded.role === 'admin';
      } catch (err) {
        // ignore invalid token; treat as unauthenticated
      }
    }
    // Build final query conditions array for approval filtering
    const approvalConditions = [];
    if (isAdmin) {
      // Admins see all posts
      approvalConditions.push({});
    } else if (currentUserId) {
      // Authenticated non-admin users see approved posts or their own posts
      approvalConditions.push({ approved: true });
      approvalConditions.push({ user: currentUserId });
    } else {
      // Unauthenticated users only see approved posts
      approvalConditions.push({ approved: true });
    }
    const finalFilter = { $and: [filter, { $or: approvalConditions }] };
    const posts = await Post.find(finalFilter).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching posts' });
  }
});

/**
 * POST /api/posts
 *
 * Creates a new post. Expects `content`, `neighborhood`, and `category` in the
 * request body. Responds with the created post.
 */
router.post('/', authenticate, upload.array('images', 3), async (req, res) => {
  try {
    const { content, neighborhood } = req.body;
    let { category, tags } = req.body;
    if (!content || !neighborhood) {
      return res.status(400).json({ message: 'Content and neighborhood are required' });
    }
    // Normalize tags: can be provided as an array (via multi-select) or a comma-separated string
    let tagList = [];
    if (tags) {
      if (Array.isArray(tags)) {
        tagList = tags.map((t) => String(t).trim().toLowerCase()).filter((t) => t);
      } else {
        tagList = String(tags)
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t);
      }
    } else if (category) {
      // For backward compatibility, fall back to single category
      tagList = [String(category).trim().toLowerCase()];
    }
    // Build image URLs for any uploaded files
    const imageUrls = (req.files || []).map((file) => {
      return '/uploads/' + file.filename;
    });
    const newPost = new Post({
      content,
      neighborhood,
      user: req.user.id,
      images: imageUrls,
      tags: tagList,
      // Store the first tag as category for backward compatibility
      category: tagList.length > 0 ? tagList[0] : undefined,
      // Automatically approve posts created by admins; others require moderation
      approved: req.user.role === 'admin',
    });
    const savedPost = await newPost.save();
    res.status(201).json(savedPost);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while creating post' });
  }
});

/**
 * PUT /api/posts/:id
 *
 * Updates an existing post. Expects the same payload as POST: `content`,
 * `neighborhood`, and `category`. Only fields provided in the request
 * body will be updated. Responds with the updated post.
 */
router.put('/:id', authenticate, upload.array('images', 3), async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    // Ensure only the owner can update
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to edit this post' });
    }
    const updates = {};
    const { content, neighborhood } = req.body;
    let { category, tags } = req.body;
    if (content !== undefined) updates.content = content;
    if (neighborhood !== undefined) updates.neighborhood = neighborhood;
    // Normalize tags if provided
    let tagList = [];
    if (tags) {
      if (Array.isArray(tags)) {
        tagList = tags.map((t) => String(t).trim().toLowerCase()).filter((t) => t);
      } else {
        tagList = String(tags)
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t);
      }
    } else if (category) {
      tagList = [String(category).trim().toLowerCase()];
    }
    if (tagList.length > 0) {
      updates.tags = tagList;
      updates.category = tagList[0];
    }
    // If new files are uploaded, replace existing images with new ones
    if (req.files && req.files.length > 0) {
      updates.images = req.files.map((file) => '/uploads/' + file.filename);
    }
    const updated = await Post.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while updating post' });
  }
});

/**
 * DELETE /api/posts/:id
 *
 * Deletes a post by its ID. Responds with a success message when completed.
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    // Ensure only the owner can delete
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to delete this post' });
    }
    // Remove associated images from the filesystem
    const fs = require('fs');
    const path = require('path');
    if (post.images && post.images.length > 0) {
      await Promise.all(
        post.images.map((img) => {
          // img is like '/uploads/<filename>'
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

module.exports = router;