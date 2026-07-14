# PROMPT 08B — BACKEND CHATWOOT RUNTIME REMOVAL REPORT

Ngày thực hiện: 2026-07-09
Trạng thái: **PASS WITH WARNINGS**

## 1. Mục tiêu

Prompt 08B thực hiện bước gỡ Chatwoot khỏi **backend runtime** theo chỉ thị kiến trúc No-Chatwoot từ Prompt 08A.

Mục tiêu chính:

- Xóa endpoint runtime `/chatwoot-webhook` và `/chatwoot-webhook/:slug`.
- Xóa handler/client/adapter Chatwoot active code.
- Bỏ các nhánh handoff sync qua Chatwoot.
- Giữ nguyên direct Facebook webhook `GET /webhook` và `POST /webhook`.
- Không thay đổi schema/migrations/env/dashboard/frontend/RAG/package/DevOps.

## 2. Preflight

- Branch làm việc: `chore/prompt-05r-docs-local-run`.
- Working tree sạch trước patch.
- Commit Prompt 08A tồn tại: `9851bd1`.
- `backend/.env` và `dashboard/.env.local` vẫn bị gitignore.
- Không có env file thật được stage hoặc commit.
- Không đọc/in nội dung secret trong `.env` thật.

## 3. Baseline trước patch

Baseline trước khi sửa PASS:

- `node --check src/index.js`
- `node --check src/db.js`
- `node --check src/api/dashboard.js`
- `node --check src/webhook/handler.js`
- `node --check src/telegram/handoff.js`
- `node --check src/tenants/handoff.js`
- `node --check` cho settings/prompts controllers/routes đã tách.
- `node --check` cho các file Chatwoot cũ trước khi xóa.
- `npx prisma validate`

## 4. Thay đổi runtime backend

### `backend/src/index.js`

Đã xóa:

- Import `./webhook/chatwootHandler`.
- Import `./tenants/webhookHandler`.
- Route `POST /chatwoot-webhook`.
- Route `POST /chatwoot-webhook/:slug`.

Đã giữ:

- `GET /webhook`
- `POST /webhook`
- Raw body capture chung cho request vẫn giữ.

### `backend/src/api/dashboard.js`

Đã xóa:

- Route `GET /settings/chatwoot-test`.
- Route `GET /channel-configs/lookup-inboxes`.
- Helper `mapChatwootChannel`.

Đã đổi:

- Import crypto từ helper generic `../infrastructure/services/credentialCrypto`.
- `maskTenant(...).webhookUrl` trả `null`.
- `GET /tenants/:id/webhook-info` trả `410` với target `direct-facebook-webhook` để không phát sinh hướng dẫn webhook Chatwoot cũ.

Không đổi trong Prompt 08B:

- Các field Prisma legacy `chatwootModel`, `chatwootAccountId`, `chatwootBaseUrl`, `chatwootApiTokenEnc`, `chatwootTeamId`.
- Logic create/update tenant còn nhận field legacy để tránh đụng schema trong phase runtime removal.

## 5. File runtime Chatwoot đã xóa

Đã xóa các file:

- `backend/src/webhook/chatwootHandler.js`
- `backend/src/tenants/webhookHandler.js`
- `backend/src/chatwoot/api.js`
- `backend/src/chatwoot/crypto.js`
- `backend/src/adapters/chatwootAdapter.js`
- `backend/src/infrastructure/integrations/chatwoot/README.md`

## 6. Credential crypto

Đã thêm:

- `backend/src/infrastructure/services/credentialCrypto.js`

Mục đích:

- Giữ khả năng mã hóa credential legacy còn trong schema mà không phụ thuộc namespace Chatwoot.
- Export các hàm generic: `encrypt`, `decrypt`, `encryptIfPresent`, `decryptIfPresent`.

## 7. Tenant registry

Đã sửa:

- `backend/src/tenants/registry.js`

Kết quả:

- Không còn import `../chatwoot/crypto`.
- Không còn decrypt `_decryptedApiToken`.
- Không còn decrypt `_webhookSecret`.
- Cache tenant trực tiếp từ DB, không enrich credential Chatwoot runtime.

## 8. Telegram/owner handoff

Đã sửa:

- `backend/src/telegram/handoff.js`

Kết quả:

- Không còn import `../chatwoot/api`.
- Không còn link Chatwoot trong staff notification.
- Không còn sync `handoffToHuman`/`botTakeOver` qua Chatwoot.
- Staff outbound vẫn gửi trực tiếp về Facebook qua nhánh `sendFBMessage(...)` hiện hữu.

## 9. Tenant handoff

Đã sửa:

- `backend/src/tenants/handoff.js`

Kết quả:

- Không còn `createTenantChatwootClient`.
- Không còn relay/takeover/end-session/pending-timeout qua Chatwoot.
- Tenant staff outbound không fallback sang Chatwoot; thay vào đó trả thông báo rõ ràng rằng tenant direct outbound chưa được implement trong backend hiện tại.
- Bot-generated reply ở tenant handoff không gửi qua Chatwoot; ghi warning để prompt sau nối direct Facebook outbound theo tenant.

## 10. Scan sau patch

Scan route/runtime Chatwoot:

- `rg -n "router\\.(get|post|put|delete).*chatwoot|app\\.(get|post|put|delete).*chatwoot" backend/src` không còn kết quả.
- `rg -n "lookup-inboxes|inboxes|settings/chatwoot-test|chatwoot-test" backend/src/api/dashboard.js` không còn kết quả.
- `rg -n "chatwoot-webhook|chatwootHandler|chatwootAdapter|sendChatwoot|CHATWOOT|Chatwoot" backend/src` chỉ còn docs/config warning, không còn route/handler/client active.

Remaining references hợp lệ trong phạm vi 08B:

- `backend/src/api/dashboard.js`: field Prisma legacy `chatwoot*` còn lại vì Prompt 08B không sửa schema/migration.
- `backend/src/infrastructure/services/config.js`: warning `CHATWOOT_API_TOKEN`, `CHATWOOT_WEBHOOK_SECRET` còn lại cho Prompt 08C env cleanup.
- `backend/src/domain/README.md`, `backend/src/infrastructure/README.md`, `backend/src/infrastructure/integrations/README.md`: README placeholder từ phase architecture shell; cleanup docs sau.

## 11. Static validation sau patch

PASS:

- `node --check src/index.js`
- `node --check src/db.js`
- `node --check src/api/dashboard.js`
- `node --check src/webhook/handler.js`
- `node --check src/telegram/handoff.js`
- `node --check src/tenants/handoff.js`
- `node --check src/presentation/http/controllers/dashboard/settings.controller.js`
- `node --check src/presentation/http/routes/dashboard/settings.routes.js`
- `node --check src/presentation/http/controllers/dashboard/prompts.controller.js`
- `node --check src/presentation/http/routes/dashboard/prompts.routes.js`
- `node --check src/infrastructure/repositories/handoffSettings.repository.js`
- `node --check src/infrastructure/repositories/telegramDestinations.repository.js`
- `node --check src/infrastructure/repositories/promptTemplates.repository.js`
- `node --check src/infrastructure/services/credentialCrypto.js`
- `npx prisma validate`

Prisma validate dùng schema hiện tại, không chạy migration, không chạy `db push`.

## 12. Runtime smoke test

Smoke test chạy bằng Express app tạm mount:

- `GET /webhook`
- `POST /webhook`
- `dashboardApi` dưới `/api`

Không start `src/index.js`, không gọi Facebook/Telegram/Gemini/Chatwoot thật.

Kết quả PASS 16/16:

| Check | Kết quả |
|---|---|
| `GET /webhook` thiếu/wrong verify token | 403 |
| `POST /chatwoot-webhook` | 404 |
| `POST /chatwoot-webhook/:slug` | 404 |
| `GET /api/settings/chatwoot-test` | 404 |
| `GET /api/channel-configs/lookup-inboxes` | 404 |
| `GET /api/prompts` không token | 401 |
| `GET /api/prompts` platform token | 200 |
| `GET /api/prompts?layer=intent` platform token | 200 |
| `GET /api/settings/telegram-destinations` | 200 |
| `GET /api/settings/handoff` | 200 |
| `PUT /api/settings/handoff` current-equivalent payload | 200 |
| Tenant token gọi `/api/handoff/active` | 403 |
| Tenant token gọi cross-tenant `/api/tenants/:id/staff` | 403 |
| Tenant token xem prompt tenant khác | 404 |
| Tenant token xem conversation tenant khác | 404 |
| Tenant token xem messages tenant khác | 404 |

Cleanup smoke:

- Prompt sample đã xóa.
- Conversation/message sample đã xóa.
- Handoff singleton được khôi phục trạng thái trước smoke nếu smoke tạo mới.
- Server tạm đã close.

## 13. Database/local runtime

- Local Postgres container: `bbotech-pgvector-local`.
- Port: `localhost:5433`.
- Trạng thái: running.
- Không chạy `docker compose`.
- Không chạy migration.
- Không chạy `prisma db push`.

## 14. Không thay đổi ngoài phạm vi

Không sửa:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/**`
- `backend/.env`, `dashboard/.env.local`
- `.env.example` và docs env policy
- Dashboard frontend/API client
- RAG/raw SQL
- Package files
- Dockerfile
- Batch/scripts/DevOps

Không thực hiện:

- Không push remote.
- Không switch branch.
- Không dùng `git add .`.
- Không in secret/token/base64.

## 15. Rủi ro còn lại

Các rủi ro còn lại không thuộc phạm vi sửa của Prompt 08B:

- Prisma schema vẫn còn field `chatwoot*` trong `Tenant` và `Conversation.chatwootConversationId`.
- Dashboard frontend/API client vẫn có thể còn UI/call liên quan Chatwoot; backend route đã trả 404 hoặc 410 nên cần Prompt 08D để cleanup UX.
- Env/config warning vẫn còn `CHATWOOT_*`; cần Prompt 08C để thống nhất env policy.
- Backend scripts cũ còn require helper Chatwoot đã xóa: `backend/scripts/fix_tenant_token.js`, `backend/scripts/test_decrypt.js`; scripts không thuộc runtime backend Prompt 08B và cần Prompt 10/DevOps cleanup.
- Tenant direct outbound Facebook chưa được implement; hiện tại không còn fallback sang Chatwoot để tránh gọi kiến trúc cũ.

## 16. Điểm cần tu sửa

- Prompt 08C: lập migration/env cleanup plan cho dữ liệu và field legacy Chatwoot, không dùng `db push`.
- Prompt 08D: xóa UI/API client Chatwoot khỏi dashboard và thay copy/hành vi sang direct Facebook/backend.
- Prompt riêng cho tenant direct outbound: thiết kế cách gửi tin Facebook đúng page/tenant mà không đi qua Chatwoot.
- Prompt DevOps sau đó: xóa script/batch/webhook URL cũ liên quan Chatwoot.

## 17. Gợi ý tiếp theo

Thứ tự khuyến nghị:

1. **Prompt 08C — Prisma/env No-Chatwoot cleanup plan**.
2. **Prompt 08D — Dashboard No-Chatwoot cleanup**.
3. **Prompt tenant direct outbound Facebook** nếu tenant handoff cần reply thật từ staff.
4. **Prompt 09 — RAG/raw SQL hardening**.
5. **Prompt 10 — DevOps/script cleanup**.

Kết luận: **PASS WITH WARNINGS** vì backend runtime Chatwoot đã được gỡ và smoke test pass, nhưng schema/env/dashboard/scripts legacy vẫn còn theo đúng phạm vi để các prompt sau xử lý.
