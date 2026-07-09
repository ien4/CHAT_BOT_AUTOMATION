# REFACTOR PLAN - BBOTECH BOT AUTOMATION

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
