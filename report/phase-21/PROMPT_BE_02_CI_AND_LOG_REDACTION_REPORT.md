# PROMPT BE-02 — CI RED FIX + BACKEND LOG REDACTION HARDENING

Ngày thực hiện: 2026-07-15
Branch: `chore/prompt-05r-docs-local-run` → push `origin/main`
HEAD trước prompt: `8325c14 Finalize P0-FIX-01 report with git push result`
Verdict: **PASS** — CI root cause fixed + xác minh; log redaction hardening áp dụng cho vùng high-risk.

> Không đổi behavior/public API contract/schema/env/webhook. Không thêm dependency. Không claim Meta verified / App Review passed / production ready.

## 1. CI failure root cause

`gh` CLI **không có** trên máy → `GITHUB_ACTIONS_LOG_UNAVAILABLE`. Tái hiện CI local đúng workflow.

**Root cause (category D — Prisma validate cần env):** Cả `npm run quality` (chứa `prisma:validate`) lẫn step "Validate Prisma schema" chạy `prisma validate`. Schema có `datasource db { url = env("DATABASE_URL") }`. GitHub Actions **không có `.env`** → `prisma validate` fail:

```
Error code: P1012
error: Environment variable not found: DATABASE_URL.
```

Tái hiện local (ẩn `.env`, unset `DATABASE_URL`): exit 1. → Backend job đỏ ngay ở step `npm run quality`.

**Fix:** thêm placeholder env cấp job cho `backend` job trong `.github/workflows/ci.yml`:

```yaml
env:
  DATABASE_URL: postgresql://user:password@localhost:5432/db
```

`prisma validate` chỉ kiểm tra syntax schema, **không kết nối DB** → placeholder đủ, không phải secret, không đổi schema/behavior. Xác minh: env-less + dummy `DATABASE_URL` → `The schema is valid 🚀` exit 0.

Không đổi `npm ci`→`npm install` (lockfiles hợp lệ, xem mục 6). Không bỏ check. Không thêm deploy.

## 2. Files changed

CI:
- `.github/workflows/ci.yml` — thêm placeholder `DATABASE_URL` env cho backend job (comment giải thích không phải secret).

Log redaction helper (mới):
- `backend/src/infrastructure/services/redaction.js`

Log patched (chỉ sửa dòng log, không đổi logic):
- `backend/src/api/dashboard.js` — test-message logs.
- `backend/src/bot/engine.js` — postback log.
- `backend/src/bot/agent.js` — new-conversation log.
- `backend/src/facebook/menu.js` — 3 log lỗi provider response body.
- `backend/src/llm/claude.js` — tool call/result log.
- `backend/src/llm/deepseek.js` — tool call/result log.
- `backend/src/telegram/handoff.js` — debugLog + console content/id/provider-error logs.

Docs:
- `report/phase-21/PROMPT_BE_02_CI_AND_LOG_REDACTION_REPORT.md` (file này).
- `docs/status/BUG_TRACKER.md` — entry CI bug.
- `docs/status/BACKEND_CLEAN_CODE_AUDIT_MATRIX.md` — ghi nhận log risk giảm.

**Không sửa:** dashboard source, Prisma schema/migration, `.env*`, `package.json`/`package-lock.json`, webhook behavior.

## 3. Log redaction helper

`backend/src/infrastructure/services/redaction.js` — thuần CommonJS, không import DB/Express/provider, không tự log, có `node --check`:

- `maskId(value, visible=4)` → `***1234`, không log full id.
- `summarizeText(value)` → `{ present, length }`, không lộ nội dung.
- `safeError(error)` → `{ name, message(≤200), status, code }`, **không** trả `response.data`/token/stack dài.
- `redactObjectKeys(obj, keys)` → thay key nhạy cảm bằng `[redacted]`.
- `isPresent(value)` → boolean.

Đồng bộ style với `maskId/safeError` sẵn có trong `webhook/handler.js` (không sửa handler.js — đã redact tốt từ BE-01).

## 4. Logs patched (rủi ro → hành động)

| File | Log cũ (rủi ro) | Hành động |
|---|---|---|
| `api/dashboard.js` | test-message: raw `message` + `fakeSenderId`; bot response object; error đầy đủ | `maskId` sender, `summarizeText` message, `isPresent` response, `safeError` |
| `bot/engine.js` | `Postback: ${payload} from ${senderId}` | `maskId(senderId)`, `summarizeText(payload)` |
| `bot/agent.js` | `New conversation: ${senderId} (${userName})` — full id + tên khách | `maskId(senderId)`, `isPresent(userName)`, giữ tenantId |
| `facebook/menu.js` ×3 | `error.response?.data` — provider response body (có thể lộ token/PII) | `safeError(error)` (return value API giữ nguyên) |
| `llm/claude.js` ×2 | `JSON.stringify(tu.input)` / `result` — nội dung tool/tin nhắn | `summarizeText(JSON.stringify(...))` |
| `llm/deepseek.js` ×2 | `JSON.stringify(toolInput)` / `result` | `summarizeText(JSON.stringify(...))` |
| `telegram/handoff.js` | debugLog: `fbUserId` + raw `msg`, staff name lists, `telegramChatId` + provider error body; console: raw customer/bot message content, full `fbUserId`, `JSON.stringify(sent.error)` | `maskId` id/chatId, `summarizeText` content, `safeError` error, bỏ list tên staff (đã có count) |

Return values dùng cho API response (vd `menu.js` `{ error: ... }`, `dashboard test-message` echo) **giữ nguyên** để không đổi contract.

## 5. Logs deferred / accepted (không sửa, có lý do)

- **Stack traces** `console.error('… Stack:', e.stack)` (`telegram/handoff.js`): không chứa PII khách/token; hữu ích debug → giữ, `DEFERRED_LOW_RISK`.
- **Staff name** trong `console.error('Failed to DM staff ${staff.name}', e.message)` (`telegram/handoff.js`, `tenants/handoff.js`): tên nội bộ operator, không phải id/token/khách; `e.message` an toàn → giữ, `ACCEPTED_LOW_RISK`. `telegramChatId` liên quan đã được mask.
- **`webhook/handler.js`**: đã redact đầy đủ từ BE-01 (maskId/safeError/summarize) → không sửa (không đổi webhook behavior).
- `bot/tools.js`, `rag/**`, `tenants/handoff.js`, `notifications/**`, `llm/factory.js`: scan chỉ log `error.message`/metadata, **không** raw content/full id/token → không cần sửa.

## 6. Validation

| Gate | Kết quả |
|---|---|
| `node --check` 8 file (helper + 7 patched) | PASS |
| require-resolution leaf modules (`llm/claude`, `llm/deepseek`) | PASS (helper path resolve) |
| unit-check helper (`maskId`/`summarizeText`/`safeError` drop `response.data`, truncate message) | PASS |
| `backend npm run quality` | PASS |
| `backend npx prisma validate` (có `.env`) | PASS |
| `backend prisma validate` env-less + dummy `DATABASE_URL` (mô phỏng CI sau fix) | PASS |
| `dashboard npm run typecheck` | PASS |
| `dashboard npm run build` | PASS (17 routes) |
| lockfile sync (`npm install --package-lock-only` → git diff) | IN_SYNC (không đổi) |

Ghi chú `npm ci`: local `npm ci` báo EBUSY vì tiến trình backend(3001)/dashboard đang giữ `node_modules` — đây là artifact local, **không** phải lỗi CI (GitHub Actions cài từ đầu, không có tiến trình giữ file). Đã xác minh lockfile IN_SYNC và các gate tương đương PASS. (Một lần `npm ci` fail dở đã xóa mất `@prisma/client` local; đã khôi phục bằng `npm install`, lockfile không đổi.)

## 7. Backend smoke (tiến trình 3001 hiện có, không restart để tránh side-effect external)

| Check | Kết quả |
|---|---|
| `GET /health` | PASS 200 |
| `GET /webhook` thiếu params | PASS 403 |
| `POST /chatwoot-webhook` | PASS 404 |
| invalid login | PASS 401 |
| no-token `/api/prompts` `/api/stats` `/api/facebook-pages` | PASS 401 |

Không gọi Facebook/Telegram/LLM thật. Không POST fake `page` vào `/webhook`. Log patch là log-only, behavior không đổi; code mới đã validate tĩnh (syntax + require + unit helper).

## 8. Log regression scan (file đã patch)

- `substring(0` trong log → CLEAN.
- `response.data` trong log → CLEAN.
- `JSON.stringify(...)` raw trong log (không qua `summarizeText`/`safeError`) → CLEAN.
- `${senderId}` / `${fbUserId}` / `${staff.telegramChatId}` / `${conversation.fbUserId}` trong log → CLEAN.

## 9. Secret scan trước push

- Tracked forbidden files → CLEAN.
- Content secret scan → chỉ placeholder trong docs/`.env.example` và dummy `user:password@localhost` trong `ci.yml` (không phải secret). CLEAN.

## 10. GitHub push result

Xem mục cập nhật cuối (Phase 10 thực thi).

## 11. Remaining risk

1. CI xanh thật sự chỉ xác nhận được sau khi GitHub Actions chạy (không có `gh` để xem log). Đã fix đúng nguyên nhân đã tái hiện + verify local env-less.
2. Stack trace & staff name logs giữ lại (low-risk) — có thể siết thêm ở prompt sau nếu App Review yêu cầu.
3. Backend đang chạy vẫn là code cũ (chưa restart để tránh side-effect); log mới sẽ có hiệu lực sau lần restart tiếp theo của operator.
4. BE-01 WARN khác (monolith `dashboard.js`, startup side-effect) ngoài phạm vi BE-02.

## 12. Next step

- Sau push, người vận hành xác nhận GitHub Actions cả 2 job xanh.
- BE-03: tách startup side-effect (`index.js`) để smoke/test import app không gọi external.
- Khi restart backend, kiểm chứng log redaction chạy runtime với 1 test-message an toàn.
