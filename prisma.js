const { PrismaClient } = require('@prisma/client');

// Reuse a single Prisma Client across the app (and across dev hot-reloads)
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
