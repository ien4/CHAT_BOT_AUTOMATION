#!/usr/bin/env node
'use strict';

/**
 * dev-clean-start.js — `npm run dev` entry: đảm bảo CHỈ MỘT Next dev sống.
 *
 * Trình tự:
 *   1) Dừng mọi Next dev/start cũ thuộc workspace (chống ghi chồng `.next`).
 *   2) Clean `.next`.
 *   3) Start `next dev -p 3019 -H 127.0.0.1` ở foreground (operator thấy log).
 *
 * - Chỉ Node core, không dependency. Không spawn port 3002.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stopNextRuntimeProcesses } = require('./next-process-utils');

const DASHBOARD_ROOT = path.resolve(__dirname, '..');
const DEV_PORT = '3019';
const DEV_HOST = '127.0.0.1';

// 1) Dừng Next runtime cũ thuộc workspace
const { stopped, suspicious } = stopNextRuntimeProcesses();
if (stopped.length > 0) console.log(`[dev] Đã dừng ${stopped.length} Next runtime cũ thuộc workspace.`);
if (suspicious.length > 0) {
  console.error(`[dev] ⚠️ Phát hiện ${suspicious.length} Next process nghi ngờ (không tự kill). Kiểm tra thủ công rồi chạy lại.`);
  suspicious.forEach((p) => console.error(`  pid=${p.pid} :: ${String(p.cmd).slice(0, 120)}`));
  process.exit(1);
}

// Chờ ngắn để OS giải phóng port sau khi kill (sync, không dependency)
spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 800)']);

// 2) Clean `.next`
const clean = spawnSync(process.execPath, [path.join(__dirname, 'clean-next.js')], {
  stdio: 'inherit',
  cwd: DASHBOARD_ROOT,
});
if (clean.status !== 0) process.exit(clean.status || 1);

// 3) Start next dev foreground trên port chuẩn 3019
const nextBin = path.join(DASHBOARD_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!fs.existsSync(nextBin)) {
  console.error(`[dev] Không tìm thấy next binary tại ${nextBin}. Chạy npm install trong dashboard.`);
  process.exit(1);
}

console.log(`[dev] Start dashboard: http://${DEV_HOST}:${DEV_PORT}`);
const child = spawn(process.execPath, [nextBin, 'dev', '-p', DEV_PORT, '-H', DEV_HOST], {
  stdio: 'inherit',
  cwd: DASHBOARD_ROOT,
});

const forward = (sig) => { try { child.kill(sig); } catch (_) {} };
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
