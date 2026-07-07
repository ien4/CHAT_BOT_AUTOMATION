const getPrisma = require('../db');
const alertQueue = require('./alertQueue');
const formatters = require('./formatters');

const PING_INTERVAL_MS = 2 * 60 * 1000; // 2 phút
const FAIL_THRESHOLD = 3;               // alert sau 3 lần fail liên tiếp

let consecutiveFailures = 0;
let dbWasDown = false;
let intervalHandle = null;

async function ping() {
  const prisma = getPrisma();
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (dbWasDown) {
      dbWasDown = false;
      consecutiveFailures = 0;
      // DB đã phục hồi → thông báo
      const manager = require('./telegramManager');
      await manager.send(formatters.dbRecovered());
      alertQueue.reset('db_error');
    } else {
      consecutiveFailures = 0;
    }
  } catch (err) {
    consecutiveFailures++;
    console.error(`[HealthChecker] DB ping failed (${consecutiveFailures}/${FAIL_THRESHOLD}):`, err.message);

    if (consecutiveFailures >= FAIL_THRESHOLD) {
      dbWasDown = true;
      await alertQueue.alert('db_error', formatters.dbError(err.message));
    }
  }
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(ping, PING_INTERVAL_MS);
  console.log('✅ HealthChecker started (DB ping every 2 min)');
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop };
