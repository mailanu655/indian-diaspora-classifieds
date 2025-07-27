const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const Subscription = require('../models/Subscription');

/**
 * POST /api/subscribe
 *
 * Save or update a Web Push subscription for the authenticated user. The
 * subscription details (endpoint, keys) are stored in the database so
 * that the server can send push notifications later. If the same
 * endpoint already exists for the user, it will be updated.
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'Invalid subscription data' });
    }
    await Subscription.findOneAndUpdate(
      { user: req.user.id, endpoint: subscription.endpoint },
      { ...subscription, user: req.user.id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ message: 'Subscription saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error saving subscription' });
  }
});

/**
 * DELETE /api/subscribe/:id
 *
 * Remove a push subscription belonging to the authenticated user. The
 * `id` parameter is the subscription document ID in MongoDB.
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub || sub.user.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Subscription not found' });
    }
    await sub.remove();
    res.json({ message: 'Subscription removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error removing subscription' });
  }
});

module.exports = router;