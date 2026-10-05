const express = require('express');
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { CLASSES_BY_SECTION } = require('../lib/schoolStructure');
const { initializeTransaction } = require('../lib/paystack');
const { confirmPayment } = require('../lib/receipts');
const { streamReceiptPdf } = require('../lib/receiptPdf');

const router = express.Router();

router.use(authenticate, authorize('PARENT'));

// List the logged-in parent's own children, with their fees
router.get('/children', async (req, res) => {
  const children = await prisma.student.findMany({
    where: { parentId: req.user.id },
    include: { fees: true },
  });
  res.json(children);
});

// Register a new child
router.post('/children', async (req, res) => {
  const { name, section, className, dateOfBirth } = req.body;

  if (!name || !section || !className || !dateOfBirth) {
    return res.status(400).json({ error: 'Name, section, class and date of birth are all required.' });
  }
  if (!CLASSES_BY_SECTION[section]) {
    return res.status(400).json({ error: 'Section must be NURSERY, PRIMARY or SECONDARY.' });
  }
  if (!CLASSES_BY_SECTION[section].includes(className)) {
    return res.status(400).json({
      error: `"${className}" isn't a class in ${section}. Expected one of: ${CLASSES_BY_SECTION[section].join(', ')}.`,
    });
  }

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return res.status(400).json({ error: 'Date of birth is not a valid date.' });
  }

  const student = await prisma.student.create({
    data: { name, section, className, dateOfBirth: dob, parentId: req.user.id },
  });

  res.status(201).json(student);
});

// All fees across every one of this parent's children, most recent first
router.get('/fees', async (req, res) => {
  const fees = await prisma.fee.findMany({
    where: { student: { parentId: req.user.id } },
    include: { student: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(fees);
});

// Start paying a fee — returns a Paystack checkout link to send the parent to
router.post('/fees/:feeId/pay', async (req, res) => {
  const fee = await prisma.fee.findUnique({
    where: { id: req.params.feeId },
    include: { student: true },
  });

  if (!fee || fee.student.parentId !== req.user.id) {
    return res.status(404).json({ error: 'No fee found with that id.' });
  }
  if (fee.status === 'PAID') {
    return res.status(400).json({ error: 'This fee is already paid.' });
  }

  const parent = await prisma.user.findUnique({ where: { id: req.user.id } });
  // Paystack requires an email even for phone-only accounts — a placeholder is fine,
  // it's only used for Paystack's own transaction record, not for sending anything.
  const email = parent.email || `${parent.phone}@placeholder.defountainacademy.ng`;
  const reference = `DFA-${fee.id.slice(-6)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();

  const transaction = await initializeTransaction({
    email,
    amountKobo: fee.amount,
    reference,
  });

  await prisma.payment.create({
    data: {
      feeId: fee.id,
      amount: fee.amount,
      gateway: 'paystack',
      gatewayReference: reference,
      status: 'pending',
    },
  });

  res.json({ authorizationUrl: transaction.authorization_url, reference });
});

// Called by the frontend once Paystack redirects the parent back
router.get('/payments/verify/:reference', async (req, res) => {
  const result = await confirmPayment(req.params.reference);
  if (!result.found) {
    return res.status(404).json({ error: 'No payment found with that reference.' });
  }
  res.json(result);
});

// Download a receipt as a PDF — only for one of this parent's own children
router.get('/receipts/:id/pdf', async (req, res) => {
  const receipt = await prisma.receipt.findUnique({
    where: { id: req.params.id },
    include: { payment: { include: { fee: { include: { student: true } } } } },
  });

  if (!receipt || receipt.payment.fee.student.parentId !== req.user.id) {
    return res.status(404).json({ error: 'No receipt found with that id.' });
  }

  streamReceiptPdf(res, receipt);
});


// Announcements aimed at this parent — everyone, all parents, or any of their children's sections
router.get('/announcements', async (req, res) => {
  const children = await prisma.student.findMany({
    where: { parentId: req.user.id },
    select: { section: true },
  });
  const sections = [...new Set(children.map((c) => c.section.toLowerCase()))];
  const audiences = ['all', 'parents', ...sections];

  const announcements = await prisma.announcement.findMany({
    where: { audience: { in: audiences } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(announcements);
});

// A specific child's results (read-only)
router.get('/children/:id/results', async (req, res) => {
  const student = await prisma.student.findUnique({ where: { id: req.params.id } });
  if (!student || student.parentId !== req.user.id) {
    return res.status(404).json({ error: "No child found with that id." });
  }
  const results = await prisma.result.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(results);
});

module.exports = router;
