const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const Message = require('../models/Message');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

/**
 * Utility function to build a conversation summary for the current user.
 * It takes an array of messages (already populated and sorted from
 * newest to oldest) and aggregates them into conversation objects
 * keyed by the other user's ID. Each conversation includes the
 * other user's id and username, the last message content and
 * timestamp, and the number of unread messages the current user
 * has from that conversation.
 *
 * @param {ObjectId} currentUserId
 * @param {Array} messages
 * @returns {Array} conversation summaries sorted by lastTime
 */
function buildConversationSummaries(currentUserId, messages) {
  const convMap = new Map();
  messages.forEach((msg) => {
    // Determine the other participant's id and username
    const senderId = msg.sender._id.toString();
    const recipientId = msg.recipient._id.toString();
    const isCurrentSender = senderId === currentUserId;
    const otherUser = isCurrentSender ? msg.recipient : msg.sender;
    const otherId = otherUser._id.toString();
    // Initialize conversation entry if not exists
    if (!convMap.has(otherId)) {
      convMap.set(otherId, {
        otherId: otherId,
        otherUsername: otherUser.username,
        lastMessage: msg.content,
        lastTime: msg.createdAt,
        unreadCount: 0,
      });
    }
    const conv = convMap.get(otherId);
    // Update last message/time only if this message is newer than the recorded one
    if (msg.createdAt > conv.lastTime) {
      conv.lastMessage = msg.content;
      conv.lastTime = msg.createdAt;
    }
    // Increment unread count if current user is recipient and message is unread
    if (!msg.read && recipientId === currentUserId && senderId === otherId) {
      conv.unreadCount += 1;
    }
  });
  // Convert to array and sort by lastTime descending
  return Array.from(convMap.values()).sort((a, b) => b.lastTime - a.lastTime);
}

/**
 * GET /api/conversations
 *
 * Retrieve a list of conversation summaries for the authenticated user. Each
 * summary includes the other user's ID and username, the content and
 * timestamp of the most recent message exchanged, and the number of
 * unread messages from that user. Conversations are sorted by the
 * timestamp of the last message, newest first.
 */
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    // Fetch all messages involving the user, newest first
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { recipient: currentUserId }],
    })
      .populate('sender', 'username')
      .populate('recipient', 'username')
      .sort({ createdAt: -1 });
    const summaries = buildConversationSummaries(currentUserId, messages);
    res.json(summaries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching conversations' });
  }
});

/**
 * PUT /api/messages/read
 *
 * Mark all messages from the specified user as read by the authenticated
 * user. The `with` query parameter specifies the other user's ID. Only
 * messages where the authenticated user is the recipient and the other
 * user is the sender are updated.
 */
router.put('/read', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { with: otherId } = req.query;
    if (!otherId) {
      return res.status(400).json({ message: 'Missing other user ID in query parameter "with"' });
    }
    const result = await Message.updateMany(
      { sender: otherId, recipient: currentUserId, read: false },
      { $set: { read: true } }
    );
    // Emit a read receipt event to the other user via Socket.IO
    const io = req.app.locals.io;
    const userSockets = req.app.locals.userSockets || new Map();
    if (io) {
      const otherSocket = userSockets.get(otherId.toString());
      if (otherSocket) {
        otherSocket.emit('messagesRead', { from: currentUserId.toString() });
      }
    }
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while marking messages as read' });
  }
});

/**
 * GET /api/messages
 *
 * Retrieve messages between the authenticated user and another user. The
 * `with` query parameter specifies the other user's ID. Messages are
 * returned in ascending order by creation time. If `with` is not
 * provided, all messages involving the current user (either as sender or
 * recipient) are returned.
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { with: other } = req.query;
    let filter;
    if (other) {
      filter = {
        $or: [
          { sender: currentUserId, recipient: other },
          { sender: other, recipient: currentUserId },
        ],
      };
    } else {
      filter = {
        $or: [{ sender: currentUserId }, { recipient: currentUserId }],
      };
    }
    const messages = await Message.find(filter)
      .populate('sender', 'username')
      .populate('recipient', 'username')
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching messages' });
  }
});

/**
 * POST /api/messages
 *
 * Send a new message from the authenticated user to a recipient. Expects
 * `recipient` (user ID) and `content` in the request body. After saving
 * the message, notifies both sender and recipient in real time via
 * Socket.IO (if connected). Returns the created message with populated
 * user fields.
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { recipient, content } = req.body;
    if (!recipient || !content || !content.trim()) {
      return res.status(400).json({ message: 'Recipient and content are required' });
    }
    // Ensure recipient exists
    const recipUser = await User.findById(recipient);
    if (!recipUser) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    const msg = new Message({ sender: senderId, recipient, content: content.trim() });
    const saved = await msg.save();
    await saved.populate('sender', 'username');
    await saved.populate('recipient', 'username');
    // Emit real-time event to recipient and sender if sockets exist
    const io = req.app.locals.io;
    const userSockets = req.app.locals.userSockets || new Map();
    if (io) {
      const recipientSocket = userSockets.get(recipient.toString());
      if (recipientSocket) {
        recipientSocket.emit('newMessage', saved);
      }
      const senderSocket = userSockets.get(senderId.toString());
      if (senderSocket) {
        senderSocket.emit('newMessage', saved);
      }
    }

    // Send a push notification if the recipient has registered a subscription and
    // is not currently connected via WebSocket (to avoid duplicate alerts).
    try {
      const recipientConnected = userSockets.get(recipient.toString());
      // Only send a push when the recipient is offline (no active socket)
      if (!recipientConnected) {
        const webpush = req.app.locals.webpush;
        if (webpush) {
          const subs = await Subscription.find({ user: recipient });
          const payload = JSON.stringify({
            title: `New message from ${saved.sender.username}`,
            body:
              saved.content.length > 100
                ? saved.content.substring(0, 100) + '...'
                : saved.content,
          });
          for (const sub of subs) {
            try {
              await webpush.sendNotification(sub, payload);
            } catch (err) {
              console.error('Error sending push notification:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Push notification handling failed:', err);
    }
    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while sending message' });
  }
});

module.exports = router;