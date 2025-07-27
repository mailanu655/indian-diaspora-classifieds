const mongoose = require('mongoose');

/**
 * Comment model
 *
 * Comments are simple text annotations on posts created by authenticated users. Each comment
 * references the post it belongs to and the user who authored it. Timestamps are automatically
 * generated via Mongoose's `timestamps` option. The model includes a `content` field for the
 * comment text, a `user` reference to the User model, and a `post` reference to the Post model.
 */
const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);