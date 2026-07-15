# PROMPT BE-04 — SAFE BOOTSTRAP FLAG + SEED SPLIT + FULL BOOT SMOKE

Ngày thực hiện: 2026-07-15
Branch: `chore/prompt-05r-docs-local-run` → push `origin/main`
HEAD trước prompt: `d89fa70 Finalize BE-03 report with git push result`
Verdict: **PASS** — thêm `BOOTSTRAP_SKIP_EXTERNAL`, tách `seedDefaults`, smoke boot an toàn không external; giữ nguyên behavior mặc định + API/webhook.

> Không đổi API contract/schema/env/dependency. Không gọi Facebook/Telegram/LLM thật. Không POST fake `page` vào `/webhook`. Không claim Meta verified / App Review passed / production ready.

## 1. Mục tiêu

Boot an toàn: `BOOTSTRAP_SKIP_EXTERNAL=true` → server vẫn start để smoke route nhưng KHÔNG gọi Facebook/Telegram/notification. Tách `seedDefaults` để `index.js` mỏng hơn. Behavior mặc định (không flag) không đổi.

## 2. Baseline (trước patch)

| Gate | Kết quả |
|---|---|
| `backend npm run quality` | PASS |
| `backend npm run check:app-import` | PASS |

## 3. Audit startup external calls (`start()` trong index.js)

| Startup step | Hiện trạng | External/DB/timer? | Skip khi `BOOTSTRAP_SKIP_EXTERNAL`? | Ghi chú |
|---|---|---|---|---|
| `assertProductionAuthEnv()` | đầu start() | env check | Không | an toàn |
| `prisma.$connect()` | start() | DB (local infra) | **Không** | cần cho route DB |
| reset stale handoff | start() | DB write | **Không** | boot maintenance idempotent |
| `seedDefaults(prisma)` | tách ra module | DB write (chỉ khi trống) | **Không** | idempotent |
| `facebookMenu.setupAllPages()` | start() | **Facebook Graph API** | **Có** | external → skip |
| `app.listen(PORT)` | start() | mở port | Không | cần server để smoke |
| `telegramBot.init()` | listen cb | **Telegram polling** | **Có** | external → skip |
| `tenantHandoff.init()` | listen cb | phụ thuộc telegram | **Có** | skip cùng telegram |
| `healthChecker.start()` | setTimeout | timer + Telegram alert | **Có** | external/timer → skip |
| `dailyReport.start()` | setTimeout | timer + Telegram | **Có** | external/timer → skip |
| process handlers | entrypoint | global handler | Không (chỉ khi entrypoint) | giữ BE-03 |

## 4. Thiết kế flag

```js
function shouldSkipExternalBootstrap() {
  return process.env.BOOTSTRAP_SKIP_EXTERNAL === 'true';
}
```

Trong `start()`:
- `skipExternal=true` → log skip + KHÔNG `setupAllPages`; sau `app.listen` → log skip + `return` sớm (không telegram/tenantHandoff init, không healthChecker/dailyReport).
- `skipExternal=false` (mặc định) → chạy y hệt BE-03 (setupAllPages + telegram init + notifications). Behavior mặc định KHÔNG đổi.

## 5. Files changed

- `backend/src/index.js` — thêm `shouldSkipExternalBootstrap()`; gate external trong `start()`; require `seedDefaults` từ module; gọi `seedDefaults(prisma)`; bỏ hàm `seedDefaults` cục bộ. Giảm 368 → 140 dòng.
- `backend/src/bootstrap/seedDefaults.js` (mới) — `seedDefaults(prisma)` (logic giữ nguyên; require bcrypt + isProduction nội bộ).
- `backend/scripts/smoke-safe-bootstrap.js` (mới) — spawn backend với flag trên port tạm, verify skip + route.
- `backend/package.json` — thêm `smoke:safe-bootstrap`; thêm `src/bootstrap/seedDefaults.js` vào `syntax`.
- `docs/status/BACKEND_CLEAN_CODE_AUDIT_MATRIX.md` — ghi nhận BE-04.
- `report/phase-21/PROMPT_BE_04_SAFE_BOOTSTRAP_FLAG_REPORT.md` (file này).

**Không sửa:** dashboard, schema/migration, `.env*`, `package-lock.json`, webhook behavior, bot/RAG/handoff domain logic, `app.js`, `ci.yml`.

## 6. Seed split

`seedDefaults` (admin/LLM providers/prompt templates/bot identity/handoff settings) chuyển sang `backend/src/bootstrap/seedDefaults.js`, nhận `prisma` singleton từ caller, chỉ thao tác DB, không external. `index.js` gọi `await seedDefaults(prisma)`. `node --check` + require-load PASS.

## 7. Full boot smoke (`npm run smoke:safe-bootstrap`, port tạm 3098, flag ON)

- Server start được (log `Server running on port 3098`).
- External **skipped**: log `bỏ qua Facebook Messenger Profile setup` + `bỏ qua Telegram/notification startup`; KHÔNG có log `Messenger Profile đã được cài đặt`.
- Routes: `/health` 200, `/webhook` 403, `/chatwoot-webhook` 404, no-token `/api/prompts|/api/stats|/api/admin-users` 401, invalid login 401 → **7/7 PASS**.
- Child bị kill sau smoke; port 3098 free. Không gọi Facebook/Telegram/LLM thật.

Behavior mặc định (không flag): không test runtime vì `.env` local có token FB/Telegram thật (sẽ gọi external); giữ nguyên qua code review — nhánh `else` y hệt BE-03.

## 8. Side-effect scan sau patch

- `app.js`: không listen/timer/telegram/facebook/axios/fetch/$connect. CLEAN.
- `seedDefaults.js`: không external/timer/listen (chỉ DB + bcrypt). CLEAN.
- `index.js`: `setupAllPages` nằm trong `else` của `if (skipExternal)`; `telegramBot.init`/`tenantHandoff.init`/`healthChecker.start`/`dailyReport.start` sau guard `if (skipExternal) return`. Tất cả external gated.

## 9. Validation

| Gate | Kết quả |
|---|---|
| `node --check` index.js/app.js/seedDefaults.js/smoke script | PASS |
| `backend npm run quality` (syntax + prisma validate) | PASS |
| `backend npm run check:app-import` (env-less-safe) | PASS |
| `backend npm run smoke:safe-bootstrap` | PASS (7/7 route, external skipped) |
| `dashboard npm run typecheck` | PASS |
| `dashboard npm run build` | PASS |
| live backend 3001 `/health` | 200 (không restart) |

## 10. CI update

Không thêm `smoke:safe-bootstrap` vào CI: nó cần DB local (start() vẫn `prisma.$connect`), CI không có DB service. Giữ `check:app-import` (import-safe, không DB) đã thêm ở BE-03. `ci.yml` không đổi trong BE-04.

## 11. Secret scan

- Tracked forbidden → CLEAN.
- Content scan → chỉ placeholder docs/`.env.example`/dummy `user:password@localhost`. CLEAN.
- `tmp-runtime` không dùng; smoke child cleanup, không commit.

## 12. Push result

- Commit: `d84e1ee Add safe bootstrap flag and split seedDefaults` (6 file: `index.js`, `bootstrap/seedDefaults.js`, `smoke-safe-bootstrap.js`, `package.json`, audit matrix, report này).
- Stage tường minh (không `git add .`), `git diff --cached --check` OK, không force push.
- `git push origin HEAD:main` → **thành công** (`d89fa70..d84e1ee`).
- Verify: `origin/main` = local `HEAD` = `d84e1ee`.

## 13. Remaining risk

1. Live backend 3001 vẫn chạy code cũ (chưa restart để tránh external vì `.env` có token thật). Flag + seed split + BE-02 log redaction có hiệu lực sau khi operator restart.
2. `smoke:safe-bootstrap` cần DB local; là gate local, không chạy trong CI.
3. Boot với flag vẫn `prisma.$connect` + reset stale handoff + seed (DB local, idempotent) — không skip DB theo thiết kế (flag chỉ skip external provider). Nếu cần smoke hoàn toàn không DB, cần flag DB riêng (ngoài phạm vi BE-04).

## 14. Next step

- Operator restart backend (`cd backend && npm run dev`) khi sẵn sàng để áp dụng entrypoint mới + log redaction; hoặc dùng `BOOTSTRAP_SKIP_EXTERNAL=true npm run dev` để chạy dev không đụng Facebook/Telegram.
- Tùy chọn: thêm gate DB-less để đưa boot smoke vào CI.
- Tiếp tục domain hardening `dashboard.js` monolith theo audit matrix khi có prompt riêng.
