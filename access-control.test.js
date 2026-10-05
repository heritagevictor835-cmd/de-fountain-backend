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

describe('Role-based access control', () => {
  test('a parent token cannot reach admin routes', async () => {
    const parent = await createUser({ role: 'PARENT', email: 'p1@example.com' });
    const res = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${tokenFor(parent)}`);
    expect(res.status).toBe(403);
  });

  test('a student token cannot reach parent routes', async () => {
    const student = await createUser({ role: 'STUDENT', email: 's1@example.com' });
    const res = await request(app).get('/api/parent/children').set('Authorization', `Bearer ${tokenFor(student)}`);
    expect(res.status).toBe(403);
  });

  test('an admin token cannot create staff accounts (super admin only)', async () => {
    const admin = await createUser({ role: 'ADMIN', email: 'a1@example.com' });
    const res = await request(app)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ name: 'New Admin', email: 'a2@example.com', password: 'supersecret1', role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  test('a super admin token can create staff accounts', async () => {
    const superAdmin = await createUser({ role: 'SUPER_ADMIN', email: 'sa1@example.com' });
    const res = await request(app)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`)
      .send({ name: 'New Admin', email: 'a3@example.com', password: 'supersecret1', role: 'ADMIN' });
    expect(res.status).toBe(201);
  });

  test('a deactivated account is rejected even with a still-valid token', async () => {
    const admin = await createUser({ role: 'ADMIN', email: 'deactivated@example.com' });
    await prisma.user.update({ where: { id: admin.id }, data: { active: false } });
    const res = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(401);
  });

  test('requests with no token are rejected', async () => {
    const res = await request(app).get('/api/admin/students');
    expect(res.status).toBe(401);
  });

  test('a request with a garbage token is rejected', async () => {
    const res = await request(app).get('/api/admin/students').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  test('student listings never expose a parent password hash', async () => {
    const superAdmin = await createUser({ role: 'SUPER_ADMIN', email: 'sa2@example.com' });
    const parent = await createUser({ role: 'PARENT', email: 'parent-leak-test@example.com' });
    await prisma.student.create({
      data: {
        name: 'Test Child',
        section: 'PRIMARY',
        className: 'Primary 1',
        dateOfBirth: new Date('2016-01-01'),
        parentId: parent.id,
      },
    });

    const res = await request(app)
      .get('/api/admin/students')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
});
