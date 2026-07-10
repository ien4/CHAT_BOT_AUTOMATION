# REFACTOR PLAN - BBOTECH BOT AUTOMATION

## Prompt 10C — Quality gate + Phase 19 readiness (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-10

Đã làm:

- Thêm `npm run quality` an toàn (không thêm dependency): backend = `syntax` (`node --check` 6 file) + `prisma:validate`; dashboard = `typecheck` (`tsc --noEmit`) + `build`. Cả hai chạy PASS.
- Tạo `docs/QUALITY_GATE.md` (required checks, lint status, smoke link).
- Production smoke dry-run local PASS 9/9 (temp admin `test-10c-*`, cleanup=0).
- Phase 19 readiness: chọn candidate #1 = `dashboard/src/app/dashboard/analytics/page.tsx` (read-only, backend harden 09B, đã có `features/analytics/`); kế hoạch `docs/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md`. Chưa sửa page.

Warning:

- ESLint chưa cài ở cả backend/dashboard → lint non-interactive BLOCKED (OPTION C). Không tự `npm install`/sửa lock. Hướng dẫn bật lint ở `docs/QUALITY_GATE.md` cho prompt dependency riêng.

Không làm: không sửa dashboard page/component UI, backend API behavior, schema/migrations, RAG/analytics/handoff/webhook/bot, Dockerfile/start-all; không thêm dependency; không production rollout; không push remote.

Next:

- **Prompt 19A** — tách `analytics/page.tsx` sang `features/analytics/**` (components + data hook), giữ UI/behavior, validate bằng `npm run quality` dashboard.

## Prompt 10B — DevOps deploy hardening + embedding drift fix (PASS)

Ngày cập nhật: 2026-07-10

Đã làm:

- **Drift fix** `knowledge_base.embedding` (OPTION A): migration `20260710154312_align_knowledge_embedding_nullable` chạy `ALTER TABLE knowledge_base ALTER COLUMN embedding DROP NOT NULL`. DB align theo schema Prisma nullable; RAG search vốn đã filter `embedding IS NOT NULL`. Backup local trước migration; `migrate deploy` local PASS; drift smoke insert content-first PASS 9/9.
- **`start-all.bat`**: bỏ `prisma db push --accept-data-loss` → `prisma migrate deploy` + guard banner LOCAL ONLY / DO NOT USE FOR PRODUCTION.
- **`backend/Dockerfile`**: tách migration khỏi runtime startup — CMD chỉ `node src/index.js`; migration là release step riêng.
- **`webhook-urls-current.txt`**: warning header local/stale + trỏ direct `/webhook` (No-Chatwoot).
- **Deploy docs mới**: `docs/DEPLOYMENT_POLICY.md`, `docs/PRODUCTION_ROLLOUT_CHECKLIST.md`.

Không làm: không sửa dashboard UI/auth, RAG/analytics/tenant handoff source, bot engine, package files, `.env`, migration lịch sử; không chạy full seed thật/production; không `db push`; không push remote.

Next:

- **Prompt 10C** — quality gate/lint non-interactive + production smoke checklist, hoặc **Prompt 19** — dashboard feature split.

## Prompt 10A — Seed raw SQL cleanup + progress sync (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-10

Đã làm:

- Chuyển `$queryRawUnsafe` duy nhất trong `backend/scripts/seed.js` (INSERT `knowledge_base` build string + escaping thủ công) sang `prisma.knowledgeBase.create()` — input parameterize, giữ nguyên data shape.
- Sau Prompt 09/09B/09C/10A: `backend/src` + `backend/scripts` không còn `$queryRawUnsafe`/`$executeRawUnsafe`; chỉ còn 1 dòng README documentation-only.
- Sync `docs/PROJECT_PROGRESS.md`: Phase 18 RAG/raw SQL → Done; trạng thái hiện tại → Prompt 10A; rủi ro raw SQL unsafe → Closed.
- Static validation PASS; seed KHÔNG chạy thật (Option A) vì mutate DB rộng.

Phát hiện (out of scope, logged):

- `knowledge_base.embedding` trong DB local là NOT NULL nhưng schema Prisma khai `Unsupported("vector")?` (nullable) → drift. Cả raw SQL cũ lẫn Prisma create mới đều fail cùng constraint này (behavior parity, đã verify bằng psql rollback). Đây là lỗi tiền tồn tại, để Prompt 10B/DevOps xử lý cùng schema sync.

Không làm: không sửa schema/migration/package/Docker/dashboard/RAG/analytics/tenant handoff; không chạy seed thật; không push remote.

Next:

- **Prompt 10B** — DevOps/deploy hardening (kèm đồng bộ drift `knowledge_base.embedding`).

## Prompt 09C — Tenant handoff raw SQL hardening (PASS)

Ngày cập nhật: 2026-07-10

Đã làm:

- Chuyển `$queryRawUnsafe` duy nhất trong `backend/src/tenants/handoff.js` (`getHandoffAnalytics`, group-by-day) sang `$queryRaw` tagged template; parameterize `tenantId` + `since` (Date).
- `period` giữ nguyên switch enum (`24h/7d/30d` + default 7d) — không đưa raw string vào SQL; tenant filter giữ nguyên.
- Module smoke PASS: tenant isolation A/B, invalid/null period không crash, injection-style tenantId parameterized → 0 rows, cleanup `test-09c-*` leftover=0.
- `backend/src/tenants/handoff.js` không còn `$queryRawUnsafe`/`$executeRawUnsafe`.

Không làm: không sửa schema/migration/package/scripts/Docker/RAG/analytics/dashboard UI; không gọi Telegram/Facebook thật; không push remote.

Next:

- **Prompt 10**: DevOps/deploy hardening, hoặc **Prompt 10A** dọn `$queryRawUnsafe` còn lại trong `backend/scripts/seed.js`.

## Prompt 08G — Login auth production readiness fix (PASS)

Ngày cập nhật: 2026-07-10

Prompt 08G fix lỗi không đăng nhập được và làm cứng auth trước khi public.

Đã làm:

- Chẩn đoán: hash admin DB local stale (seed cũ chỉ tạo khi chưa có admin, không cập nhật khi `ADMIN_PASSWORD` env đổi) → login luôn 401.
- Login UI (`dashboard/src/app/login/page.tsx`): bỏ thông tin tài khoản mẫu `admin / admin123`, placeholder trung tính, câu hướng dẫn an toàn.
- `dashboard/src/lib/auth.tsx`: gỡ standalone fallback bypass (`admin/admin123` + fake token) — vốn gây "đăng nhập rồi bị văng" khi backend unreachable.
- `backend/src/index.js`: dev-only self-heal đồng bộ hash admin từ `ADMIN_PASSWORD`; `assertProductionAuthEnv()` fail-fast production khi secret auth yếu/thiếu; seed không dùng `admin123` trong production.
- Runtime login smoke 11/11 PASS.

Không làm (giữ phạm vi):

- Không sửa Prisma schema/migrations, không tạo migration, không `db push`, không reset DB.
- Không sửa RAG/raw SQL, webhook direct Facebook, package files, Dockerfile/scripts.
- Không thêm refresh token / redesign auth storage.

Next:

- **Prompt 09**: RAG/raw SQL hardening, hoặc Quality Gate ESLint non-interactive.

## Prompt 08F — No-Chatwoot schema migration removal (PASS)

Ngày cập nhật: 2026-07-10

Prompt 08F đã drop các cột schema legacy Chatwoot trên DB local/test bằng migration có kiểm soát, sau khi 08D/08E đã stop-write.

Đã làm:

- Backup DB local trước migration: `backups/prompt-08f-before-schema-drop-<timestamp>.dump` (không commit, `backups/` ignored).
- Gỡ runtime write legacy còn sót trong `backend/src/api/dashboard.js` (`POST /api/tenants` không còn set `chatwootModel/chatwootAccountId`; `maskTenant` không còn strip cột legacy).
- Patch `backend/prisma/schema.prisma`: xóa 6 field `Tenant` + `Conversation.chatwootConversationId`.
- Tạo migration `20260710025758_remove_no_chatwoot_legacy_columns` bằng `--create-only`; thay body auto-generate (rộng hơn dự kiến, chạm drift + `knowledge_base.embedding`) bằng SQL drop legacy tối thiểu đã review.
- Apply local/test bằng `prisma migrate deploy` (không `db push`, không `--accept-data-loss`, không reset).
- Validation + runtime smoke tenant create/update PASS 13/13; DB còn 0 cột/index legacy.

Không làm (giữ nguyên phạm vi):

- Không xóa migration lịch sử; không rewrite historical report.
- Không sửa RAG/vector/knowledge columns, direct Facebook webhook, tenant handoff, bot engine, package files, Dockerfile/scripts.
- Không chạy migration trên production (rollout production cần backup + `migrate deploy` riêng).

Next:

- **Prompt 09**: RAG/raw SQL hardening, hoặc quality gate (ESLint non-interactive) để đưa lint vào validation.

## Prompt 08C — Prisma/env No-Chatwoot cleanup plan (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

Prompt 08C đã hoàn tất phase env/config cleanup và lập kế hoạch schema migration an toàn. Đây không phải schema removal prompt.

Đã làm:

- Xóa `CHATWOOT_*` khỏi `backend/.env.example`.
- Ghi rõ local pgvector host port `localhost:5433` trong `backend/.env.example`.
- Xóa `NEXT_PUBLIC_CHATWOOT_URL` khỏi `dashboard/.env.example`.
- Xóa warning placeholder `CHATWOOT_API_TOKEN`, `CHATWOOT_WEBHOOK_SECRET` khỏi `backend/src/infrastructure/services/config.js`.
- Cập nhật `docs/ENV_POLICY.md` để Chatwoot env là legacy/deprecated, không thuộc target mới.
- Tạo `docs/NO_CHATWOOT_SCHEMA_ENV_CLEANUP_PLAN.md` với bảng field legacy, migration strategy, dashboard/backend/devops blockers.
- Tạo report Prompt 08C.

Không làm:

- Không sửa `backend/prisma/schema.prisma`.
- Không sửa `backend/prisma/migrations/**`.
- Không tạo migration mới.
- Không chạy migration hoặc `db push`.
- Không sửa dashboard source, RAG/raw SQL, webhook direct Facebook, tenant handoff, bot engine/tools, package hoặc scripts.

Schema blockers còn lại:

- `Conversation.chatwootConversationId`.
- `Tenant.chatwootModel`.
- `Tenant.chatwootAccountId`.
- `Tenant.chatwootBaseUrl`.
- `Tenant.chatwootApiTokenEnc`.
- `Tenant.chatwootTeamId`.
- `Tenant.webhookSecretEnc` là legacy-adjacent, cần quyết định riêng trước khi drop.

Thứ tự tiếp theo:

- **Prompt 08D**: dashboard No-Chatwoot cleanup cho settings, channel configs, tenants, env helper và API client.
- **Prompt backend/API cleanup prep**: dừng tenant CRUD đọc/ghi field legacy sau khi dashboard không còn gửi payload cũ.
- **Prompt schema migration removal**: tạo migration drop columns/indexes chỉ sau khi scan sạch backend/dashboard/scripts và có backup/rollback plan.
- **Prompt 09**: RAG/raw SQL hardening sau khi No-Chatwoot path ổn.
- **Prompt 10**: DevOps/scripts cleanup.

## Prompt 08B — Backend Chatwoot runtime removal (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

Prompt 08B đã thực hiện phase backend runtime removal cho chỉ thị No-Chatwoot. Phạm vi chỉ ở backend source/docs/report, không đổi schema, migrations, env policy, dashboard frontend, package hoặc DevOps.

Thay đổi đã áp dụng:

- Xóa route runtime Chatwoot khỏi `backend/src/index.js`: không còn `POST /chatwoot-webhook` và `POST /chatwoot-webhook/:slug`.
- Giữ direct Facebook endpoint `GET /webhook` và `POST /webhook`.
- Xóa các module runtime Chatwoot: `webhook/chatwootHandler.js`, `tenants/webhookHandler.js`, `chatwoot/api.js`, `chatwoot/crypto.js`, `adapters/chatwootAdapter.js`, `infrastructure/integrations/chatwoot/README.md`.
- Xóa dashboard backend route test/lookup Chatwoot trong `backend/src/api/dashboard.js`: `/settings/chatwoot-test` và `/channel-configs/lookup-inboxes`.
- Đổi `maskTenant.webhookUrl` thành `null`; `/tenants/:id/webhook-info` trả `410` để tránh hướng dẫn webhook Chatwoot cũ.
- Bỏ sync Chatwoot trong `telegram/handoff.js` và `tenants/handoff.js`.
- Thêm `backend/src/infrastructure/services/credentialCrypto.js` làm helper mã hóa generic cho credential legacy còn tồn tại trong schema.
- `tenants/registry.js` không còn decrypt/cache token/secret Chatwoot runtime.

Validation:

- Static validation PASS: `node --check` cho backend entry/API/webhook/handoff/settings/prompts/repositories và `credentialCrypto.js`.
- `npx prisma validate` PASS.
- Runtime smoke PASS 16/16 bằng Express app tạm: `/chatwoot-webhook*` trả 404; route Chatwoot test/lookup cũ trả 404; `/webhook` verify lỗi trả 403; prompts/settings/handoff/tenant guard regression PASS.

Không thay đổi:

- Không sửa `backend/prisma/schema.prisma` hoặc migrations.
- Không sửa `.env`, `.env.example`, env policy, dashboard frontend/API client.
- Không sửa RAG/raw SQL, package files, Dockerfile hoặc scripts.
- Không gọi migration/db push/docker compose/start-all.

Backlog sau 08B:

- **Prompt 08C**: Prisma/env No-Chatwoot cleanup plan cho `chatwoot*` fields, `CHATWOOT_*` config warnings, migrations/data policy. Không dùng `db push`.
- **Prompt 08D**: dashboard No-Chatwoot cleanup cho settings/channel-configs/tenants UI và API client.
- **Prompt 10/DevOps**: cleanup `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt`, backend scripts cũ sau khi schema/dashboard đã rõ.
- **Prompt 09**: RAG/raw SQL hardening sau khi No-Chatwoot backend/dashboard/schema blocker được đóng.

## Prompt 08A — No-Chatwoot architecture intake/audit (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

User đã đưa chỉ thị kiến trúc mới: **không dùng Chatwoot trong kiến trúc đích**. Vì vậy roadmap được chèn lại trước RAG/raw SQL hardening. Đây là renumbering after new architecture directive, không xóa lịch sử prompt cũ.

Quy tắc từ Prompt 08A trở đi:

- Chatwoot là deprecated/removed target, không phải thành phần kiến trúc đích.
- Không sinh thêm route/controller/service/model/env mới có từ khóa Chatwoot/CHATWOOT/chatwoot.
- Luồng đích: Facebook Messenger API -> Backend Express custom -> Dashboard nội bộ Next.js -> PostgreSQL/pgvector.
- Socket.io/WebSocket chỉ được claim nếu code thật xuất hiện; Prompt 08A chưa tìm thấy Socket.io trong source/package.
- Historical reports có thể giữ chữ Chatwoot để làm bằng chứng quá khứ, nhưng docs kiến trúc mới không được coi Chatwoot là target.

Scan Prompt 08A tìm thấy các nhóm removal backlog:

| Nhóm | File tiêu biểu | Hành động tiếp theo |
|---|---|---|
| Backend runtime | `backend/src/index.js`, `backend/src/webhook/chatwootHandler.js`, `backend/src/tenants/webhookHandler.js`, `backend/src/chatwoot/*`, `backend/src/adapters/chatwootAdapter.js`, `backend/src/telegram/handoff.js`, `backend/src/tenants/handoff.js` | Prompt 08B: bỏ route/client/adapter/sync Chatwoot và chuyển inbound/outbound về direct Facebook/custom backend. |
| Prisma/schema | `backend/prisma/schema.prisma`, migrations `20260614120000_multitenant`, `20260615150000_add_conv_chatwoot_and_grace` | Prompt 08C: lập migration/data cleanup plan, không dùng `db push`. |
| Env/config | `backend/.env.example`, `dashboard/.env.example`, `dashboard/src/lib/config/env.ts`, `docs/ENV_POLICY.md`, config warning helper | Prompt 08C/08D: bỏ `CHATWOOT_*`, `NEXT_PUBLIC_CHATWOOT_URL`, giữ policy không secret. |
| Dashboard | `dashboard/src/app/dashboard/settings/page.tsx`, `channel-configs/page.tsx`, `tenants/page.tsx`, `dashboard/src/lib/api.ts` | Prompt 08D: bỏ UI/API Chatwoot, đổi copy và API target sang direct Facebook/backend. |
| DevOps/scripts | `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt`, `backend/scripts/update-chatwoot-agentbot-url.js` | Prompt 10/DevOps: cleanup script sau khi runtime/dashboard/schema đã rõ. |
| Docs current | `docs/ARCHITECTURE.md`, `docs/ENV_POLICY.md`, `docs/FEATURE_INVENTORY.md`, `MULTITENANT_PROGRESS.md` | Cập nhật dần, không rewrite historical evidence bừa. |

Roadmap mới:

- **Phase 17A — No-Chatwoot architecture intake/audit**: đã hoàn tất trong Prompt 08A, docs/report-only.
- **Phase 17B — Backend Chatwoot runtime removal**: xóa/disable route `/chatwoot-webhook*`, Chatwoot client/adapter, tenant webhook Chatwoot, handoff sync Chatwoot; giữ Facebook direct `/webhook`.
- **Phase 17C — Prisma/env No-Chatwoot cleanup plan**: thiết kế migration additive/safe hoặc staged removal cho `chatwoot*` fields, env example/config policy; không `db push`.
- **Phase 17D — Dashboard No-Chatwoot cleanup**: bỏ settings/channel-config/tenant UI Chatwoot, public env Chatwoot, API client usage.
- **Phase 18 — RAG/raw SQL hardening**: xử lý sau khi No-Chatwoot blocker đã được map và phase backend removal ít nhất đã rõ.
- **Phase 19 — Dashboard feature split**.
- **Phase 20 — DevOps/deploy hardening**.
- **Phase 21 — Project structure consolidation** sau security/DevOps.

Mismatches cần nhớ:

- Local DB hiện tại theo docs/runtime là `localhost:5433` với `bbotech-pgvector-local`; sample validate `localhost:5432` chỉ là dummy và không đại diện môi trường local hiện tại.
- Actual Facebook Meta webhook endpoint trong code là `GET/POST /webhook`; `GET /api/settings/webhook` chỉ là dashboard config endpoint.
- Dashboard dev port xác nhận từ `dashboard/package.json` là `3002`.
- Backend default port xác nhận từ `backend/.env.example`, `backend/src/infrastructure/services/config.js` và `backend/src/index.js` là `3001`.

## Prompt 07D — Legacy/global route authorization classification (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

Prompt 07D phân loại legacy/global dashboard routes và chỉ áp patch nhỏ ở middleware.

Patch đã áp dụng:

- Thêm `platformAdminOnly` cho các route rõ ràng là owner/platform-only hoặc global legacy:
  - `GET /api/stats`
  - LLM providers: `GET /api/providers`, `PUT /api/providers/:id`, `POST /api/providers/:id/test`
  - Legacy campaigns: upload/CRUD và `POST /api/content-packages/migrate-from-campaigns`
  - Global staff: `GET/POST/PUT/DELETE /api/staff...`
  - Telegram destination write/test: `POST/PUT/DELETE /api/settings/telegram-destinations...`
  - Global handoff monitor/actions: `/api/handoff/*`
  - Owner/global Chatwoot/Facebook/test/analytics: `/api/settings/chatwoot-test`, `/api/facebook-pages...`, `/api/settings/facebook-menu`, `/api/test-message`, `/api/fb-subscription`, `/api/analytics`
- Không đổi handler logic, route path, method hoặc success response shape cho platform admin.

Validation:

- Static validation PASS: `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check`.
- Runtime smoke PASS 79/79 bằng Express app tạm mount `dashboardApi`.
- Smoke dùng mock in-memory cho external integration routes để không gọi Chatwoot/Facebook/bot thật.
- Cleanup sample `test_07d_*` PASS.

Không thay đổi:

- Không sửa Prisma schema/migrations.
- Không sửa RAG/raw SQL.
- Không sửa webhook handler, tenant handoff module, bot engine source, dashboard frontend, package hoặc DevOps.
- Không tách repository.

Follow-up:

- **Prompt 08**: RAG/raw SQL hardening, gồm `knowledge_base.embedding` mismatch và RAG insert/update/query raw SQL.
- **Prompt 07E** nếu cần: tenant handoff dashboard routes dưới `/tenants/:id/handoff/*` và `POST /knowledge/upload`/`POST /knowledge/scrape` ownership/RAG side effect.
- **Prompt 10**: DevOps script hardening vẫn còn mở.

## Prompt 07C — Detail resource tenant guard (PASS)

Ngày cập nhật: 2026-07-09

Prompt 07C xử lý P1 detail resource routes còn lại trong `backend/src/api/dashboard.js`, không tách repository và không đổi public API contract.

Thay đổi đã thực hiện:

- Thêm helper nhỏ `findScopedById(model, id, tenantId, args)` để detail GET dùng `findFirst({ id, tenantId })` khi request có tenant scope, còn platform không scope giữ `findUnique({ id })` như cũ.
- Thêm helper `hasContentPackageAccess(packageId, tenantId)` để guard `ContentPackageItem` qua parent `ContentPackage.tenantId`.
- Harden `GET/PUT/DELETE /api/knowledge/:id`: tenant mismatch trả `404`; PUT/DELETE cross-tenant bị chặn trước khi gọi RAG pipeline.
- Harden `GET/PUT/DELETE /api/prompts/:id`: tenant mismatch trả `404`; `POST /api/prompts` giữ logic scoped hiện hữu.
- Harden `GET/PUT/DELETE /api/quick-reply-menus/:id`: tenant mismatch trả `404`.
- Harden `GET/PUT/DELETE /api/content-packages/:id`: tenant mismatch trả `404`.
- Harden `GET/POST/PUT/DELETE /api/content-packages/:packageId/items...`: verify parent package trước, và tenant update/delete item ràng buộc thêm `packageId`.
- Harden `PUT /api/appointments/:id`: tenant mismatch trả `404`; platform no-scope giữ behavior hiện hữu.

Validation:

- Baseline static validation trước patch PASS.
- Static validation sau patch PASS: `node --check` cho `src/index.js`, `src/db.js`, `src/api/dashboard.js`, settings/prompts controllers/routes, repositories; `npx prisma validate`; `git diff --check`.
- Runtime smoke PASS 47/47 bằng Express app tạm mount `dashboardApi`: no-token 401, own tenant 200, cross-tenant 404, platform no-scope không bị chặn.
- Regression smoke PASS: `GET /api/prompts`, `GET /api/prompts?layer=intent`, `GET /api/settings/telegram-destinations`, `GET/PUT /api/settings/handoff`, P0 `/api/tenants/:id/staff`, 07B conversation detail/messages.
- Test data local cleanup PASS; leftover `test_07c_*` = 0.

Không thay đổi:

- Không sửa Prisma schema/migrations.
- Không sửa RAG pipeline, webhook, tenant handoff, bot engine, dashboard frontend, package hoặc DevOps scripts.
- Không xử lý legacy/global staff/handoff/analytics/facebook/global Chatwoot trong Prompt 07C.

Tiếp theo:

- **Prompt 08 — RAG/raw SQL hardening**: xử lý `$queryRawUnsafe`, vector/raw SQL và schema/runtime mismatch quanh `knowledge_base.embedding`.
- **Prompt 07D — legacy/global route classification** nếu muốn đóng tiếp các route quyền chưa rõ trước RAG.
- **Prompt 06D prompt detail/write repository** chỉ nên làm sau khi detail/write ownership guard đã rõ và không mở lại lỗ cross-tenant.

## Prompt 07B — Conversation tenant guard (PASS)

Ngày cập nhật: 2026-07-09

Prompt 07B xử lý P1 conversation routes trong `backend/src/api/dashboard.js`:

- `GET /api/conversations`: giữ pagination/order/include hiện hữu, thêm `where.tenantId` khi `getTenantScope(req)` trả tenant id.
- `GET /api/conversations/:id`: với tenant-scoped request, kiểm tra conversation `{ id, tenantId }` trước khi gọi `contextManager.getConversationSummary(id)`; cross-tenant trả `404`.
- `GET /api/conversations/:id/messages`: vì `Message` không có `tenantId`, route kiểm tra `Conversation.tenantId` trước rồi mới query messages theo `conversationId`.
- Platform admin không có tenant scope vẫn giữ behavior hiện tại; platform có `tenantScope` được filter theo scope đó.

Validation:

- Baseline static validation trước patch PASS.
- Static validation sau patch PASS: `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check`.
- Runtime cross-tenant smoke PASS bằng Express app tạm chỉ mount `dashboardApi`.
- Test data local được tạo tối thiểu và cleanup PASS: 2 messages + 2 conversations đã xóa.
- Regression smoke PASS: prompts, telegram destinations, handoff GET/PUT và P0 tenant path guard.

Không thay đổi:

- Không sửa Prisma schema/migrations.
- Không sửa webhook, tenant handoff, RAG, bot engine, dashboard frontend, package hoặc DevOps scripts.
- Không sửa P1 detail resource routes trong Prompt 07B.

Tiếp theo bắt buộc:

- **Prompt 07C — detail resource tenant guard** cho `knowledge`, `prompts`, `quick-reply-menus`, `content-packages`, `content-package-items`, `appointments`.
- Không làm **Prompt 06D prompt detail/write repository** trước khi Prompt 07C hoàn tất guard cho detail/write routes.
- **Prompt 08 RAG/raw SQL hardening** nên chạy sau khi route ownership đã rõ hơn; nếu chạy trước thì chỉ xử lý RAG raw SQL, không mở dashboard API scope.

## Prompt 07A — Tenant authorization hardening P0 (PASS WITH FIXES)

Ngày cập nhật: 2026-07-09

Prompt 07A xử lý đúng P0 từ Prompt 07 trong phạm vi nhỏ: nhóm nested route `/api/tenants/:id/*` trong `backend/src/api/dashboard.js`.

Thay đổi đã thực hiện:

- Thêm middleware `tenantPathAccessOnly(req, res, next)` gần auth/role middleware hiện có.
- Platform admin (`req.user.tenantId` rỗng/null) được đi qua như behavior hiện hữu.
- Tenant user chỉ được truy cập path tenant khi `req.user.tenantId === req.params.id`; nếu khác trả `403` với `{ error }`.
- Gắn guard vào đúng 12 route P0:
  - `GET/POST/PUT/DELETE /tenants/:id/staff...`
  - `GET/POST/DELETE /tenants/:id/channel-configs...`
  - `GET/POST/PUT/DELETE /tenants/:id/knowledge...`
  - `GET /tenants/:id/webhook-info`
- Với child write/delete trong cùng nhóm P0, đã ràng buộc thêm `tenantId: req.params.id` cho `TenantStaff` update/delete và `TenantChannelConfig` delete để không thể dùng `sid/cid` của tenant khác sau khi path guard đã pass.

Validation:

- Baseline static validation trước patch PASS.
- Static validation sau patch PASS: `node --check` cho dashboard/settings/prompts/repository trọng tâm và `npx prisma validate`.
- Runtime denied smoke PASS bằng Express app tạm chỉ mount `dashboardApi`: no-token 401, tenant cùng path 200, tenant khác path 403, platform path 200.
- Regression smoke PASS: `/api/prompts`, `/api/prompts?layer=intent`, `/api/settings/telegram-destinations`, handoff GET/PUT đều 200.
- Không start `src/index.js`; không kích hoạt Telegram polling hoặc Facebook menu setup.

Không thay đổi:

- Không sửa Prisma schema/migrations.
- Không sửa webhook, tenant handoff, RAG, bot engine, dashboard frontend, package hoặc DevOps scripts.
- Không sửa P1 conversation/detail/messages/detail resource routes trong Prompt 07A.

Tiếp theo bắt buộc:

- **Prompt 07B — Tenant authorization hardening P1**: xử lý `/api/conversations`, `/api/conversations/:id`, `/api/conversations/:id/messages`, detail routes như `knowledge/prompts/quick-reply/content-package/package-items/appointments`, và phân loại legacy global routes.
- **Prompt 08** chỉ nên chạy sau 07B nếu route detail/write vẫn còn mở; nếu cần đi nhanh, Prompt 08 chỉ xử lý RAG raw SQL và không mở rộng dashboard API.

## Prompt 07 — Tenant safety audit + local DB preflight (NEEDS FIX)

Ngày cập nhật: 2026-07-09

Prompt 07 đã audit tenant scope toàn hệ thống và xác nhận backend/local DB đủ chạy smoke test, nhưng chưa được phép refactor source runtime trong phase này.

Kết quả chính:

- Local DB pgvector `bbotech-pgvector-local` đang chạy ở `localhost:5433`; P1001 được xử lý ở mức preflight vì DB local đã sẵn sàng.
- Backend port `3001` đang chạy sẵn trước prompt; smoke test dùng process đó và không dừng lại.
- Runtime smoke default/local PASS: no-token `/api/prompts` → 401; `/api/prompts` → 200 array len=7; `/api/prompts?layer=intent` → 200 array len=6; `/api/settings/telegram-destinations` → 200; handoff GET/PUT → 200.
- Local DB không có tenant sample (`tenant_count=0`, `tenant_prompt_count=0`, `tenant_conversation_count=0`), nên chưa thể runtime verify cross-tenant bằng dữ liệu thật.
- `GET /api/prompts` giữ tenant scope đúng trong repository: controller gọi `getTenantScope(req)`, repository filter `tenantId: tenantId ?? null`, filter `layer` giữ nguyên.
- Tenant webhook flow tương đối tốt: resolve tenant bằng slug, conversation lookup/create có `tenantId`, handoff claim/takeover có kiểm tra tenant trong transaction.
- Kết luận security: **NEEDS FIX** vì có P0/P1 authorization gaps trong dashboard API.

P0/P1 cần xử lý trước khi refactor tiếp:

- **P0:** các route nested `/api/tenants/:id/staff`, `/api/tenants/:id/channel-configs`, `/api/tenants/:id/knowledge`, `/api/tenants/:id/webhook-info` chỉ có `authMiddleware`, chưa có `platformAdminOnly` hoặc guard `req.user.tenantId === req.params.id`.
- **P1:** `/api/conversations`, `/api/conversations/:id`, `/api/conversations/:id/messages` chưa filter theo tenant scope.
- **P1:** detail route như `/api/knowledge/:id`, `/api/prompts/:id`, `/api/quick-reply-menus/:id`, `/api/content-packages/:id` và package items dùng id trực tiếp; list/write có nơi scoped nhưng detail vẫn cần guard.
- **P1/P2:** legacy staff/handoff/analytics/global Chatwoot/Facebook routes cần quyết định rõ platform-only hay tenant-scoped.

Tiếp theo bắt buộc:

- **Prompt 07A — Tenant authorization hardening**: thêm helper guard nhỏ cho dashboard routes, khóa platform-only route legacy/global, thêm tenant ownership check cho detail/message routes, rồi chạy smoke regression.
- Chỉ sau Prompt 07A mới tiếp tục **Prompt 06D** hoặc **Prompt 08**. Prompt 08 vẫn nên xử lý `$queryRawUnsafe`/RAG raw SQL sau khi quyền tenant đã rõ.

## Prompt 06C — Prompts repository with tenant scope checklist (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-08

Prompt 06C tiếp tục repository layer cho route read-only có tenant scope:

- Tạo `backend/src/infrastructure/repositories/promptTemplates.repository.js`.
- `prompts.controller.js` đã dùng `promptTemplatesRepository` cho `GET /prompts`.
- `prompts.routes.js` tạo repository từ Prisma singleton được truyền qua `createPromptRoutes({ authMiddleware, getTenantScope, prisma })`; không tạo PrismaClient thứ hai.
- Tenant scope giữ nguyên theo code cũ: controller vẫn gọi `getTenantScope(req)`, truyền `tenantId` đã tính vào repository, repository dùng `where = { tenantId: tenantId ?? null }` và thêm `where.layer = layer` nếu có query `layer`.
- Public API contract giữ nguyên: `/api/prompts`, method GET, `authMiddleware`, status code, response array, query filter `layer`, order `layer asc` rồi `intentType asc`.
- Runtime smoke PASS cho default/local scope: no-token `/prompts` → 401; `/prompts` → 200 array len=7; `/prompts?layer=intent` → 200 array len=6; regression `webhook`, `telegram-destinations`, handoff GET/PUT → 200.
- Local DB không có tenant sample (`tenant_count=0`, `tenant_prompt_count=0`), nên full tenant isolation chưa được chứng minh. Prompt 07 vẫn bắt buộc.
- Không sửa prompt detail/write routes, Prisma schema/migrations, webhook handlers, tenant handoff, RAG pipeline, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.

Tiếp theo khuyến nghị:

- **Prompt 07**: tenant safety audit toàn hệ thống trước khi refactor thêm route có tenant.
- **Prompt 06D**: chỉ sau Prompt 07, cân nhắc repository cho prompt detail/write với tenant permission/ownership rõ ràng.

## Prompt 06B — Telegram destinations repository read (PASS)

Ngày cập nhật: 2026-07-08

Prompt 06B tiếp tục repository layer trong phạm vi nhỏ, read-only:

- Tạo `backend/src/infrastructure/repositories/telegramDestinations.repository.js`.
- `settings.controller.js` đã dùng `telegramDestinationsRepository` cho `GET /settings/telegram-destinations`.
- `settings.routes.js` tạo repository từ Prisma singleton được truyền qua `createSettingsRoutes({ authMiddleware, prisma })`; không tạo PrismaClient thứ hai.
- Public API contract giữ nguyên: `/api/settings/telegram-destinations`, method GET, `authMiddleware`, status code, response shape `{destinations, envFallback}` và query order không đổi.
- Runtime smoke PASS: no-token `telegram-destinations`/`handoff` → 401; có token local ký trong memory → `telegram-destinations`, `webhook`, handoff GET/PUT, `prompts` đều 200 đúng shape.
- Không sửa Prisma schema/migrations, webhook handlers, tenant handoff, RAG pipeline, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.
- Các route write/test Telegram destination vẫn ở `dashboard.js` và không thuộc phạm vi Prompt 06B.

Backend startup trong local env có log Telegram bot polling vì token local tồn tại; smoke test không gọi route test Telegram và `GET /settings/telegram-destinations` chỉ đọc DB.

Tiếp theo khuyến nghị:

- **Prompt 06C**: repository cho `GET /prompts`; bắt buộc giữ tenant scope chính xác và có regression smoke.
- **Prompt 07**: tenant safety audit nếu muốn ưu tiên permission/scope trước khi đưa thêm query có tenant vào repository.

## Prompt 06 — Repository layer phase 1 for settings/prompts (PASS)

Ngày cập nhật: 2026-07-08

Prompt 06 bắt đầu repository layer theo hướng nhỏ và có runtime baseline:

- Tạo `backend/src/infrastructure/repositories/handoffSettings.repository.js`.
- `settings.controller.js` đã dùng `handoffSettingsRepository` cho `GET /settings/handoff` và `PUT /settings/handoff`.
- `settings.routes.js` tạo repository từ Prisma singleton được truyền qua `createSettingsRoutes({ authMiddleware, prisma })`; không tạo PrismaClient thứ hai.
- Public API contract giữ nguyên: `/api/settings/handoff`, method GET/PUT, `authMiddleware`, status code, response shape và Prisma singleton behavior không đổi.
- Runtime smoke PASS: no-token GET/PUT handoff → 401; handoff GET/PUT/GET-after-PUT → 200; regression `webhook`, `telegram-destinations`, `prompts` → 200.
- Không sửa Prisma schema/migrations, webhook handlers, tenant handoff, RAG pipeline, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.

Đây là bước trung gian an toàn: chưa tạo application use case/domain interface để tránh mở rộng quá nhanh. Repository không import Express/process.env và chỉ chứa DB operations.

Tiếp theo khuyến nghị:

- **Prompt 06B**: repository cho `GET /settings/telegram-destinations` hoặc `GET /prompts`. Với prompts phải giữ tenant scope chính xác.
- **Prompt 07**: tenant safety audit nếu muốn ưu tiên permission/scope trước khi đưa thêm query vào repository.

## Prompt 05E — Split PUT handoff settings route + runtime (PASS)

Ngày cập nhật: 2026-07-08

Prompt 05E tiếp tục thu nhỏ `backend/src/api/dashboard.js` trong phạm vi **Settings/Cài Đặt / Handoff settings**:

- Tách `PUT /settings/handoff` khỏi `dashboard.js` sang `settings.controller.js` + `settings.routes.js`.
- `GET /settings/handoff` và `PUT /settings/handoff` hiện cùng nằm trong settings controller/routes, dùng chung mount `/api/settings`.
- Giữ nguyên public route `/api/settings/handoff`, method PUT, `authMiddleware`, status code thành công/lỗi, response shape và Prisma upsert behavior đã fix ở Prompt 05D-FIX.
- Runtime smoke PASS trên DB pgvector local/test: GET/PUT handoff không token → 401; `webhook`, `telegram-destinations`, `prompts`, handoff GET, handoff PUT → 200; GET lại sau PUT → 200.
- Không sửa Prisma schema/migrations, webhook handlers, tenant handoff, RAG pipeline, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.

Sau Prompt 05E, `dashboard.js` còn 2382 dòng và khoảng 96 route direct. Các settings route còn lại trong `dashboard.js` đều là write/external side effect như Telegram destination write/test, Chatwoot test, Facebook menu read/write, nên không nên tách tiếp nếu chưa có test cô lập.

Tiếp theo khuyến nghị: **Prompt 06** repository layer cho `settings`/`prompts`. Nếu vẫn muốn xử lý Settings route còn lại trước, dùng **Prompt 05F** để tạo test cô lập cho external/write route, không gọi Telegram/Chatwoot/Facebook thật.

## Prompt 05D-FIX — Handoff settings accessor + runtime (PASS)

Ngày cập nhật: 2026-07-08

Prompt 05D-FIX đã xử lý bug pre-existing trong khu vực **Settings/Cài Đặt**:

- Sửa accessor Prisma sai `prisma.handoffSettings` → `prisma.handoffSetting` trong `GET /settings/handoff`, `PUT /settings/handoff` và vị trí đọc settings liên quan khi assign handoff.
- Bỏ `botGracePeriodSeconds` khỏi Prisma payload `HandoffSetting` vì schema hiện tại không có field này; đây là sửa tương thích schema để `PUT /settings/handoff` không còn 500. Không đổi Prisma schema/migrations.
- Runtime smoke PASS trên DB pgvector local/test: no-token `GET /settings/handoff` → 401; `GET /settings/webhook`, `GET /settings/telegram-destinations`, `GET /prompts` → 200; `GET /settings/handoff` → 200; `PUT /settings/handoff` với payload tương đương current settings → 200; GET lại → 200.
- Không sửa webhook handlers, tenant handoff, RAG pipeline, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.

Tác động behavior có chủ đích: `/api/settings/handoff` từ 500 do bug accessor thành 200 đúng contract; public route/method/auth/response shape giữ nguyên.

Tiếp theo nên chọn một trong hai hướng:

- **Prompt 05E**: test cô lập các route settings write/external side effect còn lại trước khi tách thêm.
- **Prompt 06**: bắt đầu repository layer cho nhóm `settings`/`prompts` đã có runtime baseline.

## Prompt 05D — Settings route split + runtime (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-08

Prompt 05D tiếp tục tổ chức phần **Settings/Cài Đặt** (khu vực mấu chốt: webhook config, Telegram destinations, handoff, provider/API, channel/Chatwoot/Facebook config):

- Tách `GET /settings/handoff` khỏi `dashboard.js` sang `settings.controller.js` + `settings.routes.js` (move nguyên trạng), giữ public route/method/auth/status/shape/DB query/error. `dashboard.js`: 2408 → 2395 dòng.
- Runtime: 3 route tách trước (`webhook`, `telegram-destinations`, `prompts`) PASS 200; auth 401 khi thiếu token; `handoff` trả **500 giữ nguyên** như bản gốc (không regression).
- **Phát hiện bug pre-existing**: route handoff dùng `prisma.handoffSettings` (số nhiều) nhưng model là `HandoffSetting` (đúng `prisma.handoffSetting`) → undefined → 500. Không tự sửa (behavior change, cần approval).

Nguyên tắc Settings refactor: an toàn route-by-route, có runtime smoke test; **không** tách route external side effect (Telegram/Chatwoot/Facebook) hoặc route write khi chưa có test cô lập riêng.

Tiếp theo: **Prompt 05D-FIX** (sửa accessor handoff, cần approval) → **Prompt 05E** (route settings write/external với test cô lập) hoặc **Prompt 06** (repository layer prompts/settings).

## Prompt 05R-LOCALDB-FIX — Local pgvector fix + run backend (PASS)

Ngày cập nhật: 2026-07-08

Sau Prompt 05R-ENV, môi trường tạm bị xóa nên backend fail (`DATABASE_URL not found`, `type "vector" does not exist`). Prompt 05R-LOCALDB-FIX đã:

- Tạo lại `backend/.env` + `dashboard/.env.local` local-only (gitignored, không commit).
- Dựng DB pgvector local **bền vững**: container `bbotech-pgvector-local` (`pgvector/pgvector:pg16`, port 5433, named volume `bbotech_pgvector_local_data`), bật extension `vector`, `prisma migrate deploy` (non-destructive).
- `npm run dev` chạy OK; smoke test 3 route PASS lại (401 no-token; 200 + shape đúng có token).
- Giữ lại container + volume + env để user tự chạy backend: `docker start bbotech-pgvector-local` → `cd backend` → `npm run dev`.

Không sửa source runtime/schema/migrations/webhook/RAG/tenant handoff. Không dùng `db push`/`--accept-data-loss`/`start-all.bat`/Docker compose. Runtime vẫn PASS → tiếp tục **Prompt 05D** (tách route read-only nhỏ) hoặc **Prompt 06** (repository layer).

## Prompt 05R-ENV — Local test env + runtime smoke (PASS)

Ngày cập nhật: 2026-07-08

Prompt 05R-ENV đã mở khóa runtime verification:

- Người dùng phê duyệt tạo env local-only + Docker Postgres tạm làm DB test.
- Áp dụng migration sẵn có (`prisma migrate deploy`, non-destructive) vào DB tạm trống; không `db push`.
- Runtime smoke test **PASS** cho 3 route đã tách: `GET /api/settings/webhook`, `GET /api/settings/telegram-destinations`, `GET /api/prompts` (auth 401 khi thiếu token; 200 + shape đúng khi có token; không external API; read-only DB).
- Dọn sạch: gỡ container tạm, xóa env local; không commit env; không sửa source runtime.

Vì runtime đã PASS, có thể tiến hành **Prompt 05D** (tách thêm route read-only nhỏ) hoặc **Prompt 06** (repository layer cho prompts/settings). Mỗi bước tiếp theo nên có runtime verification tương đương trên env/DB local/test trước khi mở rộng blast radius. Vẫn không chạy migration/db push/Docker/start-all trên dữ liệu production.

## Prompt 05R — Feature inventory + local run + runtime smoke (BLOCKED)

Ngày cập nhật: 2026-07-08

Prompt 05R đã:

- Tạo `docs/FEATURE_INVENTORY.md` và `docs/LOCAL_RUN_GUIDE.md`.
- Chạy static validation đầy đủ: backend `node --check` + `prisma validate` dummy PASS; dashboard `tsc --noEmit` + `next build` PASS.
- Kiểm tra readiness: dependency đã có; nhưng `backend/.env` và `dashboard/.env(.local)` KHÔNG tồn tại và chưa có DB local/test.

Kết quả: runtime smoke test 3 route (`GET /settings/webhook`, `GET /settings/telegram-destinations`, `GET /prompts`) **BLOCKED — needs local/test env**. Không start app server, không gọi API, không migration/db push/Docker/start-all.

Bước tiếp theo: người dùng chuẩn bị `backend/.env` + `dashboard/.env.local` local/test và PostgreSQL local/test, sau đó chạy lại Prompt 05R để thực hiện Phase 5. Chỉ khi 3 route runtime PASS mới tiếp tục Prompt 05D (tách thêm route read-only nhỏ) hoặc Prompt 06 (repository layer cho prompts/settings).

## Prompt 05C đã hoàn thành phase 3

Ngày cập nhật: 2026-07-08

Prompt 05C đã tiếp tục tách route nhỏ trong phạm vi an toàn:

- Tách `GET /prompts` khỏi `backend/src/api/dashboard.js`.
- Tạo `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/prompts.routes.js`.
- Mount prompts route bằng `router.use('/prompts', createPromptRoutes({ authMiddleware, getTenantScope, prisma }))`.
- Giữ nguyên public route `/api/prompts`, method `GET`, auth middleware, tenant scope, Prisma query, status code và response shape.
- Không tách các route `GET /prompts/:id`, `POST /prompts`, `PUT /prompts/:id`, `DELETE /prompts/:id` vì các route này có detail/write behavior và nên xử lý riêng.
- Không sửa webhook handlers, tenant handoff, RAG pipeline, bot engine, Prisma schema/migrations hoặc dashboard frontend.
- Static validation pass — chưa runtime verified.

Prompt tiếp theo nên là Prompt 05R: chạy runtime smoke test có kiểm soát cho 3 route đã tách (`GET /settings/webhook`, `GET /settings/telegram-destinations`, `GET /prompts`) trước khi tiếp tục Prompt 05D hoặc sang Prompt 06 repository layer.

## Prompt 05B đã hoàn thành phase 2

Ngày cập nhật: 2026-07-08

Prompt 05B đã tiếp tục tách route nhỏ trong phạm vi an toàn:

- Tách `GET /settings/telegram-destinations` khỏi `backend/src/api/dashboard.js`.
- Mở rộng `backend/src/presentation/http/controllers/dashboard/settings.controller.js`.
- Mở rộng `backend/src/presentation/http/routes/dashboard/settings.routes.js`.
- Mount settings route bằng `router.use('/settings', createSettingsRoutes({ authMiddleware, prisma }))`.
- Giữ nguyên public route `/api/settings/telegram-destinations`, method `GET`, auth middleware, Prisma query, status code và response shape.
- Không tách các route `POST/PUT/DELETE /settings/telegram-destinations` hoặc route test Telegram vì có write/external side effect.
- Không sửa webhook handlers, tenant handoff, RAG pipeline, Prisma schema/migrations hoặc dashboard frontend.
- Static validation pass — chưa runtime verified.

Prompt tiếp theo nên là Prompt 05C: tiếp tục tách thêm một route/nhóm route nhỏ, ưu tiên read-only, không raw SQL, không upload, không external side effect. Chưa nên chuyển sang repository layer nếu `backend/src/api/dashboard.js` vẫn còn nhiều route trực tiếp và controller boundary chưa đủ rõ.

## Prompt 05 đã hoàn thành phase 1

Ngày cập nhật: 2026-07-08

Prompt 05 đã tách nhóm route đầu tiên trong phạm vi an toàn:

- Tách `GET /settings/webhook` khỏi `backend/src/api/dashboard.js`.
- Tạo `backend/src/presentation/http/controllers/dashboard/settings.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/settings.routes.js`.
- Mount lại bằng `router.use('/settings', createSettingsRoutes({ authMiddleware }))`.
- Giữ nguyên public route `/api/settings/webhook`, method `GET`, auth middleware và response shape.
- Không sửa webhook handlers, tenant handoff, RAG pipeline, Prisma schema/migrations hoặc dashboard frontend.
- Static validation pass — chưa runtime verified.

Prompt tiếp theo nên là Prompt 05B: tiếp tục tách thêm một nhóm route nhỏ, ít rủi ro khỏi `backend/src/api/dashboard.js` trước khi chuyển sang repository layer.

## Prompt 04 đã hoàn thành

Ngày cập nhật: 2026-07-08

Prompt 04 đã xử lý phần config/env trong phạm vi an toàn:

- Mở rộng backend config helper, chưa migrate runtime call site lớn.
- Chuẩn hóa dashboard env helper và gom Chatwoot fallback trong settings về helper.
- Bổ sung `backend/.env.example`, tạo `dashboard/.env.example`.
- Tạo `docs/ENV_POLICY.md`.
- Scan read-only các rủi ro DevOps/local URL nhưng chưa sửa `start-all.bat`, `backend/Dockerfile`, `webhook-urls-current.txt`.

Prompt tiếp theo nên là Prompt 05: tách `backend/src/api/dashboard.js` theo route/controller domain nhỏ, giữ nguyên public route và response contract.

Ngày cập nhật: 2026-07-08  
Trạng thái: Prompt 03 đã tạo architecture shell và wrapper tối thiểu, chưa đổi behavior có chủ đích.

## 1. Prompt 03 đã làm gì

Prompt 03 tạo nền tổ chức cho các bước refactor sau:

- Tạo backend Clean Architecture shell: `domain`, `application`, `infrastructure`, `presentation`.
- Thêm README trong các layer/folder chính để ghi rõ vai trò và dependency rule.
- Thêm Prisma wrapper tại `backend/src/infrastructure/persistence/prisma/client.js`.
- Thêm backend config helper tại `backend/src/infrastructure/services/config.js`.
- Tạo dashboard shell: `components`, `features`, `lib/config`, `lib/api`, `lib/auth`, `lib/utils`, `styles`.
- Thêm dashboard env helper tại `dashboard/src/lib/config/env.ts`.
- Thêm dashboard API client factory tại `dashboard/src/lib/api/client.ts`.
- Giữ `dashboard/src/lib/api.ts` làm compatibility facade.
- Chuẩn hóa một số hard-code `http://localhost:3001` trong dashboard sang `API_BASE_URL`, fallback local vẫn giữ như cũ.
- Không move page lớn, webhook, tenant handoff, RAG pipeline hoặc Prisma schema.

## 2. Thứ tự refactor tiếp theo

| Prompt | Tên | Mục tiêu |
|---|---|---|
| Prompt 04 | Config hardening + localhost cleanup | Gom cấu hình backend/dashboard, loại hard-code URL còn lại, viết env policy. |
| Prompt 05 | Backend API route/controller split | Tách `backend/src/api/dashboard.js` theo domain nhỏ, giữ route/response. |
| Prompt 06 | Repository layer cho Prisma | Đưa Prisma access dần vào repositories, không đổi schema. |
| Prompt 07 | Tenant safety audit | Trace tenant scope trên webhook, conversations, staff, knowledge, handoff. |
| Prompt 08 | RAG/raw SQL hardening | Audit `$queryRawUnsafe`, pgvector query và input source. |
| Prompt 09 | Dashboard feature split | Tách page lớn thành feature components, giữ route/UI behavior. |
| Prompt 10 | DevOps/deploy hardening | Tách local scripts khỏi production, xử lý migration policy và deploy env. |

## 3. Prompt 04 - Config hardening + localhost cleanup

Mục tiêu:

- Chuẩn hóa config backend/dashboard.
- Loại hard-code `localhost`, `127.0.0.1`, URL local trong source runtime nếu không đổi behavior.
- Viết env policy: biến bắt buộc, biến optional, fallback chỉ local dev.

File được phép sửa:

- `backend/src/infrastructure/services/config.js`
- `dashboard/src/lib/config/env.ts`
- `dashboard/src/lib/api.ts`
- Dashboard pages còn fetch/base URL hard-code
- `docs/ARCHITECTURE.md`, `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`

File không được sửa:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/**`
- `backend/src/tenants/handoff.js`
- `backend/src/rag/pipeline.js`
- `backend/src/webhook/*`

Validation bắt buộc:

- Backend `node --check` cho config wrapper và file trọng yếu.
- Prisma validate với `DATABASE_URL` dummy.
- Dashboard `tsc --noEmit`.
- Dashboard build.
- `rg "localhost|127\\.0\\.0\\.1" backend/src dashboard/src`.

Risk rollback:

- Nếu URL behavior đổi sai, revert các thay đổi page/client về helper trước đó.
- Không sửa production deploy script trong cùng prompt nếu chưa có env policy.

## 4. Prompt 05 - Backend API route/controller split

Mục tiêu:

- Tách `backend/src/api/dashboard.js` thành route/controller theo domain nhỏ.
- Giữ public route và response contract.
- Ưu tiên auth/stats hoặc một domain ít rủi ro trước.

File được phép sửa:

- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/controllers/**`
- `backend/src/presentation/http/routes/**`
- `backend/src/application/dtos/**` nếu cần type/shape tài liệu hóa

File không được sửa:

- Webhook handlers
- Tenant handoff
- RAG pipeline
- Prisma schema/migrations

Validation bắt buộc:

- `node --check` cho toàn bộ file mới và `src/index.js`.
- Prisma validate với URL dummy.
- Route map trước/sau bằng `rg "router\\.(get|post|put|delete)"`.

Risk rollback:

- Nếu route import/registration vỡ, revert domain vừa tách, không revert toàn bộ repo.

## 5. Prompt 06 - Repository layer cho Prisma

Mục tiêu:

- Tạo repository implementation đầu tiên dùng `backend/src/infrastructure/persistence/prisma/client.js`.
- Không tạo PrismaClient thứ hai.
- Tách query ít rủi ro trước.

File được phép sửa:

- `backend/src/infrastructure/repositories/**`
- Một phần nhỏ của `backend/src/api/dashboard.js` hoặc use case đã tách
- `backend/src/domain/interfaces/**`

File không được sửa:

- Prisma schema/migrations
- RAG raw SQL phức tạp nếu chưa tới Prompt 08
- Tenant handoff nếu chưa có Prompt 07 audit

Validation bắt buộc:

- `node --check`.
- Prisma validate với URL dummy.
- So sánh query route trước/sau bằng review diff.

Risk rollback:

- Mỗi repository chỉ migrate một nhóm query nhỏ; nếu fail, revert nhóm đó.

## 6. Prompt 07 - Tenant safety audit

Mục tiêu:

- Trace tenant scope từ webhook payload tới conversation/message/staff/knowledge query.
- Lập bảng query có tenantId, pageId, channel config và fallback.
- Không sửa logic lớn nếu chưa rõ.

File được phép sửa:

- Docs/report audit.
- Chỉ sửa source nếu bug scope đơn giản và có validation rõ.

File không được sửa:

- Không rewrite tenant handoff.
- Không đổi webhook URL.
- Không đổi Prisma schema.

Validation bắt buộc:

- Read-only scan query tenantId.
- `node --check`.
- Prompt-specific regression checklist.

Risk rollback:

- Nếu phát hiện bug scope lớn, tạo report và tách prompt fix riêng.

## 7. Prompt 08 - RAG/raw SQL hardening

Mục tiêu:

- Audit toàn bộ `$queryRawUnsafe`.
- Phân loại query có input người dùng, vector formatting, schema-dependent query.
- Chuyển sang query an toàn từng điểm nếu chắc chắn.

File được phép sửa:

- `backend/src/rag/pipeline.js`
- Repository/helper liên quan RAG nếu đã có
- Report/docs

File không được sửa:

- Prisma schema/migrations nếu chưa có migration plan.
- Bot agent/tools ngoài phần gọi RAG cần thiết.

Validation bắt buộc:

- `node --check`.
- Prisma validate dummy.
- Test bằng sample nhỏ chỉ khi có DB an toàn.

Risk rollback:

- Nếu vector query đổi kết quả hoặc syntax DB không chắc, giữ nguyên và chỉ document risk.

## 8. Prompt 09 - Dashboard feature split

Mục tiêu:

- Tách một page lớn thành feature component/hook nhỏ.
- Giữ route URL, UI text, API calls và auth/tenantScope.

File được phép sửa:

- Một page trong `dashboard/src/app/dashboard/*/page.tsx`
- Folder tương ứng trong `dashboard/src/features/*`
- Shared component nếu thực sự dùng ngay

File không được sửa:

- Không redesign toàn dashboard.
- Không đổi auth provider.
- Không đổi API response contract.

Validation bắt buộc:

- `npx --no-install tsc --noEmit`.
- `npm run --if-present build`.
- Browser/manual verification nếu app server được phép trong prompt đó.

Risk rollback:

- Nếu build fail và nguyên nhân không rõ, revert page vừa tách.

## 9. Prompt 10 - DevOps/deploy hardening

Mục tiêu:

- Tách local bootstrap khỏi production deploy.
- Xử lý `db push --accept-data-loss`, container migration policy, env file policy và stale webhook URLs.

File được phép sửa:

- `start-all.bat`, `stop-all.bat`
- Dockerfile/compose nếu prompt cho phép
- docs deploy/env

File không được sửa:

- Không đổi application behavior cùng lúc với deploy script.
- Không chạy migration/db push trên dữ liệu thật.

Validation bắt buộc:

- `docker compose config` nếu được phép.
- Không chạy `docker compose up` nếu chưa có yêu cầu rõ.
- Script dry-run hoặc read-only validation trước khi chạy thật.

Risk rollback:

- Giữ backup script cũ hoặc commit nhỏ để revert từng script.

## 10. Prompt 08D - Dashboard no-Chatwoot cleanup completed

Mục tiêu đã hoàn tất:

- Dashboard không còn reference Chatwoot trong `dashboard/src`.
- Dashboard không còn gọi route test/lookup legacy: `/api/settings/chatwoot-test`, `/api/channel-configs/lookup-inboxes`.
- Tenant form không còn gửi legacy integration fields.
- Backend `POST /tenants` có bridge compatibility tối thiểu để không phụ thuộc payload legacy từ Dashboard.

File đã sửa trong phạm vi source:

- `backend/src/api/dashboard.js`
- `dashboard/src/lib/config/env.ts`
- `dashboard/src/lib/api.ts`
- `dashboard/src/app/dashboard/settings/page.tsx`
- `dashboard/src/app/dashboard/channel-configs/page.tsx`
- `dashboard/src/app/dashboard/tenants/page.tsx`
- `dashboard/src/features/channel-configs/README.md`
- `dashboard/src/features/settings/README.md`

File không được sửa và đã giữ nguyên:

- `backend/prisma/schema.prisma`
- Prisma migrations
- RAG pipeline
- Webhook handlers
- Tenant handoff
- Bot engine/tools
- Package/Docker/scripts

Validation:

- Dashboard source keyword scan sạch.
- Backend `node --check` cho `src/api/dashboard.js` PASS.
- `npx prisma validate` PASS.
- Dashboard `tsc --noEmit` PASS.
- Dashboard `next build` PASS.
- Runtime nhẹ với server đang chạy sẵn: backend health 200, dashboard 200.
- Dashboard lint vẫn open vì `next lint` yêu cầu cấu hình ESLint tương tác.

Kế hoạch tiếp theo:

- Prompt 08E: quyết định và thực thi cleanup schema legacy nếu có migration/backup plan rõ ràng; không làm additive/rename DB trong prompt UI cleanup.
- Prompt quality gate: cấu hình lint không tương tác, sau đó đưa lint vào validation chính thức.
- Prompt runtime smoke tenant: trên DB test riêng, chạy create/update tenant bằng payload mới và xác nhận backend tự bridge legacy columns.

## Prompt 08E — Backend tenant contract stop-write + runtime smoke

Ngày cập nhật: 2026-07-09

Thay đổi source (chỉ `backend/src/api/dashboard.js`):
- `POST /api/tenants`: bỏ nhận field legacy Chatwoot; chỉ cần `slug`/`name` + field trung tính; backend tự set `direct-facebook` cho cột NOT NULL.
- `PUT /api/tenants/:id`: bỏ toàn bộ nhánh ghi legacy token/secret/model/account/base-url/team (stop-write).
- `maskTenant()`: strip cột legacy khỏi response; thêm `integrationMode`/`messagingMode = direct-facebook`.
- Gỡ import `encryptIfPresent` không còn dùng.

Không đổi: route path/method/auth, `platformAdminOnly`, nested tenant guard, Prisma schema/migrations, RAG, webhook, handoff, package/Docker/scripts.

Validation:
- `node --check` backend trọng yếu PASS; `npx prisma validate` PASS.
- Dashboard `tsc --noEmit` PASS; `next build` PASS.
- Runtime mutating smoke trên DB local: 17/17 PASS, cleanup tenant test = 0.

Kế hoạch tiếp theo:
- Prompt schema-removal: backup DB rồi tạo migration drop cột/index legacy (`chatwoot_*`, `webhook_secret_enc` nếu không tái dùng, `conversations.chatwoot_conversation_id`).
- Prompt quality gate: cấu hình ESLint non-interactive.

## Prompt 08H - Browser login redirect fix completed

Mục tiêu đã hoàn tất:

- Fix regression đăng nhập trên browser: form Login đã hydrate lại đúng sau khi loại bỏ tình trạng dashboard dev server phục vụ chunk 404.
- Login thành công chuyển sang `/dashboard` bằng `router.replace`, tránh quay ngược về trang login trong lịch sử browser.
- Login page tự đưa user đã đăng nhập về Dashboard sau khi auth provider hydrate xong.
- Failed login 401 không còn bị global interceptor redirect/reload, nên UI hiện được lỗi an toàn.
- Admin seed không còn fallback mật khẩu mẫu local/dev.

File đã sửa:

- `backend/src/index.js`
- `dashboard/src/app/login/page.tsx`
- `dashboard/src/lib/api.ts`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `report/PROMPT_08H_BROWSER_LOGIN_REDIRECT_FIX_REPORT.md`

Không thay đổi:

- `.env` và `.env.local`
- Prisma schema/migrations
- RAG/raw SQL
- Webhook handlers
- Tenant handoff
- Package/Docker/scripts

Validation:

- Backend syntax + Prisma validate PASS.
- Dashboard typecheck + build PASS.
- Backend auth smoke 8/8 PASS.
- Browser redirect smoke PASS: hydrate, login đúng, refresh Dashboard, logout, login sai, không chunk 404.

Kế hoạch tiếp theo:

- Prompt 09: RAG/raw SQL hardening. Tập trung audit tenant scope, parameterized query và các đường truy vấn knowledge/search.
- Nếu tiếp tục auth sau Prompt 09, nên có prompt riêng cho token/session storage hardening thay vì trộn vào RAG.

## Prompt 09 - RAG/raw SQL hardening phase 1 completed

Mục tiêu đã hoàn tất:

- RAG vector validation: khóa dimension 768, reject NaN/Infinity/string/malformed vector.
- RAG SQL hardening: search/add/update/reindex dùng Prisma tagged template; không còn `$queryRawUnsafe` trong `backend/src/rag/pipeline.js`.
- Knowledge tenant scope: upload/scrape/reindex dùng `getTenantScope(req)` theo contract hiện hữu.
- Scrape safety: chặn protocol nguy hiểm và localhost/private IP literal trước khi fetch.

Backlog có chủ đích:

- `backend/src/api/dashboard.js` analytics còn `$queryRawUnsafe` với parameter positional, chưa xử lý trong Prompt 09.
- `backend/src/tenants/handoff.js` còn `$queryRawUnsafe`, cần prompt handoff riêng.
- `backend/scripts/seed.js` còn raw unsafe internal script, nên xử lý khi làm DevOps/security scripts.

Validation:

- Backend syntax + Prisma validate PASS.
- Dashboard `tsc --noEmit` PASS.
- Auth smoke PASS.
- RAG helper + DB smoke PASS, cleanup test data PASS.

Kế hoạch tiếp theo:

- Prompt 09B: analytics raw SQL hardening.
- Prompt handoff-specific: tenant handoff raw SQL + tenant isolation runtime smoke.

## Prompt 09B - Analytics raw SQL hardening completed

Mục tiêu đã hoàn tất:

- `GET /api/analytics` giữ nguyên route/method/auth (`authMiddleware`, `platformAdminOnly`) và giữ response shape hiện hữu.
- 4 query analytics (`staffResponseTimes`, `hourlyActivity`, `closedConversations`, `dailyMessages`) không còn dùng `$queryRawUnsafe`; đã chuyển sang `$queryRaw` tagged template với `sinceDate` parameterized.
- `days` được chuẩn hóa an toàn trong JS trước khi tính `sinceDate`: default `30`, min `1`, max `365`.
- Runtime analytics smoke PASS bằng platform admin token; `days=abc` và `days=999999` không crash.

Không thay đổi:

- Prisma schema/migrations, package files, Docker/scripts, dashboard UI/auth, RAG files, tenant handoff và direct Facebook webhook.
- `.env` và `.env.local` không bị mở/in/stage.

Kế hoạch tiếp theo:

- Prompt 09C: harden `$queryRawUnsafe` trong `backend/src/tenants/handoff.js`, kèm tenant isolation và handoff runtime smoke.
- Prompt 10 DevOps/security scripts: xử lý `backend/scripts/seed.js` nếu muốn kết thúc toàn bộ unsafe raw SQL còn lại.
