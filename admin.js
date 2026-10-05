const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { streamReceiptPdf } = require('../lib/receiptPdf');
const { SAFE_USER_SELECT } = require('../lib/safeSelect');
const { passwordError } = require('../lib/validation');
const { CLASSES_BY_SECTION } = require('../lib/schoolStructure');

const router = express.Router();

// Every route below requires an Admin or Super Admin login
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

// List students — optionally filtered by ?section= and/or ?className=
router.get('/students', async (req, res) => {
  const { section, className } = req.query;
  const where = {};
  if (section) where.section = section;
  if (className) where.className = className;

  const students = await prisma.student.findMany({
    where,
    include: { parent: { select: SAFE_USER_SELECT } },
    orderBy: { name: 'asc' },
  });
  res.json(students);
});

// One student's full detail
router.get('/students/:id', async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: {
      parent: { select: SAFE_USER_SELECT },
      fees: true,
      results: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!student) return res.status(404).json({ error: 'No student found with that id.' });
  res.json(student);
});

// Correct a student's details
router.patch('/students/:id', async (req, res) => {
  const { name, section, className, dateOfBirth } = req.body;
  const student = await prisma.student.findUnique({ where: { id: req.params.id } });
  if (!student) return res.status(404).json({ error: 'No student found with that id.' });

  const data = {};
  if (name) data.name = name;

  if (section) {
    if (!CLASSES_BY_SECTION[section]) {
      return res.status(400).json({ error: 'Section must be NURSERY, PRIMARY or SECONDARY.' });
    }
    data.section = section;
  }

  if (className) {
    const effectiveSection = data.section || student.section;
    if (!CLASSES_BY_SECTION[effectiveSection].includes(className)) {
      return res.status(400).json({
        error: `"${className}" isn't a class in ${effectiveSection}. Expected one of: ${CLASSES_BY_SECTION[effectiveSection].join(', ')}.`,
      });
    }
    data.className = className;
  }

  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      return res.status(400).json({ error: 'Date of birth is not a valid date.' });
    }
    data.dateOfBirth = dob;
  }

  const updated = await prisma.student.update({ where: { id: student.id }, data });
  res.json(updated);
});

// List parent accounts, with their children
router.get('/parents', async (req, res) => {
  const parents = await prisma.user.findMany({
    where: { role: 'PARENT' },
    select: { ...SAFE_USER_SELECT, children: true },
    orderBy: { name: 'asc' },
  });
  res.json(parents);
});

// Give a student their own portal login, linked to their existing student record
router.post('/students/:id/create-login', async (req, res) => {
  const { password, email, phone } = req.body;
  const student = await prisma.student.findUnique({ where: { id: req.params.id } });
  if (!student) return res.status(404).json({ error: 'No student found with that id.' });
  if (student.userId) return res.status(400).json({ error: 'This student already has a login.' });
  if (!email && !phone) {
    return res.status(400).json({ error: 'An email or phone number is required.' });
  }
  const pwError = passwordError(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: student.name, email, phone, passwordHash, role: 'STUDENT' },
  });
  await prisma.student.update({ where: { id: student.id }, data: { userId: user.id } });

  res.status(201).json({ id: user.id, name: user.name, role: user.role });
});

// Raise a fee for a student — amount is entered in naira and stored in kobo
router.post('/fees', async (req, res) => {
  const { studentId, term, description, amountNaira } = req.body;

  if (!studentId || !term || !description || !amountNaira) {
    return res.status(400).json({ error: 'studentId, term, description and amountNaira are all required.' });
  }
  if (typeof amountNaira !== 'number' || amountNaira <= 0) {
    return res.status(400).json({ error: 'amountNaira must be a positive number.' });
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    return res.status(404).json({ error: 'No student found with that id.' });
  }

  const fee = await prisma.fee.create({
    data: {
      studentId,
      term,
      description,
      amount: Math.round(amountNaira * 100), // naira -> kobo
    },
  });

  res.status(201).json(fee);
});

// List every fee raised across the school, most recent first
router.get('/fees', async (req, res) => {
  const fees = await prisma.fee.findMany({
    include: { student: { include: { parent: { select: SAFE_USER_SELECT } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(fees);
});

// Record a fee paid outside Paystack (cash, bank transfer at the school office, etc.)
// — kept consistent with the online flow: it still produces a Payment and a Receipt.
router.post('/fees/:id/mark-paid', async (req, res) => {
  const fee = await prisma.fee.findUnique({ where: { id: req.params.id } });
  if (!fee) return res.status(404).json({ error: 'No fee found with that id.' });
  if (fee.status === 'PAID') return res.status(400).json({ error: 'This fee is already marked paid.' });

  const reference = `MANUAL-${fee.id.slice(-6)}-${Date.now().toString(36)}`.toUpperCase();

  const receipt = await prisma.$transaction(async (tx) => {
    await tx.fee.update({ where: { id: fee.id }, data: { status: 'PAID' } });
    const payment = await tx.payment.create({
      data: {
        feeId: fee.id,
        amount: fee.amount,
        gateway: 'manual',
        gatewayReference: reference,
        status: 'successful',
      },
    });
    return tx.receipt.create({
      data: { paymentId: payment.id, receiptNumber: `DFA-${payment.id.slice(-8).toUpperCase()}` },
    });
  });

  res.status(201).json({ reference, receipt });
});

// List every payment recorded, most recent first
router.get('/payments', async (req, res) => {
  const payments = await prisma.payment.findMany({
    include: { fee: { include: { student: true } }, receipt: true },
    orderBy: { paidAt: 'desc' },
  });
  res.json(payments);
});

// Reprint any receipt by id
router.get('/receipts/:id/pdf', async (req, res) => {
  const receipt = await prisma.receipt.findUnique({
    where: { id: req.params.id },
    include: { payment: { include: { fee: { include: { student: true } } } } },
  });
  if (!receipt) return res.status(404).json({ error: 'No receipt found with that id.' });
  streamReceiptPdf(res, receipt);
});

// Post a result for a student
router.post('/results', async (req, res) => {
  const { studentId, subject, term, score } = req.body;
  if (!studentId || !subject || !term || score === undefined) {
    return res.status(400).json({ error: 'studentId, subject, term and score are all required.' });
  }
  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'score must be a non-negative number.' });
  }
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return res.status(404).json({ error: 'No student found with that id.' });

  const result = await prisma.result.create({ data: { studentId, subject, term, score } });
  res.status(201).json(result);
});

// A specific student's results, for staff review
router.get('/students/:id/results', async (req, res) => {
  const results = await prisma.result.findMany({
    where: { studentId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(results);
});

// Post an announcement — audience is who should see it
router.post('/announcements', async (req, res) => {
  const { title, body, audience } = req.body;
  const validAudiences = ['all', 'parents', 'students', 'nursery', 'primary', 'secondary'];
  if (!title || !body || !audience) {
    return res.status(400).json({ error: 'title, body and audience are all required.' });
  }
  if (!validAudiences.includes(audience)) {
    return res.status(400).json({ error: `audience must be one of: ${validAudiences.join(', ')}.` });
  }
  const announcement = await prisma.announcement.create({
    data: { title, body, audience, postedById: req.user.id },
  });
  res.status(201).json(announcement);
});

// List every announcement posted, most recent first
router.get('/announcements', async (req, res) => {
  const announcements = await prisma.announcement.findMany({
    include: { postedBy: { select: SAFE_USER_SELECT } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(announcements);
});

// --- Super Admin only, from here down ---

// Create an Admin or Super Admin account
router.post('/staff', authorize('SUPER_ADMIN'), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Role must be ADMIN or SUPER_ADMIN.' });
  }
  const pwError = passwordError(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await prisma.user.create({ data: { name, email, passwordHash, role } });
  res.status(201).json({ id: staff.id, name: staff.name, role: staff.role });
});

// List every Admin and Super Admin account
router.get('/staff', authorize('SUPER_ADMIN'), async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: SAFE_USER_SELECT,
    orderBy: { name: 'asc' },
  });
  res.json(staff);
});

// Activate or deactivate a staff account — revokes access immediately, even on an
// unexpired token, because authenticate() checks this flag against the database.
router.patch('/staff/:id', authorize('SUPER_ADMIN'), async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false.' });
  }

  const staffMember = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!staffMember || !['ADMIN', 'SUPER_ADMIN'].includes(staffMember.role)) {
    return res.status(404).json({ error: 'No staff account found with that id.' });
  }
  if (staffMember.id === req.user.id && active === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }

  const updated = await prisma.user.update({ where: { id: staffMember.id }, data: { active } });
  res.json({ id: updated.id, name: updated.name, role: updated.role, active: updated.active });
});

// School-wide financial summary
router.get('/reports/summary', authorize('SUPER_ADMIN'), async (req, res) => {
  const [feesRaised, feesPaid, feesPending, studentCount] = await Promise.all([
    prisma.fee.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.fee.aggregate({ _sum: { amount: true }, _count: true, where: { status: 'PAID' } }),
    prisma.fee.aggregate({ _sum: { amount: true }, _count: true, where: { status: 'PENDING' } }),
    prisma.student.count(),
  ]);

  const toNaira = (kobo) => (kobo || 0) / 100;

  res.json({
    students: studentCount,
    fees: {
      raisedCount: feesRaised._count,
      raisedNaira: toNaira(feesRaised._sum.amount),
      paidCount: feesPaid._count,
      paidNaira: toNaira(feesPaid._sum.amount),
      pendingCount: feesPending._count,
      pendingNaira: toNaira(feesPending._sum.amount),
    },
  });
});

module.exports = router;
