const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { passwordError } = require('../lib/validation');

const router = express.Router();

// A modest brute-force guard on registration/login attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please wait a few minutes and try again.' },
});
router.use(authLimiter);

// Register a new Parent account.
// Student, Admin and Super Admin accounts are created by staff, not self-registration —
// see src/routes/admin.js.
router.post('/register/parent', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !password || (!email && !phone)) {
    return res.status(400).json({ error: 'Name, password and an email or phone number are required.' });
  }
  const pwError = passwordError(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, phone, passwordHash, role: 'PARENT' },
    });
    return res.status(201).json({ id: user.id, name: user.name, role: user.role });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with that email or phone already exists.' });
    }
    throw err; // picked up by the global error handler in src/app.js
  }
});

// Shared login for every role — the account's own role decides what it can reach next.
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body; // identifier = email or phone
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Please provide your email/phone and password.' });
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
  });
  if (!user) {
    return res.status(401).json({ error: 'Incorrect login details.' });
  }
  if (!user.active) {
    return res.status(403).json({ error: 'This account has been deactivated. Contact a school administrator.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect login details.' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

module.exports = router;
