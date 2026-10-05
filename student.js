const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

router.use(authenticate, authorize('STUDENT'));

// The logged-in student's own profile
router.get('/me', async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  if (!student) return res.status(404).json({ error: 'No student profile is linked to this account yet.' });
  res.json(student);
});

// The logged-in student's own results
router.get('/results', async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  if (!student) return res.json([]);
  const results = await prisma.result.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(results);
});

// Announcements aimed at this student — everyone, all students, or their own section
router.get('/announcements', async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  const audiences = ['all', 'students'];
  if (student) audiences.push(student.section.toLowerCase());

  const announcements = await prisma.announcement.findMany({
    where: { audience: { in: audiences } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(announcements);
});

module.exports = router;
