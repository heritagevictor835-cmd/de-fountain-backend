const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

// Creates a user directly in the database (skipping the API) so tests can set up
// exactly the role/state they need without depending on other endpoints working.
async function createUser({ role, name = 'Test User', email, password = 'testpass123' }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({ data: { name, email, passwordHash, role } });
}

module.exports = { createUser };
