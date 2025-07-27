const express = require('express');
const router = express.Router({ mergeParams: true });
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const authenticate = require('../middleware/auth');

/**
 * GET /api/posts/:postId/comments
 *
 * Fetch all comments associated with a given post. Returns comments in ascending
 * order of creation (oldest first) so that conversations read naturally. The
 * response includes the comment's author username via population.
 */
router.get('/', async (req, res) => {
  try {
    const { postId } = req.params;
    // Ensure the post exists before fetching comments
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    // Populate user fields for comments to send username to clients
    const comments = await Comment.find({ post: postId })
      .populate('user', 'username')
      .sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching comments' });
  }
});

/**
 * POST /api/posts/:postId/comments
 *
 * Create a new comment on a post. Requires authentication. Expects a JSON
 * body with a `content` field. Returns the created comment with populated
 * user information.
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }
    // Ensure the post exists before creating a comment
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    const comment = new Comment({
      content: content.trim(),
      user: req.user.id,
      post: postId,
    });
    const saved = await comment.save();
    // Populate the user field for the newly created comment
    await saved.populate('user', 'username');
    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while creating comment' });
  }
});

module.exports = router;