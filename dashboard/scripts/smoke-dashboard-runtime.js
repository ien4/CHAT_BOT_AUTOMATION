#!/usr/bin/env node
'use strict';

/**
 * smoke-dashboard-runtime.js — HTTP smoke cho dashboard dev/prod runtime.
 *
 * - Base URL mặc định http://127.0.0.1:3019 (override qua env SMOKE_BASE_URL hoặc argv[2]).
 * - GET tất cả route thật → phải != 500 (và != 404).
 * - Fake route → phải 404.
 * - Parse HTML lấy /_next/static/... asset → mỗi asset phải 200.
 * - Route thật 500 / static 404 → exit 1.
 * - Chỉ Node core (global fetch của Node 18+), không dependency, không browser.
 */

const BASE_URL = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3019').replace(/\/+$/, '');

const ROUTES = [
  '/login',
  '/dashboard',
  '/dashboard/settings',
  '/dashboard/analytics',
  '/dashboard/prompts',
  '/dashboard/staff',
  '/dashboard/appointments',
  '/dashboard/content-packages',
  '/dashboard/quick-replies',
  '/dashboard/campaigns',
  '/dashboard/conversations',
  '/dashboard/knowledge',
  '/dashboard/handoff',
  '/dashboard/tenants',
  '/dashboard/channel-configs',
];
const FAKE_ROUTE = '/dashboard/__fake_p0_fix_02__';

async function get(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text().catch(() => '');
  return { status: res.status, text };
}

function extractStaticAssets(html) {
  const set = new Set();
  const re = /\/_next\/static\/[^"'\\)\s]+/g;
  let m;
  while ((m = re.exec(html)) !== null) set.add(m[0]);
  return set;
}

async function main() {
  console.log(`[smoke] base=${BASE_URL}`);
  const assets = new Set();
  const routeFailures = [];

  for (const route of ROUTES) {
    let status;
    try {
      const r = await get(BASE_URL + route);
      status = r.status;
      extractStaticAssets(r.text).forEach((a) => assets.add(a));
    } catch (e) {
      status = `ERR ${e.message}`;
    }
    const bad = status === 500 || status === 404 || String(status).startsWith('ERR');
    if (bad) routeFailures.push({ route, status });
    console.log(`${bad ? '>>>' : 'OK '} ${String(status).padEnd(5)} ${route}`);
  }

  // Fake route must 404
  let fakeStatus;
  try {
    fakeStatus = (await get(BASE_URL + FAKE_ROUTE)).status;
  } catch (e) {
    fakeStatus = `ERR ${e.message}`;
  }
  const fakeOk = fakeStatus === 404;
  console.log(`${fakeOk ? 'OK ' : '>>>'} ${String(fakeStatus).padEnd(5)} ${FAKE_ROUTE} (expect 404)`);

  // Static assets must all 200
  const assetFailures = [];
  for (const a of assets) {
    let status;
    try {
      status = (await fetch(BASE_URL + a)).status;
    } catch (e) {
      status = `ERR ${e.message}`;
    }
    if (status !== 200) {
      assetFailures.push({ asset: a, status });
      console.log(`>>> ${String(status).padEnd(5)} ${a}`);
    }
  }

  console.log(`\n[smoke] routes=${ROUTES.length} routeFailures=${routeFailures.length} fakeRoute=${fakeStatus} staticAssets=${assets.size} assetFailures=${assetFailures.length}`);

  const failed = routeFailures.length > 0 || !fakeOk || assetFailures.length > 0;
  if (failed) {
    console.error('[smoke] FAIL — có route 500/404 không mong đợi, fake route sai, hoặc static asset 404.');
    process.exit(1);
  }
  console.log('[smoke] PASS — không route 500, không static 404, fake route 404 hợp lệ.');
}

main().catch((e) => {
  console.error('[smoke] fatal:', e.message);
  process.exit(1);
});
