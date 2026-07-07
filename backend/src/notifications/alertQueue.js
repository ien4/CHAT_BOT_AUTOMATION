const manager = require('./telegramManager');

// Debounce window: cùng loại alert không gửi lại trong 5 phút
const DEBOUNCE_MS = 5 * 60 * 1000;

// Map: alertType → lastSentAt (timestamp)
const lastSent = new Map();

async function alert(type, message) {
  const now = Date.now();
  const last = lastSent.get(type) || 0;

  if (now - last < DEBOUNCE_MS) return;

  lastSent.set(type, now);
  await manager.send(message);
}

// Reset debounce cho 1 type (dùng khi muốn force send)
function reset(type) {
  lastSent.delete(type);
}

module.exports = { alert, reset };
