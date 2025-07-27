const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

// Load environment variables from .env file if present
require('dotenv').config();

const app = express();
// We'll create the HTTP server manually to attach Socket.IO later
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/classifieds';
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Routes
const postsRouter = require('./routes/posts');
const authRouter = require('./routes/auth');
const commentsRouter = require('./routes/comments');
const adminRouter = require('./routes/admin');
const messagesRouter = require('./routes/messages');
const usersRouter = require('./routes/users');
const subscriptionsRouter = require('./routes/subscriptions');

// Configure Web Push with VAPID keys. The keys should be stored in
// environment variables. If they are not provided, you should
// generate a new key pair and set them in your .env file. See
// https://github.com/web-push-libs/web-push for instructions.
const webpush = require('web-push');
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:example@example.com',
    vapidPublicKey,
    vapidPrivateKey
  );
  app.locals.webpush = webpush;
} else {
  console.warn('VAPID keys are not configured. Push notifications will not work.');
}

// Mount post routes
app.use('/api/posts', postsRouter);
// Mount nested comment routes: these should come after postsRouter so that
// Express can correctly merge parameters (postId) into the comments router.
app.use('/api/posts/:postId/comments', commentsRouter);
// Authentication routes
app.use('/api/auth', authRouter);
// Admin routes
app.use('/api/admin', adminRouter);
// Messages routes
app.use('/api/messages', messagesRouter);
// Users routes for general user listing
app.use('/api/users', usersRouter);
// Push subscription routes
app.use('/api/subscribe', subscriptionsRouter);

// Endpoint to provide the public VAPID key to clients
app.get('/api/vapidPublicKey', (req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Fallback to index.html for any other route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 3000;

// Socket.IO setup for real-time messaging
const { Server } = require('socket.io');
// Allow cross-origin connections for development; adjust as needed for production
const io = new Server(server, { cors: { origin: '*' } });

// Map to store userId -> socket instance for message delivery
const userSockets = new Map();

// Middleware to authenticate socket connections using JWT
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change_this_secret');
    socket.userId = decoded.id;
    socket.username = decoded.username;
    return next();
  } catch (err) {
    return next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  // Store socket in map
  if (socket.userId) {
    userSockets.set(socket.userId.toString(), socket);
  }
  socket.on('disconnect', () => {
    if (socket.userId) {
      userSockets.delete(socket.userId.toString());
    }
  });

  /**
   * Relay typing indicators to the recipient. When a client emits a
   * 'typing' event with a `to` field (the recipient's userId), this
   * handler forwards the event to the recipient if they are connected.
   * The payload includes the sender's ID so the recipient can
   * differentiate who is typing.
   */
  socket.on('typing', ({ to }) => {
    try {
      const recipientId = to && to.toString();
      if (!recipientId || !socket.userId) return;
      const recipientSocket = userSockets.get(recipientId);
      if (recipientSocket) {
        recipientSocket.emit('typing', { from: socket.userId.toString() });
      }
    } catch (err) {
      console.error('Error handling typing event:', err);
    }
  });
});

// Expose io and userSockets to Express routes via app.locals
app.locals.io = io;
app.locals.userSockets = userSockets;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});