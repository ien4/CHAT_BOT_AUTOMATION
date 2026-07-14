# PROMPT 08C — PRISMA/ENV NO-CHATWOOT CLEANUP PLAN REPORT

Ngày thực hiện: 2026-07-09

## 1. Mục tiêu

Prompt 08C xử lý phần Prisma/env sau khi backend runtime Chatwoot đã bị gỡ:

- Audit toàn bộ Prisma/env/config references legacy.
- Cleanup env example và backend config warning an toàn.
- Lập schema/migration cleanup plan.
- Không sửa schema thật, không tạo migration, không chạy migration/db push.
- Không sửa dashboard source, RAG/raw SQL, package, Dockerfile hoặc scripts.

## 2. Vì sao làm 08C sau 08B

Prompt 08B đã gỡ backend runtime Chatwoot: route `/chatwoot-webhook*`, handler/client/adapter và handoff sync. Sau bước đó, env và schema legacy không còn là runtime target nhưng vẫn còn trong env examples, config warning, Prisma schema, migrations lịch sử, dashboard source và scripts. Prompt 08C chốt policy/plan trước khi dashboard cleanup và schema removal thật.

## 3. Secret/Git safety

| Check | Kết quả |
|---|---|
| Không mở/in `backend/.env` | PASS |
| Không mở/in `dashboard/.env.local` | PASS |
| Không in `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, token/API key thật | PASS |
| `.env` tracked/staged | Không phát hiện |
| `backend/.env` ignored | PASS |
| `dashboard/.env.local` ignored | PASS |
| Không push remote | PASS |
| Không dùng `git add .` | PASS |

## 4. File/report đã đọc

- `report/phase-17/PROMPT_08B_BACKEND_CHATWOOT_RUNTIME_REMOVAL_REPORT.md`
- `report/phase-17/PROMPT_08A_NO_CHATWOOT_ARCHITECTURE_AUDIT_REPORT.md`
- `docs/architecture/NO_CHATWOOT_DIRECT_ARCHITECTURE_CONTEXT.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/policies/ENV_POLICY.md`
- `docs/architecture/ARCHITECTURE.md`
- `backend/prisma/schema.prisma`
- `backend/.env.example`
- `dashboard/.env.example`
- `backend/src/infrastructure/services/config.js`
- `backend/src/api/dashboard.js`
- `dashboard/src/lib/config/env.ts`
- `dashboard/src/lib/api.ts`

Không đọc `.env` thật.

## 5. Git preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Không ở `master/main` | PASS |
| Working tree trước patch | Clean, chỉ có ignored env/node_modules/build artifacts |
| Remote | Không có output từ `git remote -v` |
| Commit Prompt 08B | `95b6eeb6b9dd082fae547cde7e77119be2f39daa` tồn tại |
| Env tracked | Không có output từ `git ls-files` env patterns |

## 6. Baseline validation

Baseline trước patch: PASS.

| Command | Kết quả |
|---|---|
| Backend `node --check` cho `src/index.js`, `src/db.js`, `src/api/dashboard.js`, config, credential crypto, webhook, handoff, settings/prompts controllers/routes | PASS |
| `npx prisma validate` trong `backend` | PASS |
| Dashboard `npx --no-install tsc --noEmit` | PASS |

`npx prisma validate` có cơ chế đọc env của Prisma nhưng không in secret; output chỉ xác nhận schema hợp lệ.

## 7. Prisma/env/config scan summary

| Khu vực | File | Reference | Loại | Có runtime không | Prompt xử lý | Hành động 08C |
|---|---|---|---|---|---|---|
| Prisma schema | `backend/prisma/schema.prisma` | `Conversation.chatwootConversationId` | Schema field | Không explicit runtime sau 08B | Schema removal prompt sau | Không sửa schema; đưa vào cleanup plan. |
| Prisma schema | `backend/prisma/schema.prisma` | `Tenant.chatwootModel`, `chatwootAccountId`, `chatwootBaseUrl`, `chatwootApiTokenEnc`, `chatwootTeamId` | Schema fields | Có qua backend tenant CRUD/dashboard payload | 08D + schema removal prompt | Không sửa schema; ghi blocker. |
| Prisma migrations | `backend/prisma/migrations/20260614120000_multitenant`, `20260615150000_add_conv_chatwoot_and_grace` | `chatwoot_*`, index conversation | Historical migrations | Không sửa runtime | Schema removal prompt sau | Giữ nguyên migration lịch sử. |
| Backend env example | `backend/.env.example` | `CHATWOOT_*` | Env example legacy | Không | 08C | Đã xóa. |
| Dashboard env example | `dashboard/.env.example` | `NEXT_PUBLIC_CHATWOOT_URL` | Public env legacy | Không | 08C | Đã xóa. |
| Backend config warning | `backend/src/infrastructure/services/config.js` | `CHATWOOT_API_TOKEN`, `CHATWOOT_WEBHOOK_SECRET` | Startup/config warning | Có gián tiếp nếu gọi warning helper | 08C | Đã xóa khỏi placeholder warning list. |
| Dashboard env helper/API client | `dashboard/src/lib/config/env.ts`, `dashboard/src/lib/api.ts` | `CHATWOOT_BASE_URL`, `NEXT_PUBLIC_CHATWOOT_URL`, `lookupInboxes` | Dashboard source | Có ở dashboard runtime | 08D | Audit only, không sửa source. |
| Docs current | `docs/policies/ENV_POLICY.md`, `docs/architecture/ARCHITECTURE.md`, `docs/architecture/FEATURE_INVENTORY.md`, `MULTITENANT_PROGRESS.md` | Copy/flow legacy | Docs | Không | 08C/08D/10 | ENV_POLICY cập nhật; docs lớn/historical giữ backlog. |
| Historical reports | `report/PROMPT_01...` đến trước 08A | Audit history | Historical | Không | Không rewrite | Giữ nguyên. |
| Backend scripts/DevOps | `backend/scripts/*`, `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt` | Script/flow legacy | Có nếu chạy script | Prompt 10 | Audit only, không sửa scripts. |

## 8. Env cleanup applied

### Backend `.env.example`

- Xóa block `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_TEAM_ID`, `CHATWOOT_WEBHOOK_SECRET`.
- Giữ direct Facebook env: `FB_PAGE_ID`, `FB_APP_SECRET`, `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`.
- Giữ `DATABASE_URL`, `PORT`, `NODE_ENV`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- Bổ sung ghi chú local pgvector host port `localhost:5433` để tránh nhầm với Docker internal `postgres:5432`.

### Dashboard `.env.example`

- Xóa `NEXT_PUBLIC_CHATWOOT_URL`.
- Giữ `NEXT_PUBLIC_API_URL`.
- Không thêm public env Chatwoot mới.

### Config helper

- Xóa `CHATWOOT_API_TOKEN` và `CHATWOOT_WEBHOOK_SECRET` khỏi placeholder warning list.
- Không đổi config Facebook/Telegram/LLM đang dùng.
- Behavior startup chỉ thay đổi ở mức không warning legacy Chatwoot env nữa.

### ENV_POLICY

- Ghi rõ `CHATWOOT_*` là legacy/deprecated, không thuộc target mới.
- Ghi rõ không thêm `NEXT_PUBLIC_CHATWOOT_URL`.
- Giữ nguyên nguyên tắc dashboard public env không chứa secret.

## 9. Prisma schema cleanup plan

| Model | Field legacy | Usage hiện tại | Risk | Action |
|---|---|---|---|---|
| `Conversation` | `chatwootConversationId` | Schema/migration lịch sử; không còn explicit backend runtime read/write sau 08B | Cần drop index trước/same migration với column | Drop sau khi scan sạch backend/dashboard/scripts và có backup. |
| `Tenant` | `chatwootModel` | Backend tenant CRUD và dashboard tenants page còn dùng | Không drop được trước dashboard/API cleanup | 08D + backend/API cleanup prep trước schema removal. |
| `Tenant` | `chatwootAccountId` | Backend `POST /tenants` còn required | High, field DB đang `NOT NULL` | Redesign tenant create/update contract trước migration. |
| `Tenant` | `chatwootBaseUrl` | Backend/dashboard còn ghi optional | Legacy URL có thể còn trong DB | Stop write, verify no read, drop sau. |
| `Tenant` | `chatwootApiTokenEnc` | Backend còn encrypt/mask, scripts cũ còn tham chiếu | Có thể chứa encrypted secret | Backup/retention policy trước drop. |
| `Tenant` | `chatwootTeamId` | Backend/dashboard còn ghi optional | API contract legacy | Stop write, verify no read, drop sau. |
| `Tenant` | `webhookSecretEnc` | Legacy-adjacent, nguồn gốc tenant Chatwoot webhook secret | Tên không chứa Chatwoot; có thể bị repurpose nếu direct webhook cần secret | Chỉ drop nếu prompt sau xác nhận không còn use case. |

## 10. Migrations policy

- Historical migrations giữ nguyên, không rewrite.
- Không dùng `db push`.
- Không dùng `--accept-data-loss`.
- Migration drop schema chỉ tạo sau khi dashboard/backend/scripts không còn reference.
- Production cần backup trước.
- Migration thật nên chạy theo staged plan:
  1. stop writing legacy fields
  2. dashboard cleanup
  3. verify no runtime read/write
  4. migration drop columns/indexes
  5. rollback/restore plan

## 11. Dashboard blockers

- `dashboard/src/lib/config/env.ts` còn `CHATWOOT_BASE_URL` và `NEXT_PUBLIC_CHATWOOT_URL`.
- `dashboard/src/lib/api.ts` còn `lookupInboxes`.
- Settings page còn Chatwoot base URL/test UI.
- Channel configs page còn Chatwoot lookup/copy.
- Tenants page còn form, type, payload và copy cho `chatwoot*`.

Để Prompt 08D xử lý, không sửa trong 08C.

## 12. Backend/API blockers

- `backend/src/api/dashboard.js` còn tenant create/update fields `chatwootModel`, `chatwootAccountId`, `chatwootBaseUrl`, `chatwootApiToken`, `chatwootTeamId`.
- `POST /api/tenants` còn bắt buộc `chatwootAccountId`.
- Dedicated model còn yêu cầu `chatwootApiToken`.
- `maskTenant()` còn `hasApiToken` từ `chatwootApiTokenEnc`.

Các blocker này cần prompt backend/API cleanup sau dashboard 08D hoặc trước schema migration removal.

## 13. Runtime smoke

**NOT REQUIRED** — Prompt 08C chỉ cleanup env example/config warning/docs và không đổi route/handler/runtime flow.

Không đánh dấu runtime toàn hệ thống PASS trong 08C. Runtime gần nhất liên quan No-Chatwoot là Prompt 08B: PASS 16/16.

## 14. Không thay đổi

Không sửa:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/**`
- Dashboard source `dashboard/src/**`
- RAG/raw SQL
- Webhook direct Facebook
- Tenant handoff behavior
- Bot engine/tools
- Package files
- Dockerfile/scripts
- Production DB

Không chạy:

- migration
- `prisma db push`
- `docker compose up`
- `start-all.bat`

## 15. Remaining risks

- Dashboard UI/API Chatwoot vẫn còn, cần Prompt 08D.
- Prisma schema fields legacy vẫn còn, cần schema removal prompt sau khi dashboard/backend sạch.
- Tenant direct outbound Facebook chưa implemented nếu business cần staff tenant reply thật.
- RAG/raw SQL vẫn là backlog Prompt 09.
- DevOps/scripts còn flow Chatwoot cũ, cần Prompt 10.

## 16. Final verdict

**PASS WITH WARNINGS — cleanup plan done, schema/dashboard blockers remain by design.**

Lý do không phải PASS sạch: Prompt 08C cố ý không sửa schema, dashboard source hoặc scripts; các blocker đó được map và chuyển phase sau.

## 17. Next Step & Goal

Thứ tự đề xuất:

1. **Prompt 08D — dashboard No-Chatwoot cleanup**: bỏ env helper/API client/UI Chatwoot khỏi settings, channel configs, tenants.
2. **Prompt 08E — tenant direct Facebook outbound** nếu cần staff tenant reply thật.
3. **Prompt schema migration removal** sau khi backend/dashboard/scripts scan sạch.
4. **Prompt 09 — RAG/raw SQL** khi No-Chatwoot path ổn.
5. **Prompt 10 — DevOps cleanup** cho scripts/batch/stale webhook URLs.
