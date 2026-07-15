# PROMPT P0-FIX-02 — DASHBOARD DEV RUNTIME LOCK + STALE NEXT BUG ELIMINATION

Ngày thực hiện: 2026-07-15
Branch: `chore/prompt-05r-docs-local-run` → push `origin/main`
HEAD trước prompt: `6a54c2c Finalize BE-02 report with git push result`
Verdict: **PASS** — dashboard dev runtime chốt về một port duy nhất (3019); stale/mixed `.next` bị loại bằng script + smoke; không sửa page/feature source.

> Không đổi backend logic/webhook/schema/env/dependency. Không claim Meta verified / App Review passed / production ready.

## 1. Root cause

`MIXED_DEV_SERVER_PORT` + `STALE_NEXT_CACHE`.

`dashboard/package.json` để `"dev": "next dev -p 3002"` (và `start` 3002), trong khi toàn bộ workflow ổn định/smoke của dự án dùng **3019** (BUG-21C-SAFE, 21C-3, 21X/21Y, P0-FIX-01). Operator chạy `npm run dev` → luôn spawn server **3002**, đè lên `.next` do lần `next build` (production, có `standalone`) sinh ra → Next dev/prod artifact lẫn nhau → `MODULE_NOT_FOUND` trong `.next/server/webpack-runtime.js`, thiếu `.next/server/app/dashboard/page.js`, `_next/static` 404, `/dashboard` 500. Đây là biến thể tái diễn của pattern stale-cache đã ghi nhận.

Fix triệt để = loại nguồn lệch: chốt `dev`/`start` về `3019`, thêm lệnh clean `.next` chuẩn + smoke, cập nhật runbook. Không phải vá UI/route.

## 2. Port / process audit (preflight)

| Port | Trạng thái preflight |
|---|---|
| 3002 | LISTEN pid `33692` = **dashboard Next dev server của workspace** (`...\dashboard\node_modules\next\...\start-server.js`) — do `npm run dev` cũ (mặc định 3002) |
| 3019 | free |
| 3020 | free |
| 3001 | LISTEN pid `27752` = backend `node src/index.js` (không đụng) |

- `npm run dev` trước fix: `next dev -p 3002`.
- Smoke chuẩn của dự án: `3019`.
- `.next`: TỒN TẠI, chứa cả production output (`standalone`, `BUILD_ID`) lẫn dev artifact của server 3002 → mixed/stale.

## 3. Files changed

- `dashboard/package.json` — `dev`/`start` → `3019 -H 127.0.0.1`; thêm scripts `clean:next`, `dev:clean`, `smoke:runtime`.
- `dashboard/scripts/clean-next.js` (mới)
- `dashboard/scripts/dev-clean-start.js` (mới)
- `dashboard/scripts/smoke-dashboard-runtime.js` (mới)
- `docs/runbooks/LOCAL_RUN_GUIDE.md` — port dev chuẩn 3019 + lệnh clean/dev/smoke.
- `docs/status/BUG_TRACKER.md` — entry BUG-P0-FIX-02.
- `report/bugs/PROMPT_P0_FIX_02_DASHBOARD_DEV_RUNTIME_LOCK_REPORT.md` (file này).

**Không sửa:** dashboard page/feature source, backend source, webhook, schema/migration, `.env*`, `package-lock.json`, dependency, `ci.yml`.

## 4. Scripts added/changed

| Script | Chức năng |
|---|---|
| `npm run clean:next` | Xóa an toàn `dashboard/.next` sau khi verify đúng workspace (`name=fb-chatbot-dashboard`); không kill process, không đọc env. Báo lỗi nếu `.next` bị process giữ. |
| `npm run dev:clean` | Chạy `clean-next.js` rồi in hướng dẫn start chuẩn (không tự spawn/kill để tránh giết nhầm process). |
| `npm run smoke:runtime` | HTTP smoke `http://127.0.0.1:3019` (override qua argv/`SMOKE_BASE_URL`): 15 route thật != 500/404, fake route 404, parse `_next/static` assets → tất cả 200; fail → exit 1. Node core, không dependency, không browser. |
| `dev` / `start` | Chốt `3019 -H 127.0.0.1` (bỏ 3002). |

Tất cả script chỉ dùng Node core module, không thêm dependency.

## 5. Validation

| Gate | Kết quả |
|---|---|
| `node --check` 3 script | PASS |
| `package.json` valid JSON | PASS |
| `dashboard npm run typecheck` | PASS |
| `dashboard npm run build` | PASS (17 routes) |
| `dashboard npm run clean:next` | PASS (đã xóa `.next`) |
| `npm run dev` bind đúng port | PASS — LISTEN `127.0.0.1:3019` (pid `24880`) |

## 6. Dashboard runtime smoke (`npm run smoke:runtime`, dev server 3019 sạch)

- Routes 15/15 = **200**: `/login`, `/dashboard`, `/dashboard/settings`, `/dashboard/analytics`, `/dashboard/prompts`, `/dashboard/staff`, `/dashboard/appointments`, `/dashboard/content-packages`, `/dashboard/quick-replies`, `/dashboard/campaigns`, `/dashboard/conversations`, `/dashboard/knowledge`, `/dashboard/handoff`, `/dashboard/tenants`, `/dashboard/channel-configs`.
- Fake route `/dashboard/__fake_p0_fix_02__` → **404**.
- Static `_next/static` assets: **64/64 = 200**.
- Dev log scan: **sạch** — không `MODULE_NOT_FOUND`, `webpack-runtime`, `Cannot find module`, `ChunkLoadError`, `_next/static 404`, ` 500 `, `ENOENT`, `app/dashboard/page.js`.
- `smoke:runtime` exit 0 (PASS). Dev server do prompt tạo đã được dừng sau smoke.

## 7. Backend regression

| Check | Kết quả |
|---|---|
| `backend npm run quality` | PASS |
| `backend npx prisma validate` | PASS |
| `GET /health` | PASS 200 |
| `GET /webhook` thiếu params | PASS 403 |
| `POST /chatwoot-webhook` | PASS 404 |

Không gọi external provider thật. Backend không bị sửa/khởi động lại.

## 8. Secret scan

- Tracked forbidden files → CLEAN.
- Content secret scan → chỉ placeholder trong docs/`.env.example` (không secret thật). CLEAN.
- `tmp-runtime/` chỉ dùng tạm, đã xóa, không commit.

## 9. Push result

Xem mục cập nhật cuối (Phase 11 thực thi).

## 10. Remaining risk

1. Nếu operator còn tiến trình `next` cũ trên 3002 từ trước, cần dừng thủ công (script cố ý không kill process để tránh giết nhầm). Runbook đã ghi rõ.
2. `start` (production) cũng chuyển 3019; nếu deploy/reverse-proxy từng giả định 3002 thì cần cập nhật mapping — repo hiện KHÔNG có tham chiếu 3002 trong docker/nginx (chỉ package.json + docs lịch sử).
3. Docs lịch sử (report cũ) vẫn nhắc 3002 như bối cảnh quá khứ — không sửa hàng loạt theo giới hạn prompt; nguồn chuẩn hiện tại là `package.json` (3019) + `LOCAL_RUN_GUIDE.md`.
4. `smoke:runtime` là HTTP smoke, không thay browser E2E; đủ để bắt stale-cache/500/static 404.
