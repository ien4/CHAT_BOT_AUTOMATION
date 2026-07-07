// Wrapper an toan cho Prisma singleton hien tai.
// Khong tao PrismaClient thu hai; chi re-export getPrisma tu src/db.js.
module.exports = require('../../../db');
