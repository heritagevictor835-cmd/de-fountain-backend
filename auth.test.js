const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { resetDatabase } = require('./setup');

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Parent registration and login', () => {
  test('registers a new parent', async () => {
    const res = await request(app).post('/api/auth/register/parent').send({
      name: 'Amina Bello',
      email: 'amina@example.com',
      password: 'supersecret1',
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('PARENT');
  });

  test('rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register/parent').send({
      name: 'Amina Bello',
      email: 'amina2@example.com',
      password: '123',
    });
    expect(res.status).toBe(400);
  });

  test('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register/parent').send({
      name: 'Amina Bello',
      email: 'dup@example.com',
      password: 'supersecret1',
    });
    const res = await request(app).post('/api/auth/register/parent').send({
      name: 'Another Parent',
      email: 'dup@example.com',
      password: 'supersecret1',
    });
    expect(res.status).toBe(409);
  });

  test('logs in with correct credentials and rejects the wrong password', async () => {
    await request(app).post('/api/auth/register/parent').send({
      name: 'Amina Bello',
      email: 'login@example.com',
      password: 'supersecret1',
    });

    const good = await request(app).post('/api/auth/login').send({
      identifier: 'login@example.com',
      password: 'supersecret1',
    });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeDefined();

    const bad = await request(app).post('/api/auth/login').send({
      identifier: 'login@example.com',
      password: 'wrongpassword',
    });
    expect(bad.status).toBe(401);
  });
});
