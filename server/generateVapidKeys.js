#!/usr/bin/env node
/*
 * generateVapidKeys.js
 *
 * This utility script generates a VAPID key pair for Web Push.
 * Run it with `node generateVapidKeys.js` in the server directory
 * after installing dependencies. It will output two lines that you
 * can copy into your .env file:
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 */

const webpush = require('web-push');

function generate() {
  const keys = webpush.generateVAPIDKeys();
  console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
  console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
}

generate();