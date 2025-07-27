const mongoose = require('mongoose');

/**
 * Push subscription schema
 *
 * Stores Web Push subscription information for a user. Each
 * subscription includes an endpoint and cryptographic keys. A user
 * may have multiple subscriptions across different devices or
 * browsers. Subscriptions are used to send push notifications when
 * messages or posts are created.
 */
const SubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  endpoint: {
    type: String,
    required: true,
  },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);