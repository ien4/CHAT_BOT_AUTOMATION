#!/usr/bin/env node
'use strict';

/**
 * smoke-safe-bootstrap.js — Kiểm chứng chế độ boot an toàn.
 *
 * Spawn `node src/index.js` với BOOTSTRAP_SKIP_EXTERNAL=true trên port tạm, rồi:
 *  - xác nhận server start được (log "Server running on port <PORT>");
 *  - xác nhận đã BỎ QUA external startup (có log skip Facebook + Telegram/notification);
 *  - xác nhận KHÔNG có log setup Facebook Messenger Profile;
 *  - smoke route không cần external: /health 200, /webhook 403, /chatwoot-webhook 404,
 *    guards /api/* 401, invalid login 401;
 *  - kill child.
 *
 * Chỉ Node core, không dependency. KHÔNG gọi Facebook/Telegram/LLM thật (flag skip).
 * Cần DB local (start() vẫn prisma.$connect + seed idempotent). Không in secret.
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.SAFE_BOOTSTRAP_PORT || '3098';
const BASE = `http://127.0.0.1:${PORT}`;
const backendRoot = path.resolve(__dirname, '..');

let out = '';
const child = spawn(process.execPath, ['src/index.js'], {
  cwd: backendRoot,
  env: { ...process.env, BOOTSTRAP_SKIP_EXTERNAL: 'true', PORT },
});
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });

function fail(msg) {
  console.error(`[safe-bootstrap] FAIL — ${msg}`);
  try { child.kill(); } catch (_) {}
  process.exit(1);
}

async function waitForReady(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (out.includes(`Server running on port ${PORT}`)) return true;
    if (child.exitCode !== null) fail(`child thoát sớm (code=${child.exitCode})`);
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function get(url, opt) {
  const r = await fetch(url, opt);
  return r.status;
}

async function main() {
  const ready = await waitForReady();
  if (!ready) fail('server không start trong thời gian chờ');

  // External phải bị skip
  if (!out.includes('bỏ qua Facebook Messenger Profile setup')) fail('thiếu log skip Facebook');
  if (!out.includes('bỏ qua Telegram/notification startup')) fail('thiếu log skip Telegram/notification');
  if (/Messenger Profile đã được cài đặt/.test(out)) fail('phát hiện setup Facebook Messenger Profile (external không bị skip)');

  const checks = [];
  const t = async (n, u, o, e) => { const s = await get(u, o).catch(() => 'ERR'); checks.push([n, s, e, s === e ? 'PASS' : '>>>FAIL']); };
  await t('GET /health', `${BASE}/health`, {}, 200);
  await t('GET /webhook missing params', `${BASE}/webhook`, {}, 403);
  await t('POST /chatwoot-webhook', `${BASE}/chatwoot-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 404);
  await t('no-token /api/prompts', `${BASE}/api/prompts`, {}, 401);
  await t('no-token /api/stats', `${BASE}/api/stats`, {}, 401);
  await t('no-token /api/admin-users', `${BASE}/api/admin-users`, {}, 401);
  await t('invalid login', `${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '__x__', password: '__x__' }) }, 401);

  console.log('===SAFE BOOTSTRAP SMOKE (BOOTSTRAP_SKIP_EXTERNAL=true, port ' + PORT + ')===');
  console.log('external skipped: Facebook + Telegram/notification (log confirmed)');
  for (const c of checks) console.log(`${c[3]}  ${String(c[1]).padEnd(4)}(exp ${c[2]})  ${c[0]}`);
  const fails = checks.filter((c) => c[3] !== 'PASS').length;

  try { child.kill(); } catch (_) {}
  if (fails > 0) fail(`${fails} route check thất bại`);
  console.log('\n[safe-bootstrap] PASS — boot an toàn, external skipped, routes OK.');
  setTimeout(() => process.exit(0), 300);
}

main().catch((e) => fail(e.message));
