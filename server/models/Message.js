const mongoose = require('mongoose');

/**
 * Message schema
 *
 * Direct messages between users consist of a sender, a recipient, the
 * textual content, and a timestamp. Messages are stored for both
 * participants and can be queried by either user.
 */
const MessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * Indicates whether the recipient has read this message. Messages
     * are marked as unread by default when first created. Once the
     * recipient opens the conversation, all unread messages from the
     * other participant are marked as read.
     */
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', MessageSchema);