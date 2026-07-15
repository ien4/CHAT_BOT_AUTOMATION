#!/usr/bin/env node
'use strict';

/**
 * stop-next-runtime.js — Dừng toàn bộ Next dev/start thuộc dashboard workspace.
 *
 * - KHÔNG dừng backend (3001) hay Node process ngoài workspace.
 * - Exit 0 nếu không có process (hoặc đã dừng xong).
 * - Exit 1 nếu phát hiện Next process NGHI NGỜ (không chắc thuộc workspace) — không tự kill.
 */
const { stopNextRuntimeProcesses } = require('./next-process-utils');

const { stopped, suspicious } = stopNextRuntimeProcesses();

if (stopped.length === 0) {
  console.log('[stop:runtime] Không có Next runtime thuộc workspace đang chạy.');
} else {
  console.log(`[stop:runtime] Đã dừng ${stopped.length} Next runtime thuộc workspace.`);
}

if (suspicious.length > 0) {
  console.error(`[stop:runtime] ⚠️ Phát hiện ${suspicious.length} Next process NGHI NGỜ (không chắc thuộc workspace), KHÔNG tự kill:`);
  suspicious.forEach((p) => console.error(`  pid=${p.pid} :: ${String(p.cmd).slice(0, 120)}`));
  console.error('[stop:runtime] Hãy kiểm tra thủ công. Exit 1.');
  process.exit(1);
}

process.exit(0);
