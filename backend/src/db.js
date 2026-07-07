const { PrismaClient } = require('@prisma/client');

// Singleton Prisma Client — dùng chung cho toàn bộ ứng dụng
// Tránh multiple instances gây lỗi kết nối, connection pool exhaustion
let prisma;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return prisma;
}

module.exports = getPrisma;
