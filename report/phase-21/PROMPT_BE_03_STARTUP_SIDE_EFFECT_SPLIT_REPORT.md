# PROMPT BE-03 — BACKEND STARTUP SIDE-EFFECT SPLIT

Ngày thực hiện: 2026-07-15
Branch: `chore/prompt-05r-docs-local-run` → push `origin/main`
HEAD trước prompt: `aa54718 Finalize P0-FIX-02 report with git push result`
Verdict: **PASS** — tách `createApp()` (import-safe) khỏi startup side-effect; giữ nguyên public API/webhook behavior.

> Không đổi API contract/schema/env/dependency. Không gọi external provider thật. Không POST fake `page` vào `/webhook`. Không claim Meta verified / App Review passed / production ready.

## 1. Mục tiêu

`createApp()` chỉ dựng Express app; `start()` (runtime entrypoint) mới mở port + startup adapters. Import app trong test/smoke KHÔNG gọi Facebook/Telegram/LLM/external.

## 2. Baseline (trước patch)

| Gate | Kết quả |
|---|---|
| `backend npm run quality` | PASS |
| `backend npx prisma validate` | PASS |

## 3. Startup side-effect audit (`index.js` trước tách)

| Concern | Trước ở đâu | Side effect khi import? | Nên ở đâu | Hành động |
|---|---|---|---|---|
| Express app creation | module-level `express()` | Không | createApp | → `app.js` |
| helmet/cors/json/static middleware | module-level | Không | createApp | → `app.js` |
| routes `/webhook`, `/api`, `/health` | module-level | Không | createApp | → `app.js` (giữ order) |
| error handler | module-level | Không | createApp | → `app.js` |
| `prisma.$connect()` | `start()` | Có (DB) | bootstrap | giữ trong `start()` (guard entrypoint) |
| reset stale handoff | `start()` | Có (DB write) | bootstrap | giữ trong `start()` |
| `seedDefaults()` | `start()` | Có (DB write) | bootstrap | giữ trong `start()` |
| `facebookMenu.setupAllPages()` | `start()` | **Có (Facebook Graph API)** | bootstrap | giữ trong `start()` |
| `app.listen(PORT)` | `start()` | Có (mở port) | bootstrap | giữ trong `start()` |
| `telegramBot.init()` / `tenantHandoff.init()` | trong listen cb | **Có (Telegram polling)** | bootstrap | giữ trong `start()` |
| `healthChecker/dailyReport.start()` | `setTimeout` trong listen cb | Có (timers/DB) | bootstrap | giữ trong `start()` |
| `process.on(uncaughtException/unhandledRejection)` | module-level | Có (global handler) | bootstrap | → `registerProcessHandlers()`, chỉ chạy khi entrypoint |
| `start()` invocation | module-level (dòng cuối) | **Có — import = auto boot + external** | bootstrap | guard `if (require.main === module)` |
| env read | `require('dotenv').config()` | Không | entrypoint | giữ ở `index.js` |

**Root problem:** `start()` được gọi vô điều kiện ở module scope → require `index.js` sẽ connect DB, seed, gọi Facebook, listen, telegram polling.

## 4. Files changed

- `backend/src/app.js` (mới) — `createApp()`.
- `backend/src/index.js` — bỏ middleware/routes (chuyển sang app.js); dùng `createApp()`; gom process handlers vào `registerProcessHandlers()`; guard `start()` + handlers bằng `require.main === module`; giữ `start()`/`seedDefaults()`/`assertProductionAuthEnv()` nguyên logic.
- `backend/scripts/check-import-app.js` (mới) — import-safety guard.
- `backend/package.json` — thêm `check:app-import`; thêm `src/app.js` vào `syntax`.
- `.github/workflows/ci.yml` — thêm step `npm run check:app-import` cho backend job (không DB/secret/deploy).
- `docs/status/BACKEND_CLEAN_CODE_AUDIT_MATRIX.md` — ghi nhận BE-03.
- `report/phase-21/PROMPT_BE_03_STARTUP_SIDE_EFFECT_SPLIT_REPORT.md` (file này).

**Không sửa:** dashboard, schema/migration, `.env*`, `package-lock.json`, webhook behavior, bot/RAG/handoff logic.

## 5. createApp / bootstrap design

- `app.js::createApp()` — thuần app: `helmet → cors → express.json(rawBody) → /uploads static → GET/POST /webhook → /api → GET /health → error handler`. Route order y hệt bản cũ. Không listen/DB/external/scheduler/process handler.
- `index.js` — runtime entrypoint: `const app = createApp();` rồi `start()` (connect DB, reset stale handoff, seed, setup Facebook menu, listen, telegram/notification) + `registerProcessHandlers()`, **chỉ khi** `require.main === module`. Export `app` (compat) + `createApp`/`start`.

## 6. Import-safety result

- `npm run check:app-import` → **PASS** (exit 0, không treo → không mở port/không external khi import).
- Env-less (mô phỏng CI không `.env`) → **PASS** (createApp không cần `DATABASE_URL`; PrismaClient lazy).

## 7. Runtime smoke (createApp trên port tạm 3099, KHÔNG start()/seed/facebook/telegram)

| Check | Kết quả |
|---|---|
| `GET /health` | PASS 200 |
| `GET /webhook` thiếu params | PASS 403 |
| `POST /chatwoot-webhook` | PASS 404 |
| no-token `/api/prompts` `/api/stats` `/api/admin-users` | PASS 401 |
| invalid login (DB local) | PASS 401 |

Không restart live backend 3001 (local `.env` có token FB/Telegram thật → restart sẽ gọi external). Đã kiểm tra token bằng boolean, không in giá trị. Live 3001 vẫn `GET /health` 200 (không đụng). Smoke temp không seed/không external.

## 8. Side-effect scan sau patch

- `backend/src/app.js`: **không** `listen(`/`setInterval`/`telegram`/`facebook`/`axios`/`fetch`/`$connect`/`.init(` (chỉ khớp comment mô tả). CLEAN.
- `backend/src/index.js`: side-effect (`setupAllPages`, `app.listen`, `telegramBot.init`, `tenantHandoff.init`, `healthChecker/dailyReport.start`) đều nằm trong `start()`, dưới guard `if (require.main === module)`.

## 9. CI update

Thêm step `App import-safety check: npm run check:app-import` vào backend job (sau prisma validate). Không thêm DB service/secret/deploy. Local CI tương đương PASS: backend quality + prisma validate + check:app-import (env-less) + dashboard typecheck + build.

## 10. Secret scan

- Tracked forbidden → CLEAN.
- Content scan → chỉ placeholder docs/`.env.example`/dummy `user:password@localhost`. CLEAN.
- `tmp-runtime/` chỉ dùng tạm, đã xóa, không commit.

## 11. Push result

- Commit: `c2e2af1 Split backend app creation from startup side effects` (7 file: `index.js`, `app.js`, `check-import-app.js`, `package.json`, `ci.yml`, audit matrix, report này).
- Stage tường minh (không `git add .`), `git diff --cached --check` OK, không force push.
- `git push origin HEAD:main` → **thành công** (`aa54718..c2e2af1`).
- Verify: `origin/main` = local `HEAD` = `c2e2af1`.

## 12. Remaining risk

1. Live backend 3001 vẫn chạy **code cũ** (chưa restart để tránh external Facebook/Telegram vì `.env` có token thật). Log redaction BE-02 + entrypoint mới chỉ có hiệu lực sau khi operator restart backend (khi chủ động chấp nhận startup external).
2. `start()`/`seedDefaults()` vẫn gọi external (`setupAllPages`) khi chạy runtime — đúng thiết kế; nếu muốn smoke boot đầy đủ không external cần thêm flag skip (ngoài phạm vi BE-03).
3. `index.js` vẫn dài do `seedDefaults` (dữ liệu seed lớn); có thể tách `seed.js` ở prompt sau nếu cần.

## 13. Next step

- Operator restart backend bằng lệnh chuẩn (`cd backend && npm run dev`) khi sẵn sàng để áp dụng entrypoint mới + log redaction runtime.
- Tùy chọn: thêm `BOOTSTRAP_SKIP_EXTERNAL` flag để smoke full boot không gọi Facebook/Telegram.
- Tiếp tục domain-specific backend hardening (dashboard.js monolith) theo audit matrix khi có prompt riêng.
