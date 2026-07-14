# NO-CHATWOOT SCHEMA & ENV CLEANUP PLAN

Ngày cập nhật: 2026-07-10

> **Cập nhật Prompt 08F (2026-07-10):** Kế hoạch drop schema ở mục 5 đã được THỰC THI trên DB local/test `bbotech-pgvector-local`.
> Migration `20260710025758_remove_no_chatwoot_legacy_columns` đã drop index `conversations_chatwoot_conversation_id_idx` + cột `conversations.chatwoot_conversation_id` và 6 cột `tenants.chatwoot_*`/`webhook_secret_enc`.
> Backup local đã tạo trước migration (`backups/prompt-08f-before-schema-drop-<timestamp>.dump`, không commit). Không dùng `db push`, không `--accept-data-loss`, không reset. Runtime smoke tenant create/update PASS 13/13.
> Production rollout vẫn cần backup + `prisma migrate deploy` riêng theo mục 5.

## 1. Mục tiêu

Tài liệu này chốt kế hoạch cleanup Prisma schema và env sau khi backend Chatwoot runtime đã được gỡ ở Prompt 08B.

Mục tiêu của Prompt 08C:

- Cleanup env example và backend config warning an toàn.
- Lập kế hoạch drop schema legacy liên quan Chatwoot.
- Không sửa `backend/prisma/schema.prisma`.
- Không sửa migration lịch sử.
- Không tạo migration mới.
- Không chạy `db push`, migration hoặc production DB.

## 2. Trạng thái sau Prompt 08B

- Direct Facebook webhook `GET /webhook` và `POST /webhook` vẫn tồn tại.
- Backend route `/chatwoot-webhook*` đã bị gỡ.
- Backend Chatwoot handler/client/adapter runtime đã bị xóa.
- Handoff không còn sync qua Chatwoot.
- Backend route test/lookup Chatwoot cũ đã bị gỡ.
- Prisma schema, migrations lịch sử, dashboard frontend/API client, DevOps scripts vẫn còn legacy references theo đúng backlog.

## 3. Env cleanup đã áp dụng trong 08C

| File | Cleanup | Ghi chú |
|---|---|---|
| `backend/.env.example` | Xóa block `CHATWOOT_*` | Giữ Facebook, Telegram, LLM, auth, database, rate-limit và server env. |
| `backend/.env.example` | Bổ sung ghi chú local DB `localhost:5433` | Tránh nhầm giữa Docker internal `postgres:5432` và local pgvector host port `5433`. |
| `dashboard/.env.example` | Xóa `NEXT_PUBLIC_CHATWOOT_URL` | Dashboard public env target chỉ còn `NEXT_PUBLIC_API_URL`. |
| `backend/src/infrastructure/services/config.js` | Xóa warning placeholder `CHATWOOT_API_TOKEN`, `CHATWOOT_WEBHOOK_SECRET` | Không còn cảnh báo env legacy sau khi backend runtime Chatwoot đã bị gỡ. |
| `docs/policies/ENV_POLICY.md` | Cập nhật No-Chatwoot env policy | Ghi rõ `CHATWOOT_*` và `NEXT_PUBLIC_CHATWOOT_URL` là legacy/deprecated, không thuộc target mới. |

## 4. Schema legacy fields còn lại

| Model | Field legacy | Current usage | Runtime còn dùng? | Data migration risk | Proposed action |
|---|---|---|---|---|---|
| `Conversation` | `chatwootConversationId` (`chatwoot_conversation_id`) | Schema và migration lịch sử; không còn explicit backend runtime read/write sau 08B | Không trong backend runtime active; có thể vẫn tồn tại trong DB và response thô | Cần drop index `conversations_chatwoot_conversation_id_idx` trước/same migration với column | Drop bằng migration mới sau khi dashboard/source scan không còn reference và sau backup. |
| `Tenant` | `chatwootModel` (`chatwoot_model`) | Backend tenant create/update vẫn nhận và ghi; dashboard tenants page vẫn gửi payload | Có, qua dashboard API tenant CRUD | Không thể drop trước khi backend/dashboard tenant form đổi sang model direct Facebook/backend | 08D/08E phải dừng read/write trước; migration drop sau. |
| `Tenant` | `chatwootAccountId` (`chatwoot_account_id`) | Backend tenant create currently required; dashboard tenants page default/gửi field | Có, là blocker lớn nhất | Field đang `NOT NULL`; drop/relax cần migration có kiểm soát và API redesign | Trước schema removal phải sửa backend API tenant create/update và dashboard form. |
| `Tenant` | `chatwootBaseUrl` (`chatwoot_base_url`) | Backend tenant create/update vẫn ghi optional; dashboard tenants page vẫn dùng cho dedicated mode | Có qua tenant CRUD | Có thể chứa URL nội bộ cũ; không cần giữ cho target mới | Stop write ở backend/dashboard, sau đó drop column bằng migration mới. |
| `Tenant` | `chatwootApiTokenEnc` (`chatwoot_api_token_enc`) | Backend tenant create/update vẫn encrypt/mask; scripts cũ vẫn tham chiếu | Có qua tenant CRUD; không còn dùng để gọi Chatwoot runtime | Có thể chứa secret encrypted; cần backup/retention policy trước drop | Sau khi API/dashboard/scripts không còn dùng, drop column bằng migration mới. |
| `Tenant` | `chatwootTeamId` (`chatwoot_team_id`) | Backend tenant create/update vẫn ghi optional; dashboard tenants page vẫn gửi | Có qua tenant CRUD | Thấp hơn token/account id nhưng vẫn là schema/API contract | Stop write ở backend/dashboard, sau đó drop column bằng migration mới. |
| `Tenant` | `webhookSecretEnc` (`webhook_secret_enc`) | Backend tenant create/update vẫn encrypt/mask; tên không chứa Chatwoot nhưng nguồn gốc là tenant Chatwoot webhook secret | Có qua tenant CRUD | Cần quyết định có repurpose cho direct Facebook không; không tự drop trong 08C | Đánh dấu legacy-adjacent. Chỉ drop nếu prompt schema removal xác nhận không còn direct-webhook use case. |

## 5. Migration strategy đề xuất

Không làm trong Prompt 08C:

- Không dùng `prisma db push`.
- Không dùng `prisma db push --accept-data-loss`.
- Không xóa migration lịch sử.
- Không sửa schema hiện tại.
- Không tạo migration mới.

Chiến lược đề xuất:

1. Stop writing legacy fields trong backend API tenant CRUD.
2. Dashboard cleanup ở Prompt 08D: bỏ form/copy/API payload Chatwoot trong settings, tenants, channel configs và API client.
3. Tenant direct outbound Facebook prompt nếu business cần staff tenant reply thật.
4. Verify bằng scan không còn runtime read/write `chatwoot*` trong backend/dashboard source.
5. Backup production database trước migration.
6. Tạo migration mới để drop columns/indexes legacy.
7. Chạy migration trên local/staging trước production.
8. Có rollback plan: backup restore hoặc migration rollback có chủ đích, không dùng `db push`.

Migration drop dự kiến sau khi blockers đóng:

- Drop index `conversations_chatwoot_conversation_id_idx`.
- Drop column `conversations.chatwoot_conversation_id`.
- Drop columns `tenants.chatwoot_model`, `tenants.chatwoot_account_id`, `tenants.chatwoot_base_url`, `tenants.chatwoot_api_token_enc`, `tenants.chatwoot_team_id`.
- Chỉ drop `tenants.webhook_secret_enc` nếu xác nhận không dùng cho direct webhook/security target mới.

## 6. Dashboard blockers trước khi drop schema

- `dashboard/src/lib/config/env.ts` vẫn export `CHATWOOT_BASE_URL` và đọc `NEXT_PUBLIC_CHATWOOT_URL`.
- `dashboard/src/lib/api.ts` vẫn có `channelConfigsApi.lookupInboxes()`.
- `dashboard/src/app/dashboard/settings/page.tsx` vẫn import/hiển thị Chatwoot base URL và gọi route test cũ.
- `dashboard/src/app/dashboard/channel-configs/page.tsx` vẫn có copy/toast Chatwoot lookup.
- `dashboard/src/app/dashboard/tenants/page.tsx` vẫn khai báo, render và gửi `chatwootModel`, `chatwootAccountId`, `chatwootBaseUrl`, `chatwootTeamId`, `chatwootApiToken`.

Các blocker này thuộc Prompt 08D, không sửa trong Prompt 08C.

## 7. Backend/API blockers trước khi drop schema

- `backend/src/api/dashboard.js` vẫn nhận và ghi các field tenant legacy:
  - `chatwootModel`
  - `chatwootAccountId`
  - `chatwootBaseUrl`
  - `chatwootApiToken`
  - `chatwootTeamId`
  - `webhookSecret`
- `POST /api/tenants` vẫn yêu cầu `chatwootAccountId`.
- `POST /api/tenants` vẫn yêu cầu `chatwootApiToken` khi `chatwootModel === 'dedicated'`.
- `maskTenant()` vẫn tính `hasApiToken` từ `chatwootApiTokenEnc`.

Các blocker backend/API cần prompt riêng sau 08D hoặc đi cùng schema-removal prep, không sửa trong 08C.

## 8. DevOps/script blockers

- `backend/scripts/update-chatwoot-agentbot-url.js` vẫn là script legacy.
- `backend/scripts/check_tenant_config.js`, `fix_tenant_token.js`, `test_decrypt.js` còn tham chiếu env/field/helper cũ.
- `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt`, `MULTITENANT_PROGRESS.md` còn flow Chatwoot cũ.

Các file này thuộc Prompt 10/DevOps hoặc docs cleanup riêng, không sửa trong Prompt 08C.

## 9. Validation checklist cho prompt schema removal thật

Trước khi tạo migration drop schema:

- `rg -n "chatwoot|CHATWOOT|NEXT_PUBLIC_CHATWOOT" backend/src dashboard/src backend/scripts docs`
- `rg -n "chatwootModel|chatwootAccountId|chatwootBaseUrl|chatwootApiTokenEnc|chatwootTeamId|chatwootConversationId" backend dashboard`
- Backend `node --check` cho entry/API/handoff/webhook/config.
- `npx prisma validate`.
- Dashboard `npx --no-install tsc --noEmit`.
- Runtime smoke:
  - direct `/webhook`
  - prompts/settings/handoff read routes
  - tenant CRUD theo contract mới
  - channel configs theo contract mới
- Migration dry-run/local/staging.
- Backup production trước migration.
- Không dùng `db push`.

## 10. Next phases

- **08D dashboard cleanup**: bỏ UI/API/env Chatwoot khỏi dashboard source.
- **08E tenant direct outbound** nếu business cần staff tenant reply thật qua Facebook.
- **08F hoặc prompt schema migration removal**: stop writing legacy fields, tạo migration drop columns/indexes sau khi scan sạch.
- **09 RAG/raw SQL**: xử lý raw SQL/pgvector sau khi No-Chatwoot path ổn.
- **10 DevOps**: cleanup scripts/batch/stale webhook URLs.
- **21 Project structure consolidation**: chỉ làm sau security/DevOps để tránh move code khi behavior còn biến động.
