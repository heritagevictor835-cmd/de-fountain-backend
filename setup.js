const prisma = require('../src/lib/prisma');

// Wipes every table, in an order that respects foreign keys (leaf tables first).
// Called before each test — point DATABASE_URL (via .env.test) at a THROWAWAY
// database only. Never run this against production data.
async function resetDatabase() {
  await prisma.receipt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.fee.deleteMany();
  await prisma.result.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();
}

module.exports = { resetDatabase };
