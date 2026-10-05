const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { resetDatabase } = require('./setup');
const { createUser } = require('./helpers');

function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Child registration', () => {
  test('accepts a valid section and class', async () => {
    const parent = await createUser({ role: 'PARENT', email: 'validreg@example.com' });
    const res = await request(app)
      .post('/api/parent/children')
      .set('Authorization', `Bearer ${tokenFor(parent)}`)
      .send({ name: 'Test Child', section: 'PRIMARY', className: 'Primary 3', dateOfBirth: '2015-05-01' });
    expect(res.status).toBe(201);
  });

  test('rejects a class that does not belong to the given section', async () => {
    const parent = await createUser({ role: 'PARENT', email: 'invalidreg@example.com' });
    const res = await request(app)
      .post('/api/parent/children')
      .set('Authorization', `Bearer ${tokenFor(parent)}`)
      .send({ name: 'Test Child', section: 'PRIMARY', className: 'JSS 1', dateOfBirth: '2015-05-01' });
    expect(res.status).toBe(400);
  });

  test('rejects a missing date of birth', async () => {
    const parent = await createUser({ role: 'PARENT', email: 'nodob@example.com' });
    const res = await request(app)
      .post('/api/parent/children')
      .set('Authorization', `Bearer ${tokenFor(parent)}`)
      .send({ name: 'Test Child', section: 'PRIMARY', className: 'Primary 3' });
    expect(res.status).toBe(400);
  });
});

describe('Fee creation', () => {
  test('rejects a non-positive amount', async () => {
    const admin = await createUser({ role: 'ADMIN', email: 'feeadmin@example.com' });
    const parent = await createUser({ role: 'PARENT', email: 'feeparent@example.com' });
    const student = await prisma.student.create({
      data: {
        name: 'Fee Test Child',
        section: 'PRIMARY',
        className: 'Primary 3',
        dateOfBirth: new Date('2015-01-01'),
        parentId: parent.id,
      },
    });

    const res = await request(app)
      .post('/api/admin/fees')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ studentId: student.id, term: '2026 Term 1', description: 'Term fee', amountNaira: -500 });
    expect(res.status).toBe(400);
  });
});
