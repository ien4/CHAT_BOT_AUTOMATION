# PROMPT 22A-1 — WEBHOOK LOG REDACTION REPORT

Ngày thực hiện: 2026-07-12
Trạng thái: **PASS WITH WARNINGS**

## 1. Mục tiêu

Audit và harden logging trong direct Facebook/Meta webhook path trước khi chạy public staging POST event thật. Không refactor rộng, không đổi webhook behavior, không sửa schema/package/dashboard, không gọi Meta/Facebook API thật, không gửi Meta POST event thật và không production rollout.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không phải main/master |
| Commit 22A | `28b1be6 Document Meta webhook staging readiness` tồn tại |
| Remote | Không có remote output |
| Working tree trước patch | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked env scan | Chỉ match `backend/.env.example`; env thật không tracked/staged |

Không mở/in env thật, token hoặc secret.

## 3. Context files read

- `report/PROMPT_22A_META_WEBHOOK_STAGING_READINESS_REPORT.md`
- `docs/META_WEBHOOK_STAGING_READINESS.md`
- `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/ENV_POLICY.md`
- `docs/QUALITY_GATE.md`
- `backend/src/webhook/handler.js`
- `backend/src/index.js`
- `backend/.env.example`

## 4. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

## 5. Webhook log audit

| File | Dòng/log | Có thể chứa gì | PII/secret risk | Hành động |
|---|---|---|---|---|
| `backend/src/webhook/handler.js` | verify success/fail | status verify generic | SAFE_METADATA | Giữ nhưng đổi qua `logWebhookInfo/Warn`, không log token/challenge. |
| `backend/src/webhook/handler.js` | `Message from ${senderId}: "${messageText}"` | full sender id + message text | PII_RISK | Removed; thay bằng metadata masked id + textLength/hasText. |
| `backend/src/webhook/handler.js` | rate limit sender | full sender id | PII_RISK | Mask sender id. |
| `backend/src/webhook/handler.js` | handoff relay/pending/initiated | full sender id | PII_RISK | Mask sender id + conversation id. |
| `backend/src/webhook/handler.js` | postback log | full sender id + payload | PII_RISK | Removed payload log; chỉ log payloadLength/hasPostback/hasQuickReply. |
| `backend/src/webhook/handler.js` | outbound send success | full recipient id + outbound text preview | PII_RISK | Removed preview; mask recipient id, log textLength/hasText. |
| `backend/src/webhook/handler.js` | send error `error.response.data` | provider raw error detail | SECRET_RISK/PII_RISK | Replaced with `safeError()` name/status/code only. |
| `backend/src/webhook/handler.js` | user profile fetch error | PSID + error message nếu mở rộng | PII_RISK | Mask PSID and use safe error. |
| `backend/src/index.js` | startup/health/default seed logs | status/count/port | SAFE_METADATA | Không sửa trong prompt này. |
| `backend/src/index.js` | unhandled error object | generic uncaught error | ERROR_SAFE with residual risk | Out of scope; không phải direct payload log. |
| `backend/src/facebook/menu.js` | profile setup/reset error response | Facebook API detail | HISTORICAL_OR_OUT_OF_SCOPE | Không sửa vì prompt chỉ cho handler direct path. |
| `backend/src/bot/**`, `backend/src/telegram/**`, `backend/src/tenants/**` | nhiều log sender/display/message preview | HISTORICAL_OR_OUT_OF_SCOPE | Ngoài scope 22A-1; report để prompt sau nếu muốn harden sâu. |

Kết luận audit: trước patch có log message text, full sender id, full recipient id, postback payload và outbound text preview trong `handler.js`. Không thấy verify handler log token/challenge.

## 6. Redaction design

Thiết kế nhỏ trong cùng `handler.js`:

- `maskId(value)`: chỉ giữ 4 ký tự cuối, không log full id.
- `summarizeMessagingEvent(event)`: chỉ trả metadata an toàn: masked id, boolean, count, length.
- `safeError(error)`: chỉ log `name`, HTTP `status`, `code`; không log raw response data.
- `logWebhookInfo/Warn/Error`: chuẩn hóa log label + metadata redacted.

Không thêm dependency, không thêm env bắt buộc, không đổi export.

## 7. Source changes

Chỉ sửa `backend/src/webhook/handler.js`:

- Removed log message text gốc.
- Removed full sender id/full recipient id trong log.
- Removed postback payload trong log.
- Removed outbound text preview trong log.
- Removed raw Graph error detail trong log.
- Added metadata log cho entry count, messaging count, masked page/sender/recipient id, hasText, textLength, hasAttachments, hasPostback, payloadLength.

## 8. Behavior preservation

Đã giữ nguyên:

- `GET /webhook` verify route behavior: token đúng trả challenge, sai/thiếu trả 403.
- `POST /webhook` behavior: non-page trả 404, page trả `EVENT_RECEIVED` rồi xử lý async.
- Call `botEngine.getOrCreateConversation`, `saveMessage`, `processMessage`, `processPostback`.
- Call handoff relay/append/initiate.
- Call `sendMessage`, `sendQuickReply`, `getUserProfile`, `markSeen`, `sendTypingOn`.
- `module.exports` không đổi.

## 9. Static validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && node --check src/webhook/handler.js` | PASS |
| `cd backend && node --check src/index.js` | PASS |
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |

## 10. Safe runtime smoke

Kết quả: **BLOCKED**.

| Check | Kết quả |
|---|---|
| `Test-NetConnection localhost -Port 3001` | Không listen |
| `Test-NetConnection localhost -Port 5433` | Không listen |

Không start backend vì DB không sẵn. Không chạy Docker Compose, không chạy `start-all.bat`, không gửi POST object `page`, không dùng verify token đúng thật và không gọi Meta.

## 11. Log safety scans

Sau patch:

- Scan còn match `event.message.text`, `event.sender.id`, `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `access_token` vì code cần đọc field/token để xử lý hoặc gửi API. Đây là **read for processing**, không phải log output.
- Không còn console log trực tiếp message text, full sender id, full recipient id, raw body hoặc JSON stringify raw event/body trong `handler.js`.
- Console output trong `handler.js` chỉ đi qua `logWebhookInfo/Warn/Error` với metadata redacted.
- Không log verify token, page access token hoặc app secret.

## 12. Docs/runbook updates

- Tạo `docs/META_WEBHOOK_STAGING_RUNBOOK.md`.
- Cập nhật `docs/META_WEBHOOK_STAGING_READINESS.md`.
- Cập nhật `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`.
- Cập nhật `docs/PROJECT_PROGRESS.md`.
- Cập nhật `docs/FEATURE_AUDIT_CHECKLIST.md`.
- Cập nhật `docs/REFACTOR_PLAN.md`.
- Cập nhật `docs/CURRENT_STATUS_INDEX.md`.

## 13. Không thay đổi

- Không sửa `backend/src/index.js`.
- Không sửa `backend/src/api/dashboard.js`.
- Không sửa `backend/src/bot/**`, `backend/src/rag/**`, `backend/src/telegram/**`, `backend/src/tenants/**`, `backend/src/facebook/**`.
- Không sửa `dashboard/src/**`.
- Không sửa Prisma schema/migrations.
- Không sửa package/package-lock.
- Không sửa Dockerfile/start scripts/docker-compose.
- Không sửa env thật, `.next`, backup, temp/log.
- Không gọi Meta/Facebook API thật.
- Không gửi Meta POST event thật.
- Không production rollout.

## 14. Remaining warnings

- Runtime smoke local bị block vì DB/backend không listen.
- Public URL vẫn chưa có: `STAGING_BASE_URL` chưa được cung cấp.
- Meta Developer verification vẫn PENDING.
- Meta POST event thật vẫn PENDING.
- Production rollout vẫn PENDING.
- Các module ngoài `handler.js` còn log lịch sử/out-of-scope có thể cần prompt privacy logging riêng nếu muốn harden sâu toàn hệ thống.

## 15. Final verdict

**PASS WITH WARNINGS**

Source log redaction trong direct webhook handler đã hoàn tất và validation PASS. Warning còn lại nằm ở runtime smoke local bị block và public staging URL chưa có.

## 16. Next step

1. Khôi phục local DB/backend nếu cần runtime smoke local cho source mới.
2. Cung cấp `STAGING_BASE_URL` rồi chạy public smoke không dùng secret.
3. Sau public smoke PASS, người vận hành verify Meta Developer thủ công bằng callback `https://<domain>/webhook`.
4. Sau verify PASS mới test POST event thật và quan sát log redacted.
