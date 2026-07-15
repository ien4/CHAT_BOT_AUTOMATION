#!/usr/bin/env node
'use strict';

/**
 * assert-no-next-runtime.js — Guard trước `next build`.
 *
 * Cấm build khi Next dev/start thuộc workspace đang sống (build ghi `.next` trong khi
 * dev đang đọc → hỏng chunk/static). Chạy qua `prebuild`.
 *
 * - Sạch → exit 0.
 * - Còn runtime (hoặc nghi ngờ) → in hướng dẫn `npm run stop:runtime` + exit 1.
 */
const { assertNoNextRuntimeProcesses } = require('./next-process-utils');

try {
  assertNoNextRuntimeProcesses();
  console.log('[assert:no-runtime] OK — không có Next dev/start thuộc workspace. An toàn để build.');
  process.exit(0);
} catch (err) {
  console.error(`[assert:no-runtime] ${err.message}`);
  console.error('[assert:no-runtime] Dừng runtime trước khi build: npm run stop:runtime');
  process.exit(1);
}
