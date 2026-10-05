const express = require('express');
const crypto = require('crypto');
const { confirmPayment } = require('../lib/receipts');

const router = express.Router();

// Paystack calls this directly, with no login of ours — it's trusted by signature instead.
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.rawBody || Buffer.from(JSON.stringify(req.body)))
    .digest('hex');

  if (!signature || signature !== expected) {
    return res.status(401).send('Invalid signature');
  }

  // Acknowledge immediately — Paystack expects a fast response and retries if it doesn't get one.
  res.sendStatus(200);

  if (req.body.event === 'charge.success') {
    try {
      await confirmPayment(req.body.data.reference);
    } catch (err) {
      console.error('Webhook confirmPayment failed:', err);
    }
  }
});

module.exports = router;
