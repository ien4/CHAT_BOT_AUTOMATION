# PROMPT 08E — TENANT CONTRACT RUNTIME SMOKE REPORT

Ngày thực hiện: 2026-07-09
Branch: `chore/prompt-05r-docs-local-run`

## 1. Mục tiêu

- Runtime verify tenant create/update bằng payload mới không chứa legacy fields.
- Backend legacy stop-write prep: ngừng nhận/ghi/expose field Chatwoot ở tenant API.
- Giữ compatibility DB tạm (schema legacy chưa drop). Không sửa Prisma schema/migrations.

## 2. Source files changed

- `backend/src/api/dashboard.js` (1 file source duy nhất):
  - `POST /api/tenants`: bỏ destructure field legacy; chỉ cần `slug`/`name` + field trung tính; backend tự set `direct-facebook` cho cột NOT NULL `chatwootModel`/`chatwootAccountId`.
  - `PUT /api/tenants/:id`: bỏ toàn bộ nhánh ghi legacy (model/account/baseUrl/team/apiToken/webhookSecret) — stop-write.
  - `maskTenant()`: strip cột legacy khỏi response; thêm `integrationMode`/`messagingMode = direct-facebook`.
  - Gỡ import `encryptIfPresent` không còn dùng.

Dashboard: không sửa (đã sạch từ 08D — chỉ gửi field trung tính, interface `Tenant` không có field legacy).

## 3. Tenant contract trước/sau

| File/Route | Field/behavior | Client còn dùng? | Patch action |
|---|---|---|---|
| POST /api/tenants | Trước: nhận `chatwootModel/AccountId/BaseUrl/ApiToken/TeamId/webhookSecret` | Không | Bỏ nhận; chỉ `slug/name` + trung tính, compat nội bộ |
| PUT /api/tenants/:id | Trước: ghi legacy token/secret/model/account/... | Không | Bỏ hết nhánh legacy (stop-write) |
| maskTenant() | Trước: spread cả cột legacy + `hasApiToken/hasWebhookSecret/webhookUrl` | Không | Strip legacy, thêm `integrationMode/messagingMode` |
| Dashboard tenants page | Gửi `slug/name/telegramGroupChatId/timeout/persona/isActive` | — | Không cần sửa |

## 4. Runtime smoke create/update tenant

Mount tạm Express (chỉ `/webhook` + `/api` dashboardApi, tránh side-effect Telegram/Facebook/scheduler), JWT platform-admin ký bằng `JWT_SECRET`, DB local `bbotech-pgvector-local`.
Lưu ý: slug validation `^[a-z0-9-]+$` không cho underscore → test dùng `test-08e-<timestamp>`.

- no-token GET /api/tenants => 401 — PASS
- POST /api/tenants `{slug,name}` => 201, response không chứa key legacy, `integrationMode=direct-facebook` — PASS
- GET /api/tenants + GET /api/tenants/:id => tenant xuất hiện, không key legacy — PASS
- PUT /api/tenants/:id `{name}` => 200, không key legacy — PASS
- DELETE tenant test => 200; cleanup `test-08e-*`/`test_08e_*` còn 0 — PASS

## 5. Regression smoke

- GET /api/prompts (token) => 200 — PASS
- GET /api/settings/handoff (token) => 200 — PASS
- GET /api/settings/telegram-destinations (token) => 200 — PASS
- GET /webhook verify token sai => 403 (không crash) — PASS
- POST /chatwoot-webhook => 404 — PASS
- GET /api/settings/chatwoot-test => 404 — PASS
- GET /api/channel-configs/lookup-inboxes => 404 — PASS

Tổng: **17/17 PASS**.

## 6. Validation

- `node --check` backend (index/db/dashboard/config/credentialCrypto/webhook/handoff) — PASS.
- `npx prisma validate` — PASS.
- Dashboard `npx --no-install tsc --noEmit` — PASS.
- Dashboard `npm run build` — PASS.
- `git diff --check` — chỉ warning CRLF/LF của Git trên Windows.
- Post-patch scan: `dashboard/src` 0 match Chatwoot; `backend/src` chỉ còn tên cột Prisma legacy (bắt buộc vì schema chưa drop) + 3 README kiến trúc.

## 7. Không thay đổi

Prisma schema/migrations, RAG/raw SQL, direct Facebook webhook, tenant handoff, bot engine/tools, package files, Dockerfile/scripts, `.env` thật. Không tạo migration, không `db push`, không push remote, không đổi route path/method/auth guard.

## 8. Remaining blockers

- Cột schema legacy (`tenants.chatwoot_*`, `tenants.webhook_secret_enc`, `conversations.chatwoot_conversation_id`) vẫn còn — cần prompt migration drop có backup.
- Dashboard lint vẫn open (`next lint` mở prompt ESLint tương tác).

## 9. Final verdict

**PASS**

## 10. Next step

- Prompt schema-removal: backup DB rồi tạo migration mới drop cột/index legacy trên local/staging trước production (điều kiện stop-write đã đạt ở 08E).
- Prompt quality gate: cấu hình ESLint non-interactive để đưa lint vào validation.
