#!/usr/bin/env node
'use strict';

/**
 * dev-clean-start.js — Clean `.next` rồi in hướng dẫn start dashboard dev chuẩn.
 *
 * Cố ý KHÔNG tự spawn dev server và KHÔNG kill process nào: để tránh giết nhầm
 * tiến trình ngoài workspace hoặc chồng nhiều dev server. Người vận hành tự chạy
 * `npm run dev` sau bước clean này.
 *
 * - Chỉ Node core module, không dependency.
 * - Không đọc env/secret.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const dashboardRoot = path.resolve(__dirname, '..');
const DEV_PORT = 3019;
const DEV_HOST = '127.0.0.1';

const result = spawnSync(process.execPath, [path.join(__dirname, 'clean-next.js')], {
  stdio: 'inherit',
  cwd: dashboardRoot,
});
if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('');
console.log('==================================================================');
console.log(' Dashboard dev runtime đã sạch. Bước tiếp theo:');
console.log('');
console.log('   1) Đảm bảo KHÔNG còn dev server cũ trên port 3002 (server cũ gây stale).');
console.log(`   2) npm run dev        → start dashboard tại http://${DEV_HOST}:${DEV_PORT}`);
console.log('   3) npm run smoke:runtime  → smoke toàn bộ route + static assets');
console.log('');
console.log(` Port dev CHUẨN duy nhất: ${DEV_PORT} (không dùng 3002).`);
console.log('==================================================================');
