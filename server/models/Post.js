const mongoose = require('mongoose');

/**
 * The Post schema defines the structure of each classified post stored in MongoDB.
 * Each post contains:
 *  - content: the text body of the classified
 *  - neighborhood: a string representing the local area or community
 *  - category: a string describing the type of post (e.g., housing, services)
 *  - createdAt: timestamp of when the post was created
 */
const PostSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
  },
  neighborhood: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  category: {
    type: String,
    required: false,
    trim: true,
    lowercase: true,
  },
  // Reference to the user who created this post
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Array of image URLs associated with this post
  images: [
    {
      type: String,
    },
  ],

  // Tags/categories associated with this post. Posts can belong to multiple
  // predefined categories (e.g. Housing, Jobs, Services). When creating
  // new posts, the `tags` array should be provided instead of `category`.
  tags: [
    {
      type: String,
      lowercase: true,
      trim: true,
    },
  ],
  // Whether this post has been approved by an administrator. Unapproved posts
  // are hidden from regular users and only visible in the admin dashboard. New
  // posts created by non-admin users default to false. Admin-created posts
  // are automatically approved.
  approved: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Post', PostSchema);