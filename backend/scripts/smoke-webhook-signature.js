#!/usr/bin/env node
'use strict';

/**
 * smoke-webhook-signature.js — Kiểm chứng xác thực chữ ký X-Hub-Signature-256
 * cho POST /webhook (HMAC-SHA256 rawBody với FB_APP_SECRET).
 *
 * Chỉ Node core (crypto/http) + createApp() import-safe. KHÔNG gọi Meta/Facebook/
 * Telegram/LLM thật, KHÔNG dùng token thật, KHÔNG chạm runtime 3001, KHÔNG cần DB
 * (payload dùng object=page + entry=[] nên KHÔNG đi tới page lookup/DB; các case sai
 * chữ ký bị chặn trước khi tới xử lý). Không in raw payload / secret / full signature.
 */
const crypto = require('crypto');
const { createApp } = require('../src/app');

const MOCK_APP_SECRET = 'smoke-mock-app-secret-not-real';
const MOCK_VERIFY_TOKEN = 'smoke-mock-verify-token-not-real';

// Payload hợp lệ nhưng KHÔNG đi tới DB: object=page, entry rỗng → ack 200, loop 0 entry.
const VALID_PAYLOAD = JSON.stringify({ object: 'page', entry: [] });

function sign(secret, rawBodyString) {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBodyString, 'utf8').digest('hex')}`;
}

function request(base, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return fetch(`${base}${path}`, { method, headers, body }).then(async (r) => ({
    status: r.status,
    text: await r.text(),
  }));
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

async function main() {
  // Đảm bảo state env sạch trước khi start.
  const savedSecret = process.env.FB_APP_SECRET;
  const savedVerify = process.env.FB_VERIFY_TOKEN;
  process.env.FB_VERIFY_TOKEN = MOCK_VERIFY_TOKEN;

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const jsonHeaders = { 'Content-Type': 'application/json' };

    // --- Case A: secret set + chữ ký ĐÚNG → 200 EVENT_RECEIVED ---
    process.env.FB_APP_SECRET = MOCK_APP_SECRET;
    const validSig = sign(MOCK_APP_SECRET, VALID_PAYLOAD);
    const a = await request(base, {
      method: 'POST', path: '/webhook',
      headers: { ...jsonHeaders, 'X-Hub-Signature-256': validSig },
      body: VALID_PAYLOAD,
    });
    record('A: secret set + chữ ký đúng', a.status === 200 && a.text === 'EVENT_RECEIVED', `status=${a.status}`);

    // --- Case B: secret set + chữ ký SAI → 401/403 ---
    const b = await request(base, {
      method: 'POST', path: '/webhook',
      headers: { ...jsonHeaders, 'X-Hub-Signature-256': 'sha256=deadbeef' },
      body: VALID_PAYLOAD,
    });
    record('B: secret set + chữ ký sai', b.status === 401 || b.status === 403, `status=${b.status}`);

    // --- Case C: secret set + THIẾU chữ ký → 401/403 ---
    const c = await request(base, {
      method: 'POST', path: '/webhook',
      headers: { ...jsonHeaders },
      body: VALID_PAYLOAD,
    });
    record('C: secret set + thiếu chữ ký', c.status === 401 || c.status === 403, `status=${c.status}`);

    // --- Case D: secret UNSET → legacy 200 cho payload hợp lệ (không có header chữ ký) ---
    delete process.env.FB_APP_SECRET;
    const d = await request(base, {
      method: 'POST', path: '/webhook',
      headers: { ...jsonHeaders },
      body: VALID_PAYLOAD,
    });
    record('D: secret unset → legacy 200', d.status === 200 && d.text === 'EVENT_RECEIVED', `status=${d.status}`);

    // --- GET verify: token ĐÚNG → echo challenge ---
    const challenge = 'smoke-challenge-123';
    const g1 = await request(base, {
      method: 'GET',
      path: `/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(MOCK_VERIFY_TOKEN)}&hub.challenge=${challenge}`,
    });
    record('GET verify: token đúng → echo challenge', g1.status === 200 && g1.text === challenge, `status=${g1.status}`);

    // --- GET verify: token SAI → 403 ---
    const g2 = await request(base, {
      method: 'GET',
      path: `/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=${challenge}`,
    });
    record('GET verify: token sai → 403', g2.status === 403, `status=${g2.status}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    // Khôi phục env.
    if (savedSecret === undefined) delete process.env.FB_APP_SECRET; else process.env.FB_APP_SECRET = savedSecret;
    if (savedVerify === undefined) delete process.env.FB_VERIFY_TOKEN; else process.env.FB_VERIFY_TOKEN = savedVerify;
  }

  console.log('===WEBHOOK SIGNATURE SMOKE (no Meta, no DB, mock secret)===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : '>>>FAIL'}  ${r.name}  (${r.detail})`);
  }
  const fails = results.filter((r) => !r.ok).length;
  if (fails > 0) {
    console.error(`\n[webhook-signature] FAIL — ${fails}/${results.length} case thất bại.`);
    process.exit(1);
  }
  console.log(`\n[webhook-signature] PASS — ${results.length}/${results.length} case OK.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[webhook-signature] FAIL —', e?.message || e);
  process.exit(1);
});
