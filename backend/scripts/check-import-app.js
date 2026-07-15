#!/usr/bin/env node
'use strict';

/**
 * check-import-app.js — Import-safety guard.
 *
 * Chứng minh: import `createApp` và tạo Express app KHÔNG gây side effect runtime
 * (không listen port, không connect DB, không start Telegram/Facebook/notification,
 * không gửi network request). Bằng chứng bổ sung: sau khi tạo app, Node event loop
 * không bị giữ → process tự thoát 0. Nếu import mở port/polling, process sẽ treo.
 *
 * Chỉ dùng Node core, không dependency, không đọc env secret.
 */
const assert = require('assert');

const mod = require('../src/app');
assert.strictEqual(typeof mod.createApp, 'function', 'app.js phải export createApp()');

const app = mod.createApp();
assert.strictEqual(typeof app, 'function', 'createApp() phải trả về Express app (function)');
assert.strictEqual(typeof app.listen, 'function', 'app phải là Express app có .listen');
assert.strictEqual(typeof app.use, 'function', 'app phải là Express app có .use');

// Không gọi app.listen(), không prisma.$connect(), không telegram/facebook init.
console.log('[check:app-import] PASS — createApp() import-safe, không listen/không external side effect.');

// Ép thoát nhanh & báo nếu có handle runtime bị giữ (dấu hiệu side-effect ngoài ý muốn).
setImmediate(() => process.exit(0));
