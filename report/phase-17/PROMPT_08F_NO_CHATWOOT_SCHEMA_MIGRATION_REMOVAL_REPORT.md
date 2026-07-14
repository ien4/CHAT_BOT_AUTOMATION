# PROMPT 08F — NO-CHATWOOT SCHEMA MIGRATION REMOVAL REPORT

Ngày thực hiện: 2026-07-10
Branch: `chore/prompt-05r-docs-local-run`
DB local/test: `bbotech-pgvector-local` (`localhost:5433`)

## 1. Mục tiêu

- Xác minh backend/dashboard không còn runtime dependency vào field legacy Chatwoot.
- Backup DB local trước khi thay đổi schema.
- Drop các cột legacy khỏi Prisma schema + tạo migration có kiểm soát.
- Apply migration trên local/test, không `db push`, không `--accept-data-loss`, không reset.
- Static validation + runtime smoke sau migration.

## 2. Preflight + backup

- Preflight Git: branch `chore/prompt-05r-docs-local-run` (không master/main), working tree sạch, `.env`/`.env.local` gitignored, không env tracked/staged, commit 08E `a5d5dc5` tồn tại.
- Container `bbotech-pgvector-local` ở trạng thái Exited → `docker start` thành công.
- Backup: `docker exec ... pg_dump -Fc` → `backups/prompt-08f-before-schema-drop-20260710-095554.dump` (44120 bytes > 0). TOC đọc được bằng `pg_restore -l` (hợp lệ). `backups/` đã thêm vào `.gitignore` → không commit.
- Xác nhận trước migration: 7 cột legacy + index `conversations_chatwoot_conversation_id_idx` tồn tại trong DB.

## 3. Legacy field scan

| Field | Runtime source còn dùng? | Chỉ còn schema/migration? | Action |
|---|---|---|---|
| `Tenant.chatwootModel` | Có — `POST /api/tenants` set compat | Không | Gỡ write trong prompt này + drop cột |
| `Tenant.chatwootAccountId` | Có — `POST /api/tenants` set compat | Không | Gỡ write + drop cột |
| `Tenant.chatwootBaseUrl` | Không (chỉ `maskTenant` strip) | Schema | Bỏ strip + drop cột |
| `Tenant.chatwootApiTokenEnc` | Không (chỉ strip) | Schema | Bỏ strip + drop cột |
| `Tenant.chatwootTeamId` | Không (chỉ strip) | Schema | Bỏ strip + drop cột |
| `Tenant.webhookSecretEnc` | Không (chỉ strip) | Schema | Bỏ strip + drop cột |
| `Conversation.chatwootConversationId` | Không (0 match backend/src) | Schema + migration | Drop cột + index |

- dashboard/src: 0 match Chatwoot (giữ nguyên từ 08D/08E).
- backend/src sau patch: 0 match runtime; chỉ còn 3 README kiến trúc (`domain`, `infrastructure`, `infrastructure/integrations`) liệt kê "Chatwoot" như ví dụ integration — là docs, acceptable (đã note ở 08E).

## 4. Schema patch

`backend/prisma/schema.prisma`:
- Model `Tenant`: xóa `chatwootModel`, `chatwootAccountId`, `chatwootBaseUrl`, `chatwootApiTokenEnc`, `chatwootTeamId`, `webhookSecretEnc`.
- Model `Conversation`: xóa `chatwootConversationId`.
- Không có `@@index`/`@@unique` khai báo trong schema cho các field này (index `conversations_chatwoot_conversation_id_idx` chỉ tồn tại ở DB/migration lịch sử).

`backend/src/api/dashboard.js` (reference runtime cần xóa trong chính prompt này):
- `POST /api/tenants`: bỏ set `chatwootModel`/`chatwootAccountId` (compat cho cột NOT NULL cũ) — nếu giữ sẽ làm `prisma.tenant.create` lỗi sau khi drop cột.
- `maskTenant()`: bỏ destructure/strip các cột legacy (không còn tồn tại sau drop); chỉ giữ `integrationMode`/`messagingMode = direct-facebook`.
- Gỡ hằng `TENANT_COMPAT_ACCOUNT_ID` không còn dùng; đổi comment còn chữ "Chatwoot".

## 5. Migration created

- Lệnh: `npx prisma migrate dev --name remove_no_chatwoot_legacy_columns --create-only` (create-only, KHÔNG apply tự động, KHÔNG hỏi reset vì `migrate status` báo "up to date").
- Folder: `backend/prisma/migrations/20260710025758_remove_no_chatwoot_legacy_columns/`.

## 6. Migration SQL review

- SQL auto-generate **rộng hơn dự kiến**: ngoài drop legacy còn chứa drift có sẵn không liên quan:
  - `DROP INDEX conversations_fb_user_id_key`, nhiều `ALTER ... DROP DEFAULT`, `CREATE INDEX conversations_fb_user_id_tenant_id_idx`, `AddForeignKey appointments_...`.
  - **`ALTER TABLE knowledge_base ALTER COLUMN embedding DROP NOT NULL`** — chạm cột RAG/vector (bị cấm trong prompt này).
- Theo đúng workflow `--create-only`, body migration.sql được thay bằng SQL drop legacy **tối thiểu, đã review**:
  - `DROP INDEX IF EXISTS conversations_chatwoot_conversation_id_idx`
  - `ALTER TABLE conversations DROP COLUMN IF EXISTS chatwoot_conversation_id`
  - `ALTER TABLE tenants DROP COLUMN IF EXISTS` (6 cột legacy)
- Không drop table, không chạm RAG/vector/knowledge, không đổi cột/constraint không liên quan.

## 7. Local/test apply result

- `npx prisma migrate deploy` → applied `20260710025758_remove_no_chatwoot_legacy_columns` thành công (11 migrations found, không reset, không `db push`).
- `npx prisma generate` + `npx prisma validate` → PASS.
- Xác nhận DB: cột legacy còn lại = 0, index legacy còn lại = 0.

## 8. Validation

- Backend `node --check` (index/db/dashboard/config/credentialCrypto/webhook/handoff × 8) — PASS.
- `npx prisma validate` — PASS.
- Dashboard `npx --no-install tsc --noEmit` — PASS.
- Dashboard `npm run build` — PASS.
- `git diff --check` — chỉ warning CRLF/LF của Git trên Windows.

## 9. Runtime smoke

Express app tạm (mount `/webhook` + `/api` dashboardApi), JWT platform-admin ký bằng `JWT_SECRET`, DB local. Không gọi Facebook/Telegram/LLM thật.

1. GET /webhook token sai → 403 — PASS
2. POST /chatwoot-webhook → 404 — PASS
3. GET /api/settings/chatwoot-test → 404 — PASS
4. GET /api/channel-configs/lookup-inboxes → 404 — PASS
5. GET /api/prompts (token) → 200 — PASS
6. GET /api/settings/handoff (token) → 200 — PASS
7. GET /api/settings/telegram-destinations (token) → 200 — PASS
8. Tenant contract mới sau migration:
   - POST /api/tenants `{slug,name}` → 201, response không chứa field legacy — PASS
   - PUT /api/tenants/:id `{name}` → 200, không chứa field legacy — PASS
   - DELETE cleanup → 200; leftover `test-08f-*`/`test_08f_*` = 0 — PASS

Tổng: **13/13 PASS**. Script smoke tạm đã xóa sau khi chạy.

## 10. Post-migration scan

- `backend/src`: 0 match runtime Chatwoot/lookupInboxes/chatwoot-test/lookup-inboxes (chỉ 3 README kiến trúc — docs).
- `dashboard/src`: 0 match.
- `backend/prisma/schema.prisma`: 0 match.
- Migration mới có chứa tên cột legacy để drop — acceptable theo quy tắc.

## 11. Không thay đổi

RAG/vector/knowledge columns, direct Facebook webhook, tenant handoff, bot engine/tools, package files, Dockerfile/scripts, migration lịch sử, historical reports, `.env` thật. Không `db push`, không `--accept-data-loss`, không reset DB, không production, không push remote.

## 12. Remaining blockers

- Drift schema-vs-DB có sẵn (default/index khác biệt do migration viết tay lịch sử) vẫn còn — ngoài phạm vi 08F, không xử lý ở đây.
- 3 README kiến trúc còn liệt kê "Chatwoot" như ví dụ — docs, có thể dọn ở prompt docs riêng nếu muốn.
- Dashboard lint (`next lint` interactive) vẫn open — quality gate cho prompt sau.
- Production rollout cần backup + `migrate deploy` riêng.

## 13. Final verdict

**PASS**

## 14. Next step

- Prompt 09: RAG/raw SQL hardening; hoặc quality gate cấu hình ESLint non-interactive để đưa lint vào validation.
- Production: backup DB production rồi `prisma migrate deploy` cùng migration này (không `db push`).
