#!/usr/bin/env node
'use strict';

/**
 * smoke-dashboard-runtime.js — HTTP smoke cho dashboard dev/prod runtime.
 *
 * - Base URL mặc định http://127.0.0.1:3019 (override qua env SMOKE_BASE_URL hoặc argv[2]).
 * - GET tất cả route thật → phải != 500 (và != 404).
 * - Fake route → phải 404.
 * - Parse HTML lấy /_next/static/... asset → mỗi asset phải 200.
 * - Route thật 500 / static 404 / body có lỗi chunk → exit 1.
 * - Chỉ Node core (global fetch của Node 18+), không dependency, không browser.
 */

const BASE_URL = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3019').replace(/\/+$/, '');

// Dấu hiệu `.next` hỏng/mixed trong body HTML/JSON trả về.
const ERROR_MARKERS = /MODULE_NOT_FOUND|webpack-runtime|vendor-chunks|ChunkLoadError|Can't resolve|Cannot find module/i;

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
const FAKE_ROUTE = '/dashboard/__fake_p0_fix_03__';

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
  const bodyErrors = [];

  for (const route of ROUTES) {
    let status;
    let bodyBad = false;
    try {
      const r = await get(BASE_URL + route);
      status = r.status;
      extractStaticAssets(r.text).forEach((a) => assets.add(a));
      if (ERROR_MARKERS.test(r.text)) {
        bodyBad = true;
        bodyErrors.push({ route, marker: (r.text.match(ERROR_MARKERS) || [''])[0] });
      }
    } catch (e) {
      status = `ERR ${e.message}`;
    }
    const bad = status === 500 || status === 404 || String(status).startsWith('ERR') || bodyBad;
    if (bad && !(status === 500 || status === 404 || String(status).startsWith('ERR'))) {
      // body error nhưng status "ok" → vẫn tính fail
      routeFailures.push({ route, status: `${status} (body-error)` });
    } else if (bad) {
      routeFailures.push({ route, status });
    }
    console.log(`${bad ? '>>>' : 'OK '} ${String(status).padEnd(5)} ${route}${bodyBad ? '  [BODY ERROR: ' + (bodyErrors[bodyErrors.length - 1].marker) + ']' : ''}`);
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

  console.log(`\n[smoke] routes=${ROUTES.length} routeFailures=${routeFailures.length} bodyErrors=${bodyErrors.length} fakeRoute=${fakeStatus} staticAssets=${assets.size} assetFailures=${assetFailures.length}`);

  const failed = routeFailures.length > 0 || bodyErrors.length > 0 || !fakeOk || assetFailures.length > 0;
  if (failed) {
    console.error('[smoke] FAIL — route 500/404, body lỗi chunk (MODULE_NOT_FOUND/webpack-runtime/vendor-chunks/ChunkLoadError), fake route sai, hoặc static asset 404.');
    process.exit(1);
  }
  console.log('[smoke] PASS — không route 500, không static 404, không lỗi chunk trong body, fake route 404 hợp lệ.');
}

main().catch((e) => {
  console.error('[smoke] fatal:', e.message);
  process.exit(1);
});
