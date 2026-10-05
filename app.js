require('express-async-errors'); // must load before the routers below are created
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const parentRoutes = require('./routes/parent');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const paymentsRoutes = require('./routes/payments');

const app = express();

app.use(cors());
// Capturing the raw body alongside the parsed one — the Paystack webhook needs the
// exact raw bytes to check its signature; every other route just uses req.body as normal.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentsRoutes);

// Catches anything thrown or rejected in an async route handler (via express-async-errors
// above) instead of letting it hang the request or crash the process.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

module.exports = app;
