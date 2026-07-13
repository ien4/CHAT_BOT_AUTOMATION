# PROJECT PROGRESS — BBOTECH BOT AUTOMATION

## Cập nhật mới nhất - Prompt 21C-SAFE Dashboard content-packages feature split

Ngày cập nhật: 2026-07-13

Trạng thái mới nhất: **PASS**. Prompt 21C-SAFE đã tách `dashboard/src/app/dashboard/content-packages/page.tsx` thành feature module `dashboard/src/features/content-packages/**`, giữ nguyên route `/dashboard/content-packages`, UI text/className/layout và API behavior hiện hữu.

Đã làm:

- Audit trang `content-packages/page.tsx`: data loading, package CRUD, item CRUD, modal/form state, list/detail render, formatter/type và handler `migrateFromCampaigns`.
- Rút page từ **671 LOC** xuống **85 LOC**; page chỉ còn client orchestrator import hook/components và render layout cũ.
- Tạo `useContentPackages` để giữ state/data loading/handlers cũ.
- Tách components header/error/loading/list/detail/package form/item form; tạo `types.ts`, formatter label và barrel `index.ts`.
- Giữ nguyên `contentPackagesApi` hiện hữu; không sửa `dashboard/src/lib/api.ts`.
- Handler migrate từ campaign được preserve nguyên logic cũ nhưng đánh dấu **MIGRATE_ACTION_LOCKED_NOT_EXECUTED**; runtime smoke chỉ GET/list route, không click/gọi migrate/import/action.

Validation/smoke:

- Baseline trước patch PASS: backend `npm run quality`, backend `npx prisma validate`, dashboard `npm run typecheck`, dashboard `npm run build`, root diff sạch.
- Sau patch PASS: dashboard `npx --no-install tsc --noEmit`, dashboard `npm run typecheck`, dashboard `npm run build`, backend `npm run quality`, backend `npx prisma validate`.
- Runtime route smoke dashboard PASS trên dev server tạm port `3019`: `/login` 200, `/dashboard` 200, `/dashboard/content-packages` 200, route giả 404; đã dừng process tạm sau smoke.
- Safety scans: không có direct `fetch(` mới trong feature/page/lib API scan; không có `process.env`/`NEXT_PUBLIC`/secret token access trong feature; match migrate chỉ là handler/UI text được preserve; install/destructive command chỉ là docs/script lịch sử cũ, không phải thay đổi mới.

Không sửa backend, schema/migration/package/lock, webhook/RAG/handoff/tenants/notifications, Docker/start scripts, env thật hoặc API client. Không gọi external provider, không gửi POST `/webhook`, không claim Meta verified hoặc production ready. Phase 19 vẫn **Started**, Phase 21 vẫn **Started**. Meta status không đổi: public Ngrok smoke từ 22B PASS, Meta verify pending, Meta POST event pending, production pending.

Chi tiết: `report/PROMPT_21C_DASHBOARD_CONTENT_PACKAGES_REPORT.md`.

## Cập nhật mới nhất - Prompt 21B-4 Backend route consolidation stats read

Ngày cập nhật: 2026-07-13

Trạng thái mới nhất: **PASS**. Prompt 21B-4 đã tách `GET /api/stats` khỏi `backend/src/api/dashboard.js` sang repository/controller/routes theo pattern Phase 21B, giữ nguyên behavior và public API contract.

Đã làm:

- Audit route map `dashboard.js`; chọn `GET /api/stats` vì GET-only, `authMiddleware + platformAdminOnly`, chỉ đọc Prisma/count/groupBy và tính toán in-memory, không external, không mutation, không raw SQL, không secret/token field.
- Tạo `backend/src/infrastructure/repositories/dashboardStats.repository.js`.
- Tạo `backend/src/presentation/http/controllers/dashboard/stats.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/stats.routes.js`.
- `backend/src/api/dashboard.js` chỉ thêm require + `router.use('/stats', ...)`; không duplicate handler cũ.
- Giữ nguyên response shape: totals, `messagesByDay`, `intentDistribution`; giữ error `500 { error: 'Lỗi máy chủ nội bộ' }`.

Validation/smoke:

- Backend `npm run quality` PASS; `npx prisma validate` PASS.
- Dashboard `npm run typecheck` PASS.
- Runtime smoke PASS bằng app tạm mount source mới: `/api/stats` no-token 401, tenant token 403, platform token 200 đúng shape; regression `/api/prompts`, `/api/settings/webhook`, `/api/channel-configs`, `/api/quick-reply-menus`, `/api/campaigns`, `/api/analytics?days=7` đều 200.
- Process backend 3001 hiện có vẫn PASS `/health` 200, `/webhook` thiếu params 403, `POST /chatwoot-webhook` 404.
- Safety scans không thêm raw unsafe, không thêm Chatwoot runtime, không thêm destructive command, không tạo PrismaClient mới.

Không sửa webhook/RAG/bot/tenants/telegram/facebook/notifications, dashboard source, schema/migrations/package/Docker/start scripts/env thật. Không gọi external provider, không gửi POST `/webhook`, không claim Meta verified hoặc production ready. Phase 21 vẫn **Started**, chưa Done.

Chi tiết: `report/PROMPT_21B_4_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`.

## Cập nhật mới nhất - Prompt 22C-SAFE Meta real event + log redaction audit

Ngày cập nhật: 2026-07-13

Trạng thái mới nhất: **BLOCKED_META_VERIFY_CONFIRMATION_MISSING**. Prompt 22C-SAFE bị dừng đúng quy trình trước real POST event vì phiên này chưa có xác nhận bắt buộc `META_VERIFY_OPERATOR_CONFIRMED=YES`.

Đã làm:

- Preflight git/secret safety PASS: branch làm việc riêng, commit `908fca9 Record Meta webhook public smoke and challenge status` tồn tại, working tree sạch trước patch, env thật không tracked/staged.
- Đọc context 22B, staging readiness/runbook/status docs, quality gate, env example và `backend/src/webhook/handler.js`.
- Baseline static validation PASS: backend `npm run quality`, backend `npx prisma validate`, dashboard `npm run typecheck`, root diff sạch.
- Xác nhận không có operator confirmation trong phiên này, nên không test real event.

Không làm:

- Không gửi hoặc chờ POST event thật từ Messenger/Page test.
- Không gọi Meta/Facebook API bằng script.
- Không dùng Ngrok inspection API.
- Không gửi POST object `page` giả.
- Không đọc/in token, secret, raw sender id, raw recipient id, raw message text hoặc raw webhook body.

Trạng thái giữ nguyên: public HTTPS smoke **PUBLIC_SMOKE_PASS_NO_SECRET** theo Prompt 22B-SAFE; Meta verify **META_VERIFY_OPERATOR_CONFIRMATION_PENDING**; Meta POST event thật **PENDING**; production rollout **PENDING**.

Chi tiết: `report/PROMPT_22C_META_REAL_EVENT_REPORT.md`.

## Cập nhật mới nhất - Prompt 22B-SAFE Public Ngrok smoke + Meta verify checkpoint

Ngày cập nhật: 2026-07-13

Trạng thái mới nhất: **PASS WITH WARNINGS**. Prompt 22B-SAFE đã chạy public HTTPS smoke qua Ngrok thành công, nhưng Meta Verify Challenge vẫn pending vì chưa có xác nhận từ Meta UI của người vận hành.

Đã làm:

- Preflight git/secret safety PASS: branch làm việc riêng, commit `dede1fb Verify ngrok public smoke readiness` tồn tại, working tree sạch trước patch, env thật không tracked/staged.
- Baseline static validation PASS: backend `npm run quality`, backend `npx prisma validate`, dashboard `npm run typecheck`, root diff sạch.
- Local runtime recheck PASS: Docker phản hồi, `bbotech-pgvector-local` đang Up, DB `5433` listen, backend `3001` listen.
- `npx prisma migrate deploy` PASS, không có pending migration.
- Local smoke an toàn PASS: `/health` 200, `/webhook` thiếu params 403, `/chatwoot-webhook` 404, login admin tạm 200 + token exists, `/api/settings/webhook` 200 secret mask/null, `/api/prompts` 200; cleanup admin tạm deleted 1.
- Public base URL: `https://backspace-scrambler-stuck.ngrok-free.dev`.
- Callback URL đúng cho Meta Developer: `https://backspace-scrambler-stuck.ngrok-free.dev/webhook`.
- Public Ngrok smoke không dùng secret PASS: `/health` 200, `/webhook` thiếu params 403, `/chatwoot-webhook` 404.
- Meta Verify Challenge: `META_VERIFY_OPERATOR_CONFIRMATION_PENDING`.

Không sửa source/schema/package/dashboard/Docker/start scripts/env thật. Không dùng verify token thật, không gửi `hub.challenge`, không gửi POST object `page`, không gọi Meta/Facebook API thật, không claim Meta verified hoặc production ready.

Chi tiết: `report/PROMPT_22B_META_VERIFY_CHALLENGE_REPORT.md`.

## Cập nhật mới nhất - Prompt 22A-2 Ngrok local runtime restore + public smoke

Ngày cập nhật: 2026-07-13

Trạng thái mới nhất: **PASS WITH WARNINGS**. Prompt 22A-2 đã khôi phục/kiểm tra local runtime an toàn và chạy local smoke PASS; public smoke qua Ngrok bị block vì thiếu `STAGING_BASE_URL`.

Đã làm:

- Docker client/server PASS.
- Container `bbotech-pgvector-local` tồn tại và đang Up; DB port `5433` listen.
- Backend port `3001` listen; dùng process hiện có, không start/kill backend.
- `npx prisma migrate deploy` PASS, không có pending migration.
- Local smoke PASS: `/health` 200, `/webhook` thiếu params 403, `/chatwoot-webhook` 404, login admin tạm 200 + token exists, `/api/settings/webhook` 200 secret mask/null, `/api/prompts` 200, optional channel-configs/quick-reply-menus/campaigns 200; cleanup admin tạm deleted 1.
- `STAGING_BASE_URL`: **missing**, nên public Ngrok smoke **NOT RUN**.

Không sửa source/schema/package/dashboard/Docker/start scripts/env thật. Không dùng verify token thật, không gửi POST event thật, không gọi Meta/Facebook API thật, không claim Meta verified hoặc production ready.

Chi tiết: `report/PROMPT_22A_2_NGROK_PUBLIC_SMOKE_REPORT.md`.

## Cập nhật mới nhất - Prompt 22A-1 Webhook log redaction + staging runbook hardening

Ngày cập nhật: 2026-07-12

Trạng thái mới nhất: **PASS WITH WARNINGS**. Prompt 22A-1 đã harden log trong direct Facebook/Meta webhook path và tạo staging runbook. Đây là security/log hardening nhỏ, không phải route refactor.

Đã làm:

- Patch nhỏ `backend/src/webhook/handler.js`: thay log message text, full sender id, full recipient id, postback payload, outbound text preview và raw Graph error detail bằng metadata đã redact.
- Thêm helper trong cùng file: mask id, summarize event metadata, log info/warn/error an toàn.
- Giữ nguyên behavior: `GET /webhook` verify status/flow không đổi, `POST /webhook` status/flow không đổi, call bot/RAG/handoff/sendMessage không đổi.
- Tạo `docs/META_WEBHOOK_STAGING_RUNBOOK.md`.
- Cập nhật readiness/status docs và tạo report Prompt 22A-1.

Validation:

- Baseline trước patch PASS: backend `npm run quality`, `npx prisma validate`, dashboard `npm run typecheck`, root diff sạch.
- Sau patch PASS: `node --check src/webhook/handler.js`, `node --check src/index.js`, backend `npm run quality`, `npx prisma validate`, dashboard `npm run typecheck`.
- Log safety scan sau patch: các match `message.text`, `sender.id`, token env còn lại là đọc field để xử lý/gửi API; không còn console log trực tiếp message text, full sender/recipient id hoặc raw body.
- Runtime smoke an toàn **BLOCKED** vì port `3001` và DB `5433` không listen; không chạy Docker Compose/start-all, không start backend khi DB không sẵn.

Không gọi Meta/Facebook API thật, không gửi POST event thật, không sửa schema/package/dashboard/Docker/start scripts/env thật, không claim Meta verified hoặc production ready.

Chi tiết: `report/PROMPT_22A_1_WEBHOOK_LOG_REDACTION_REPORT.md`.

## Cập nhật mới nhất - Prompt 22A Public HTTPS / Meta webhook staging readiness

Ngày cập nhật: 2026-07-12

Trạng thái mới nhất: **PASS WITH WARNINGS**. Prompt 22A đã audit readiness cho public HTTPS staging của Meta Developer Webhook direct vào backend Express, không refactor runtime và không gọi Meta/Facebook API thật.

Đã làm:

- Tạo `docs/META_WEBHOOK_STAGING_READINESS.md` với kiến trúc đúng `https://<domain>/webhook`, checklist staging, public smoke plan và bước verify Meta thủ công.
- Xác nhận source callback thật là `GET /webhook` và `POST /webhook`; `/api/settings/webhook` chỉ là dashboard config/read endpoint có auth; `/chatwoot-webhook*` không phải target mới.
- Baseline validation PASS: backend `npm run quality`, backend `npx prisma validate`, dashboard `npm run typecheck`, root diff sạch trước patch.
- Local smoke PASS trên backend 3001 hiện có: `/health` 200, `/webhook` thiếu params 403, `/chatwoot-webhook` 404, login admin tạm 200 + token exists, settings webhook secret mask/null, prompts/channel-configs/quick-reply-menus/campaigns/analytics 200, cleanup admin tạm deleted 1.
- Public HTTPS smoke **NOT RUN** vì không có biến shell `STAGING_BASE_URL`; docs hiện chỉ có placeholder `https://your-domain.com`, nên status là `STAGING_URL_MISSING`.

Cảnh báo còn lại:

- Docker API trả 500/time-out cho `docker version` và `docker ps`, dù port `5433` và `3001` đang listen và smoke local PASS.
- POST handler hiện còn log sender id/message text; trước Meta POST event thật cần policy/redaction log staging phù hợp.
- Chưa được claim Meta connected/verified, Meta POST event thật, public staging ready hoặc production ready.

Chi tiết: `report/PROMPT_22A_META_WEBHOOK_STAGING_READINESS_REPORT.md`.

## Cập nhật mới nhất - Prompt 21D Docs index + stale docs / legacy cleanup plan

Ngày cập nhật: 2026-07-12

Trạng thái mới nhất: **PASS**. Prompt 21D đã tạo docs index hiện tại và historical docs index để người đọc mới phân biệt source of truth hiện tại với tài liệu lịch sử/stale.

Đã làm:

- Tạo `docs/CURRENT_STATUS_INDEX.md` làm điểm vào hiện tại cho trạng thái dự án, No-Chatwoot target, webhook, deployment, quality và next prompt.
- Tạo `docs/HISTORICAL_DOCS_INDEX.md` để phân loại report lịch sử, root docs stale và cách đọc tài liệu cũ.
- Gắn header stale cho `MULTITENANT_PROGRESS.md` và `ROADMAP.md`; không rewrite toàn file và không xóa lịch sử.
- Audit `start-all.bat`, `start_all.bat`, `stop-all.bat`, `webhook-urls-current.txt` và các docs có Chatwoot cũ; các script legacy vẫn là backlog, không sửa trong 21D.
- Xóa 3 thư mục legacy rỗng được phép: `backend/src/chatwoot`, `backend/src/adapters`, `backend/src/infrastructure/integrations/chatwoot`.

Validation: backend `npm run quality` PASS, `npx prisma validate` PASS, dashboard `npm run typecheck` PASS. Không sửa runtime source, dashboard source, schema/migration/package, Docker/start scripts hoặc env thật. Không gọi external service thật. Không claim Meta connected/verified hoặc production ready. Phase 21 vẫn **Started**, chưa Done.

Chi tiết: `report/PROMPT_21D_DOCS_LEGACY_CLEANUP_REPORT.md`.

## Cập nhật mới nhất - Prompt 21B-3 Backend route consolidation campaigns read

Ngày cập nhật: 2026-07-12

Trạng thái mới nhất: **PASS**. Prompt 21B-3 đã tách `GET /api/campaigns` và `GET /api/campaigns/:id` khỏi `backend/src/api/dashboard.js` sang `presentation/http/**` + repository theo pattern 21B/21B-2. Chỉ chọn sau audit thật: `campaigns` GET là read-only Prisma, `platformAdminOnly`, không external, không upload/migrate, không mutation, không raw SQL và không có field secret/token trong schema `Campaign`. `stats` cũng là candidate read-only nhưng không chọn vì prompt ưu tiên `campaigns` nếu đủ an toàn.

Thay đổi source:

- Tạo `backend/src/infrastructure/repositories/campaigns.repository.js`.
- Tạo `backend/src/presentation/http/controllers/dashboard/campaigns.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/campaigns.routes.js`.
- `dashboard.js` chỉ thêm require + `router.use('/campaigns', ...)`; `POST /campaigns/upload`, `POST /campaigns`, `PUT /campaigns/:id`, `DELETE /campaigns/:id` giữ nguyên trong monolith.

Validation/smoke:

- Backend `npm run quality` PASS; `npx prisma validate` PASS.
- Static `node --check` PASS cho `dashboard.js`, `index.js`, `db.js`, toàn bộ dashboard controllers/routes/repositories.
- Runtime smoke PASS bằng app tạm mount source mới cho API route: login admin tạm, `/api/prompts`, `/api/settings/handoff`, `/api/settings/webhook`, `/api/channel-configs`, `/api/quick-reply-menus`, `/api/analytics?days=7`, `GET /api/campaigns` no-token 401, tenant-token 403, platform token 200 array, fake detail 404, POST/upload no-token guarded 401; cleanup admin tạm leftover = 0.
- Process backend 3001 hiện có vẫn PASS regression `/health` 200, `/webhook` thiếu verify 403, `POST /chatwoot-webhook` 404.

Không sửa dashboard source, Prisma schema/migrations, package/lock, Docker/script, env thật hoặc `.next`. Không gọi Facebook/Meta/Telegram/Gemini/Jina/LLM thật. Không claim Meta connected/verified hoặc production ready. Phase 21 vẫn **Started**, chưa Done. Chi tiết: `report/PROMPT_21B_3_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`.

## Cập nhật mới nhất - Prompt 21R Restore local runtime readiness + webhook smoke

Ngày cập nhật: 2026-07-12

Trạng thái mới nhất: **PASS**. Prompt 21R đã khôi phục và xác nhận local runtime readiness sau warning của 21S, chỉ bằng kiểm tra Docker/DB/backend và smoke endpoint an toàn. Không sửa source runtime, không sửa schema/migration/package, không gọi Facebook/Telegram/Gemini/Jina/LLM thật, không seed thật, không push remote.

Kết quả runtime:

- Docker daemon: **PASS** (`docker version` trả client/server).
- DB local: **PASS**. Container `bbotech-pgvector-local` tồn tại, đang Up, map `5433 -> 5432`; `Test-NetConnection localhost:5433` PASS.
- Prisma migration readiness: **PASS**. `npx prisma migrate status` báo schema up to date; `npx prisma migrate deploy` không có pending migration.
- Backend local: **PASS**. Port `3001` đã có process chạy sẵn, `GET /health` trả 200; prompt không start/kill backend.
- Runtime smoke: **PASS 9/9** gồm `/health` 200, `/webhook` thiếu verify params 403, `POST /chatwoot-webhook` 404, login admin tạm 200 + token exists, `/api/settings/webhook` 200 với secret mask/null, `/api/prompts` 200, `/api/channel-configs` 200, `/api/quick-reply-menus` 200, optional `/api/analytics?days=7` 200.
- Auth smoke dùng admin tạm trong DB local và cleanup xong, leftover = 0; không in username/password/token/secret.

Vẫn **không claim Meta Developer connected/verified** và **không claim production ready**. Phase 21 vẫn **Started**, chưa Done. Runtime local đã đủ điều kiện để chạy Prompt 21B-3 theo phạm vi read-only/low-risk (`campaigns` hoặc `stats`) nếu không đụng webhook/RAG/handoff/tenants/settings-external.

## Cập nhật mới nhất - Prompt 21S Project goals + Facebook webhook readiness status sync

Ngày cập nhật: 2026-07-12

Trạng thái mới nhất: **PASS WITH WARNINGS**. Prompt 21S chỉ đồng bộ docs/status và kiểm tra an toàn cục bộ, **không sửa source runtime**, không sửa schema/migration/package, không gọi Facebook/Telegram/Gemini/Jina/LLM thật.

Mục tiêu dự án hiện tại được ghi lại rõ:

- Product goal: chatbot/automation nhận tin nhắn Facebook Messenger qua webhook, backend Express custom xử lý bot/AI/RAG/handoff, dashboard Next.js quản trị nội bộ, PostgreSQL/pgvector lưu dữ liệu và knowledge.
- Architecture goal: target là **No-Chatwoot**. Meta/Facebook callback thật là `GET/POST /webhook`; `/api/settings/webhook` chỉ là endpoint dashboard đọc trạng thái cấu hình đã mask.
- Security/runtime goal: auth/login đã harden, nhiều tenant guard đã xử lý, raw SQL unsafe đã đóng, env/secret thật không được commit hoặc log.
- Deploy goal: local/staging readiness đã cải thiện, nhưng **chưa production rollout thật** vì chưa có backup + `prisma migrate deploy` + smoke production thật.
- Facebook Developer webhook goal: source route readiness có bằng chứng trong code; Meta Developer verification và Meta POST event thật vẫn **pending** nếu chưa có callback/challenge/test event từ Meta.

Facebook Developer Webhook readiness hiện tại:

| Tầng readiness | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Source route readiness | **DONE** | `backend/src/index.js` mount `GET /webhook`, `POST /webhook`; `backend/src/webhook/handler.js` verify token/challenge và xử lý `body.object === 'page'` | Có thể claim source route đúng endpoint. |
| Local runtime readiness | **LOCAL_READY, current smoke blocked** | Các report trước smoke `/webhook` sai/thiếu token -> 403 và `/chatwoot-webhook` -> 404; Prompt 21S hiện tại không smoke được do Docker daemon/DB/backend local không chạy | Không fake PASS runtime mới. |
| Dashboard management readiness | **LOCAL_READY** | `GET /api/settings/webhook` có auth, trả secret mask/null và `webhookUrl`, không phải Meta callback | Có thể dùng để xem cấu hình, không dùng làm callback URL. |
| Public HTTPS/staging readiness | **STAGING_PENDING** | Docs deploy yêu cầu `https://<domain>/webhook`; chưa có public HTTPS smoke trong Prompt 21S | Chỉ được ghi ready for staging verification khi có URL thật. |
| Meta Developer verification | **META_PENDING** | Chưa có bằng chứng callback/challenge thật từ Meta Developer trong docs/report hiện tại | Không claim Meta connected/verified. |
| Meta POST event readiness | **META_PENDING** | Chưa có event thật từ Meta; Prompt 21S không gọi external Facebook | Không claim nhận production event. |
| Production rollout | **PRODUCTION_PENDING** | `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` yêu cầu backup + migrate deploy + smoke prod; chưa chạy | Không ghi production ready. |

Validation Prompt 21S:

- Preflight git/secret-safety PASS: branch `chore/prompt-05r-docs-local-run`, HEAD `72f8a04 Consolidate another low-risk dashboard route`, `.env`/`.env.local`/`.next` ignored; chỉ `backend/.env.example` là env sample tracked.
- Baseline docs-only PASS: `backend npm run quality`, `npx prisma validate`, `dashboard npm run typecheck`, `git diff --check` trước patch.
- Local safe smoke **blocked by local runtime**: Docker daemon không phản hồi, port DB `5433` không listen, backend port `3001` không listen, `/health` không kết nối. Không chạy `docker compose up`, không chạy `start-all.bat`, không gọi external.

Phase 21 vẫn **Started**, chưa Done. Next prompt phù hợp: **21B-3** nếu tiếp tục giảm nợ backend route read-only (`campaigns`/`stats`), hoặc **21D** nếu muốn dọn docs/legacy trước, hoặc **21C** nếu quay lại dashboard `content-packages` với action migrate/external bị khóa rõ.

## Cập nhật mới nhất - Prompt 21B-2 Backend route consolidation (channel-configs read)

Ngày cập nhật: 2026-07-11

Trạng thái mới nhất: **PASS**. Tách 2 route read-only/low-risk `GET /api/channel-configs` (list) và `GET /api/channel-configs/:id` (detail) từ `backend/src/api/dashboard.js` sang `presentation/http/**` theo pattern `prompts`/`settings`/`quick-reply-menus`:

- Tạo `backend/src/infrastructure/repositories/channelConfigs.repository.js` (`findManyForScope`, `findByIdForScope` — giữ nguyên dual-model tenant/global + tenant mismatch → 404).
- Tạo `channelConfigs.controller.js` + `channelConfigs.routes.js`.
- `dashboard.js` mount `router.use('/channel-configs', ...)` đúng vị trí cũ; POST/PUT/DELETE giữ nguyên (fall-through hoạt động).

Candidate được soi 3 nhóm (A channel-configs / B campaigns / C stats); chọn A vì read-only, **không secret** (schema ChannelConfig/TenantChannelConfig không có token), không external/mutation/raw SQL. Giữ nguyên public path/method/auth (`authMiddleware`+`getTenantScope`)/response shape.

Validation:

- Backend `npm run quality` + `npx prisma validate` PASS; `node --check` toàn bộ file mới + `dashboard.js`/`index.js` PASS.
- Runtime smoke PASS (backend 3001, DB `bbotech-pgvector-local`): regression health/prompts/handoff/telegram-destinations/analytics/quick-reply 200, webhook 403, chatwoot-webhook 404; route tách: no-token 401, list token 200 (mảng, secretFields=NONE), detail id ảo 404; POST fall-through 400 không mutation. Không gọi external thật; backend tự start đã dừng sạch.

Phase 21 vẫn **Started** (consolidation từng bước); **chưa Done**. Chi tiết: `report/PROMPT_21B_2_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`.

## Cập nhật mới nhất - Prompt 21B Backend route consolidation (quick-reply-menus read)

Ngày cập nhật: 2026-07-11

Trạng thái mới nhất: **PASS**. Tách 2 route read-only/low-risk `GET /api/quick-reply-menus` (list) và `GET /api/quick-reply-menus/:id` (detail) từ `backend/src/api/dashboard.js` sang `presentation/http/**` theo đúng pattern `prompts`/`settings`:

- Tạo `backend/src/infrastructure/repositories/quickReplyMenus.repository.js` (`findManyForScope`, `findByIdForScope` — giữ nguyên where/orderBy/tenant scope).
- Tạo `backend/src/presentation/http/controllers/dashboard/quickReplyMenus.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/quickReplyMenus.routes.js`.
- `dashboard.js` mount `router.use('/quick-reply-menus', ...)` đúng vị trí cũ; POST/PUT/DELETE giữ nguyên bên dưới (fall-through hoạt động).

Giữ nguyên public path/method/auth (`authMiddleware` + `getTenantScope`)/response shape. Không sửa dashboard source, schema/migrations, package, Docker/scripts.

Validation:

- Backend `npm run quality` + `npx prisma validate` PASS; `node --check` toàn bộ file mới + `dashboard.js`/`index.js` PASS.
- Runtime smoke PASS (backend port 3001 local, DB `bbotech-pgvector-local`): regression health/prompts/handoff/telegram-destinations/analytics 200, webhook 403, chatwoot-webhook 404; route đã tách: no-token 401, list token 200 (mảng), detail id không tồn tại 404; POST empty body 400 (fall-through, không mutation). Không gọi external service thật; backend tự start đã dừng sạch sau smoke.

Phase 21 vẫn **Started — audit/plan-only chuyển sang consolidation từng bước**; **chưa Done**. Chi tiết: `report/PROMPT_21B_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`.

## Cập nhật mới nhất - Prompt 21A Project structure consolidation audit/plan

Ngày cập nhật: 2026-07-11

Trạng thái mới nhất: **PASS (audit/plan-only)**. Prompt 21A rà soát toàn bộ cấu trúc dự án sau nhiều phase và lập kế hoạch consolidation, **không move code**, không rename folder, không đổi import, không đổi behavior, không sửa backend/dashboard source runtime, không đụng package/schema/migrations.

Kết quả chính:

- Baseline validation read-only PASS: backend `npm run quality` + `npx prisma validate`; dashboard `npm run typecheck` + `npm run build` (19 route). `git diff --check` sạch, không có source/runtime diff.
- Backend: `api/dashboard.js` vẫn là monolith **2363 LOC / 96 route**; mới rút ~5 route sang `presentation/http/**` (prompts, settings); `domain`/`application` là shell README rỗng; 3 dir legacy rỗng (`src/chatwoot`, `src/adapters`, `integrations/chatwoot`); raw SQL unsafe = 0; Chatwoot runtime trong `src` = 0.
- Dashboard: 4/13 page đã thành orchestrator mỏng (`analytics/prompts/staff/appointments`); các feature còn lại là placeholder README; `settings/page.tsx` còn 6 `fetch()` trực tiếp (webhook/facebook) → chưa tách trước khi chuẩn hóa client.
- Active risks: `start-all.bat` còn bootstrap Chatwoot (local-only); `MULTITENANT_PROGRESS.md`/`ROADMAP.md` mô tả file Chatwoot đã gỡ (stale); settings direct fetch; `api/dashboard.js` nợ cấu trúc.
- Tạo mới `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` (map backend/dashboard/docs + đề xuất Phase 21B/21C/21D).

Phase 21 chuyển từ **Planned** sang **Started — audit/plan-only** (chưa move code, chưa restructure thật, chưa Done). Production rollout thật **CHƯA chạy** — chỉ ghi nhận local/staging readiness improved. Chi tiết: `report/PROMPT_21A_PROJECT_STRUCTURE_CONSOLIDATION_AUDIT_REPORT.md`.

## Cập nhật mới nhất - Prompt 19D Dashboard appointments feature split

Ngày cập nhật: 2026-07-11

Trạng thái mới nhất: **PASS WITH WARNINGS**. Đã tách `dashboard/src/app/dashboard/appointments/page.tsx` thành orchestrator mỏng dùng `dashboard/src/features/appointments/**`: hook `useAppointments`, components header/filter/loading/empty/list/card/status-badge/pagination, formatter/type/barrel. Giữ nguyên route `/dashboard/appointments`, UI text/layout/className, API `appointmentsApi.list/update`, filter status, pagination và hành vi nút xác nhận/hủy.

Validation đã hoàn tất:

- Local DB/backend readiness PASS: `bbotech-pgvector-local` chạy ở port `5433`, backend health 200, `npm run quality` PASS, `prisma migrate deploy` PASS/no pending, **không gặp P1001**.
- Backend smoke trước refactor PASS 7/7.
- Dashboard baseline trước refactor PASS: `npm run quality`, `npm run typecheck`, `npm run build`, clean `.next`, fresh route smoke port `3019`.
- Dashboard sau refactor PASS: `npm run quality`, `npm run typecheck`, `npm run build`, clean `.next`, fresh route smoke `/dashboard/appointments` và các route trọng yếu không 500/chunk error.
- Appointments read smoke PASS: `GET /api/appointments?page=1&limit=20` trả 200 với token test. Mutation status update **NOT RUN BY DESIGN** vì backend `PUT /appointments/:id` có thể gọi `notifications/appointments` khi đổi `status` hoặc `notes`.

Không thay đổi backend source, package, Prisma schema/migrations, env thật, Docker/script hoặc dashboard page khác. Phase 19 vẫn **Started**; Phase 21 vẫn **Planned** và chưa bắt đầu trong Prompt 19D.

## Cập nhật mới nhất - Prompt 19C Dashboard staff feature split

Ngày cập nhật: 2026-07-11

Trạng thái mới nhất: **PASS**. Đã tách `dashboard/src/app/dashboard/staff/page.tsx` thành orchestrator mỏng dùng `dashboard/src/features/staff/**`: hook `useStaff`, components header/guide/form/loading/empty/list, formatter/type/barrel. Giữ nguyên route `/dashboard/staff`, UI text/layout/className, API `staffApi.list/create/update/delete`, toast, confirm delete, form payload và toggle active/on-duty.

Validation đã hoàn tất:

- Local DB/backend readiness PASS: `bbotech-pgvector-local` chạy ở port `5433`, backend health 200, `npm run quality` PASS, `prisma migrate deploy` PASS/no pending, **không gặp P1001**.
- Backend smoke trước refactor PASS 7/7.
- Dashboard baseline trước refactor PASS: `npm run quality`, `npm run typecheck`, `npm run build`, clean `.next`, fresh route smoke port `3019`.
- Dashboard sau refactor PASS: `npm run quality`, `npm run typecheck`, `npm run build`, clean `.next`, fresh route smoke `/dashboard/staff` và các route trọng yếu không 500/chunk error.
- Staff mutation smoke PASS 13/13: list/create/update/toggle on-duty/toggle active/delete bằng prefix `Prompt 19C Test Staff`, cleanup leftover = 0; không gọi external.

Không thay đổi backend source, package, Prisma schema/migrations, env thật, Docker/script hoặc dashboard page khác. Prompt 19D nên chọn `appointments/page.tsx` với mutation checklist riêng, hoặc `content-packages/page.tsx` chỉ khi khóa rõ action migrate/external.

## Cập nhật mới nhất - Prompt 19B Dashboard prompts feature split

Ngày cập nhật: 2026-07-11

Trạng thái mới nhất: **PASS**. Đã tách `dashboard/src/app/dashboard/prompts/page.tsx` từ page client lớn thành orchestrator mỏng dùng `dashboard/src/features/prompts/**`: hook `usePrompts`, components header/tabs/form/loading/empty/list, formatter/type/barrel. Giữ nguyên UI text/layout/className, route `/dashboard/prompts`, API `promptsApi.list/create/update/delete`, toast, confirm delete, form payload và tenant reload theo `selectedTenantId`.

Validation đã hoàn tất:

- Backend DB readiness: container `bbotech-pgvector-local` đang chạy ở local port `5433`; `GET /health` backend port `3001` trả 200; `npx prisma migrate deploy` không có pending migration; **không gặp P1001**.
- Backend preflight: `cd backend && npm run quality` PASS.
- Backend smoke trước và sau refactor: PASS 7/7 gồm health, login token tạm, `/api/prompts`, `/api/settings/handoff`, `/api/analytics?days=7`, `/webhook` 403, `/chatwoot-webhook` 404; admin test prefix `prompt19b_` đã dọn.
- Dashboard baseline trước refactor: `npm run quality`, `npm run typecheck`, `npm run build` PASS.
- Dashboard sau refactor: `npm run quality`, `npm run typecheck`, `npm run build` PASS.
- Fresh dev route smoke sau clean `.next` và start dev server port `3019`: `/`, `/login`, `/dashboard`, `/dashboard/prompts`, `/dashboard/analytics`, `/dashboard/knowledge`, `/dashboard/settings`, `/dashboard/tenants`, `/dashboard/handoff`, `/dashboard/content-packages`, route 404 giả đều không có 500/chunk error.

Không thay đổi backend source, package, Prisma schema/migrations, env thật, `.next`, backup hoặc temp artifact. Prompt 19C nên ưu tiên `staff/page.tsx` hoặc một page write nhẹ có smoke/rollback rõ; tiếp tục tránh `settings`, `knowledge`, `tenants` cho tới khi có prompt riêng cho mutation/external rollback.

Ngày cập nhật: 2026-07-10
Trạng thái hiện tại: **Prompt 19A đã tách `dashboard/src/app/dashboard/analytics/page.tsx` (374→54 dòng, orchestrator mỏng) sang `dashboard/src/features/analytics/**` (hook `useAnalytics` + 9 components + formatters + types + barrel). Giữ nguyên UI/text/layout/className và API `analyticsApi.get` read-only; không đổi backend/API/dependency. Dashboard `npm run quality` (typecheck + build 19 routes) PASS. Production rollout thật CHƯA chạy.**
Lưu ý bắt buộc: từ Prompt 08A trở đi, Chatwoot không còn là thành phần của kiến trúc đích. Không sinh thêm route/controller/service/model/env mới có từ khóa Chatwoot/CHATWOOT/chatwoot. Prompt 08B đã xóa backend runtime Chatwoot; Prompt 08C đã xóa Chatwoot env khỏi env example/config warning và tạo schema/env cleanup plan. Prisma schema/migrations, dashboard frontend/API client, package và DevOps vẫn để các prompt sau xử lý theo phase riêng. Historical reports có thể vẫn giữ chữ Chatwoot để bảo toàn bằng chứng quá khứ.

## 1. Nguyên tắc cập nhật

- Sau mỗi prompt hoàn thành, phải tick checklist tương ứng trong file này và tạo report riêng trong `report/`.
- Không tick hạng mục runtime nếu chỉ mới có syntax/type/build validation.
- Nếu một phần chỉ là architecture shell/static validation, phải ghi rõ “Static validation pass — chưa runtime verified”.
- Không gom nhiều refactor rủi ro vào một prompt.
- Không sửa webhook, tenant handoff, RAG, Prisma schema/migrations hoặc DevOps script nếu prompt không cho phép rõ.
- Không đọc `.env` thật; chỉ dùng `.env.example` để mapping tên biến.
- Khi có commit mới, ghi hash vào lịch sử prompt và validation history.

## 2. Tổng quan trạng thái

| Phase | Trạng thái | Ghi chú |
|---|---|---|
| Phase 01 — Project audit | ✅ Done | Prompt 01 — read-only audit, không sửa source |
| Phase 02 — Safety gate | ✅ Done | Prompt 02 blocked đúng guardrail; Prompt 02B đã tạo Git checkpoint |
| Phase 03 — Progress/checklist foundation | ✅ Done | Prompt 02A tạo progress/checklist/report |
| Phase 04 — Baseline validation | ✅ Done with warnings | `npm ci`, backend syntax, Prisma validate dummy, dashboard typecheck/build pass; còn quality/security warnings |
| Phase 05 — Architecture shell | ✅ Done with warnings | Prompt 03, static validation pass — chưa runtime verified |
| Phase 06 — Config hardening/env policy | ✅ Done with warnings | Prompt 04, validation pass — chưa runtime verified |
| Phase 07 — Backend API route/controller split | ✅ Done with warnings | Prompt 05 tách nhóm route đầu tiên; static validation pass — chưa runtime verified |
| Phase 08 — Backend API route/controller split tiếp theo | ✅ Done with warnings | Prompt 05B tách `GET /settings/telegram-destinations`; static validation pass — chưa runtime verified |
| Phase 09 — Backend API route/controller split tiếp theo | ✅ Done with warnings | Prompt 05C tách `GET /prompts`; static validation pass — chưa runtime verified |
| Phase 10 — Runtime smoke test route đã tách | ✅ Done | Prompt 05R-ENV: runtime smoke test PASS cho 3 route trên DB local/test tạm (env + Docker Postgres dùng một lần, đã dọn) |
| Phase 10b — Settings route split tiếp | ✅ Done with warnings | Prompt 05D tách `GET /settings/handoff` (behavior giữ nguyên); phát hiện bug pre-existing accessor cần Prompt 05D-FIX |
| Phase 10c — Handoff settings accessor fix | ✅ Done | Prompt 05D-FIX sửa accessor + Prisma payload schema compatibility; `GET/PUT /settings/handoff` runtime PASS |
| Phase 10d — PUT handoff settings route split | ✅ Done | Prompt 05E tách `PUT /settings/handoff` sang settings controller/routes; runtime GET/PUT PASS |
| Phase 11 — Repository layer | ✅ Started | Prompt 06 tạo `handoffSettingsRepository`; Prompt 06B tạo `telegramDestinationsRepository`; Prompt 06C tạo `promptTemplatesRepository`; runtime settings/prompts smoke PASS |
| Phase 12 — Tenant safety audit | ✅ Done — NEEDS FIX logged | Prompt 07 audit xong; P0/P1 tenant authorization gaps đã được phân loại |
| Phase 13 — Tenant authorization hardening P0 | ✅ Done | Prompt 07A thêm `tenantPathAccessOnly` cho `/api/tenants/:id/*`; runtime denied smoke PASS |
| Phase 14 — Tenant authorization hardening P1 conversations | ✅ Done | Prompt 07B tenant-scope `/api/conversations`, detail, messages; cross-tenant smoke PASS |
| Phase 15 — Tenant authorization hardening P1 detail resources | ✅ Done | Prompt 07C harden knowledge/prompts/quick-reply/content-package/package-items/appointments; runtime smoke PASS |
| Phase 16 — Legacy/global route classification | ✅ Done with warnings | Prompt 07D classify và patch platform-only routes; còn follow-up tenant handoff/RAG upload-scrape |
| Phase 17A — No-Chatwoot architecture intake/audit | ✅ Done with warnings | Prompt 08A; renumbering after new architecture directive |
| Phase 17B — Backend Chatwoot runtime removal | ✅ Done with warnings | Prompt 08B xóa route `/chatwoot-webhook*`, Chatwoot client/adapter/webhook handler, bỏ handoff sync Chatwoot; runtime smoke PASS 16/16 |
| Phase 17C — Prisma/env No-Chatwoot cleanup plan | ✅ Done with warnings | Prompt 08C cleanup env example/config policy, tạo `NO_CHATWOOT_SCHEMA_ENV_CLEANUP_PLAN`; schema/migrations chưa sửa |
| Phase 17D — Dashboard No-Chatwoot cleanup | ✅ Done | Prompt 08D dashboard cleanup + backend tenant create bridge |
| Phase 17E — Tenant contract runtime smoke + stop-write | ✅ Done | Prompt 08E: payload tenant mới runtime 17/17 PASS, backend stop-write legacy |
| Phase 17F — No-Chatwoot schema migration removal | ✅ Done | Prompt 08F drop 6 cột `tenants` + `conversations.chatwoot_conversation_id` + index legacy trên DB local/test; backup trước migration; runtime smoke 13/13 PASS |
| Phase 17G — Login auth production readiness | ✅ Done | Prompt 08G fix login (hash admin stale), bỏ credential mẫu UI, thêm production auth guard; runtime login smoke 11/11 PASS |
| Phase 18 — RAG/raw SQL hardening | ✅ Done | Prompt 09 RAG raw SQL PASS; Prompt 09B analytics raw SQL PASS; Prompt 09C tenant handoff raw SQL PASS; Prompt 10A seed raw SQL cleanup PASS WITH WARNINGS. `backend/src`+`backend/scripts` không còn `$queryRawUnsafe`/`$executeRawUnsafe`; chỉ còn README documentation-only |
| Phase 18b — Quality gate | ✅ Done | Prompt 10C: `npm run quality` backend (syntax+prisma validate) + dashboard (typecheck+build) PASS; ESLint chưa cài (lint để prompt dependency riêng); production smoke dry-run local 9/9. `docs/QUALITY_GATE.md` |
| Phase 19 — Dashboard feature split | ✅ Started | Prompt 19A analytics, 19B prompts, 19C staff, 19D appointments đã tách sang `features/**`; UI/API giữ nguyên, route smoke thật PASS. Appointments mutation status NOT RUN BY DESIGN do notification risk |
| Phase 20 — DevOps/deploy hardening | ✅ Done | Prompt 10B: bỏ `db push --accept-data-loss` khỏi `start-all.bat`; tách migration khỏi Docker startup; drift `knowledge_base.embedding` fix (migration nullable); deploy docs. Production rollout thật chưa chạy |
| Phase 21 — Project structure consolidation | 🟡 Started | 21A audit + `PROJECT_STRUCTURE_CONSOLIDATION_PLAN`; 21B tách `GET /quick-reply-menus`; 21B-2 tách `GET /channel-configs` list+detail (runtime smoke PASS). Chưa Done |

## 3. Checklist chi tiết theo Prompt

### Prompt 08G — Login auth production readiness fix

- [x] Chẩn đoán login fail: hash mật khẩu admin trong DB local stale, không khớp `ADMIN_PASSWORD` hiện tại lẫn `admin123` (seed cũ chỉ tạo khi `adminCount===0`, không cập nhật khi env đổi).
- [x] Login UI: bỏ dòng "Mặc định: admin / admin123", đổi placeholder username sang trung tính, thêm câu hướng dẫn "Vui lòng dùng tài khoản quản trị đã được cấp."
- [x] Frontend `auth.tsx`: gỡ standalone fallback bypass (`admin/admin123` + fake token) — nguồn gây "đăng nhập rồi bị văng".
- [x] Backend `index.js`: self-heal hash admin ở dev khi `ADMIN_PASSWORD` đổi; production guard `assertProductionAuthEnv()` fail-fast khi `JWT_SECRET`/`ADMIN_PASSWORD` yếu/thiếu; seed không rơi về `admin123` trong production.
- [x] Static validation PASS: backend `node --check`, `prisma validate`, dashboard `tsc --noEmit`, `npm run build`.
- [x] Runtime login smoke 11/11 PASS: health, login đúng 200+token, login sai 401, token → prompts/handoff/telegram 200, webhook 403, legacy Chatwoot 404.
- [x] Không sửa Prisma schema/migrations, RAG, webhook direct Facebook, package files.

### Prompt 08F — No-Chatwoot schema migration removal

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, working tree sạch, `.env`/`.env.local` gitignored, không env tracked; commit 08E `a5d5dc5` tồn tại.
- [x] Backup DB local/test trước migration: `backups/prompt-08f-before-schema-drop-<timestamp>.dump` (pg_dump custom-format, size > 0, **không commit**, `backups/` đã ignored).
- [x] Legacy field scan: backend/src runtime + dashboard/src 0 phụ thuộc cột legacy (chỉ còn 3 README kiến trúc là docs); gỡ runtime write `chatwootModel/chatwootAccountId` trong `POST /api/tenants` + strip trong `maskTenant`.
- [x] Schema patch: xóa `tenants.chatwootModel/AccountId/BaseUrl/ApiTokenEnc/TeamId/webhookSecretEnc` + `conversations.chatwootConversationId`.
- [x] Migration `--create-only`: `20260710025758_remove_no_chatwoot_legacy_columns`. Auto-SQL rộng hơn dự kiến (drift có sẵn + chạm `knowledge_base.embedding`) nên thay body bằng SQL drop legacy tối thiểu, đã review.
- [x] Apply local/test bằng `prisma migrate deploy` (không `db push`, không `--accept-data-loss`, không reset); `prisma generate` + `validate` PASS; DB còn 0 cột/index legacy.
- [x] Post-migration static validation PASS: backend `node --check`, `prisma validate`, dashboard `tsc --noEmit`, `npm run build`.
- [x] Runtime smoke sau migration: 13/13 PASS (webhook 403, các route 404 legacy, prompts/settings 200, tenant create 201/update 200 không lộ field legacy, cleanup leftover = 0).
- [x] Production rollout: cần backup + `migrate deploy` riêng, ngoài phạm vi prompt này.

### Prompt 08C — Prisma/env No-Chatwoot cleanup plan

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, working tree sạch trước patch, `.env`/`.env.local` gitignored, không có env tracked/staged.
- [x] Xác nhận commit Prompt 08B `95b6eeb6b9dd082fae547cde7e77119be2f39daa` tồn tại.
- [x] Baseline validation trước patch PASS: backend `node --check`, `npx prisma validate`, dashboard `npx --no-install tsc --noEmit`.
- [x] Scan Prisma/env/config/dashboard/docs/scripts references liên quan Chatwoot, bỏ qua dependency/build artifacts.
- [x] Cleanup `backend/.env.example`: xóa block `CHATWOOT_*`, ghi rõ local pgvector host port `5433`.
- [x] Cleanup `dashboard/.env.example`: xóa `NEXT_PUBLIC_CHATWOOT_URL`.
- [x] Cleanup `backend/src/infrastructure/services/config.js`: xóa warning placeholder `CHATWOOT_API_TOKEN`, `CHATWOOT_WEBHOOK_SECRET`.
- [x] Cập nhật `docs/ENV_POLICY.md` sang No-Chatwoot target env policy.
- [x] Tạo `docs/NO_CHATWOOT_SCHEMA_ENV_CLEANUP_PLAN.md`.
- [x] Không sửa `backend/prisma/schema.prisma`, không sửa migrations, không tạo migration mới, không chạy `db push`.
- [x] Không sửa dashboard source, RAG/raw SQL, webhook direct Facebook, tenant handoff, bot engine/tools, package, Dockerfile hoặc scripts.
- [x] Static validation sau patch PASS: backend `node --check`, `npx prisma validate`, dashboard `tsc --noEmit`, `git diff --check`.
- [x] Runtime smoke: NOT REQUIRED — cleanup env example/config policy/docs only, không đổi runtime route/handler.
- [x] Tạo report Prompt 08C: `report/PROMPT_08C_PRISMA_ENV_NO_CHATWOOT_CLEANUP_PLAN_REPORT.md`.

Trạng thái: **PASS WITH WARNINGS**.
Remaining blockers theo thiết kế: Prisma schema còn `Conversation.chatwootConversationId` và `Tenant.chatwoot*`; backend tenant CRUD và dashboard tenant/settings/channel-config source còn gửi/hiển thị field legacy; DevOps/scripts còn flow cũ. Next khuyến nghị: **Prompt 08D — Dashboard No-Chatwoot cleanup** trước khi prompt schema migration removal thật.

### Prompt 08B — Backend Chatwoot runtime removal

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, working tree sạch trước patch, `.env`/`.env.local` gitignored, không có env tracked/staged.
- [x] Xác nhận commit Prompt 08A `9851bd1` tồn tại.
- [x] Baseline static validation trước patch PASS cho backend entry/API/webhook/handoff/settings/prompts và `npx prisma validate`.
- [x] Xóa đăng ký route runtime `POST /chatwoot-webhook` và `POST /chatwoot-webhook/:slug` khỏi `backend/src/index.js`.
- [x] Giữ nguyên direct Facebook webhook `GET /webhook` và `POST /webhook`.
- [x] Xóa backend runtime files Chatwoot: owner webhook, tenant webhook, Chatwoot API client, Chatwoot crypto helper, Chatwoot adapter, integration README.
- [x] Bỏ dashboard backend route Chatwoot test và lookup inboxes: `/api/settings/chatwoot-test`, `/api/channel-configs/lookup-inboxes`.
- [x] Bỏ handoff sync qua Chatwoot trong `telegram/handoff.js` và `tenants/handoff.js`; owner outbound Facebook direct giữ theo `sendFBMessage`, tenant outbound direct được ghi rõ là chưa implemented thay vì fallback sang Chatwoot.
- [x] Thay helper mã hóa credential runtime bằng `backend/src/infrastructure/services/credentialCrypto.js` không mang tên Chatwoot.
- [x] Tenant registry không còn decrypt/cache `_decryptedApiToken` hoặc `_webhookSecret` phục vụ Chatwoot.
- [x] Static validation sau patch PASS: `node --check` các file backend trọng tâm, `credentialCrypto.js`, repository/controller routes đã tách; `npx prisma validate`.
- [x] Runtime smoke PASS 16/16: `/chatwoot-webhook*` 404, route test/lookup Chatwoot cũ 404, `/webhook` verify lỗi 403, prompts/settings/handoff và tenant guard regression PASS.
- [x] Không sửa Prisma schema/migrations, env examples/policy, dashboard frontend/API client, RAG/raw SQL, package, Dockerfile hoặc scripts.
- [x] Tạo report Prompt 08B: `report/PROMPT_08B_BACKEND_CHATWOOT_RUNTIME_REMOVAL_REPORT.md`.

Trạng thái: **PASS WITH WARNINGS**.
Remaining references hợp lệ trong phạm vi 08B: `backend/src/api/dashboard.js` còn field Prisma cũ `chatwoot*` vì schema/env cleanup để Prompt 08C; `backend/src/infrastructure/services/config.js` còn warning `CHATWOOT_*` để Prompt 08C; README placeholder dưới `backend/src/domain`/`backend/src/infrastructure` còn chữ Chatwoot để docs cleanup sau; dashboard frontend và DevOps scripts còn backlog Prompt 08D/10.
Next khuyến nghị: **Prompt 08C — Prisma/env No-Chatwoot cleanup plan** trước khi xóa field/data cũ; sau đó **Prompt 08D** dashboard No-Chatwoot cleanup, rồi **Prompt 09** RAG/raw SQL hardening.

### Prompt 08A — No-Chatwoot architecture directive intake & impact audit

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, working tree sạch trước sửa, không ở `master/main`, `.env`/`.env.local` gitignored, không có env tracked/staged.
- [x] Xác nhận commit Prompt 07D `b67cc1c` tồn tại.
- [x] Baseline nhẹ PASS: `node --check src/index.js`, `node --check src/db.js`, `node --check src/api/dashboard.js`, `npx prisma validate`, `npx --no-install tsc --noEmit`.
- [x] Scan Chatwoot toàn repo, bỏ qua dependency/build artifacts.
- [x] Phân loại reference Chatwoot theo backend runtime, schema/migration, env/config, dashboard UI/API, DevOps/scripts, docs current architecture và historical reports.
- [x] Tạo context kiến trúc mới: `docs/NO_CHATWOOT_DIRECT_ARCHITECTURE_CONTEXT.md`.
- [x] Tạo report Prompt 08A: `report/PROMPT_08A_NO_CHATWOOT_ARCHITECTURE_AUDIT_REPORT.md`.
- [x] Không sửa runtime source, Prisma schema/migrations, RAG/raw SQL, webhook logic, dashboard frontend, package hoặc DevOps scripts.

Trạng thái: **PASS WITH WARNINGS**.
Blocking references tại thời điểm Prompt 08A: backend runtime vẫn có `/chatwoot-webhook`, `/chatwoot-webhook/:slug`, `backend/src/chatwoot/*`, `chatwootAdapter`, tenant/Telegram handoff sync qua Chatwoot; Prisma schema/migrations còn field `chatwoot*`; env example/dashboard helper/dashboard pages còn Chatwoot UI/API; `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt` còn luồng Chatwoot. Sau Prompt 08B, nhóm backend runtime đã được xử lý; schema/env/dashboard/scripts vẫn là backlog. Historical reports giữ nguyên để làm bằng chứng quá khứ.
Next khuyến nghị: **Prompt 08B — backend Chatwoot runtime removal** trước RAG/raw SQL; sau đó **Prompt 08C** schema/env cleanup plan, **Prompt 08D** dashboard cleanup, rồi **Prompt 09** RAG/raw SQL hardening.

### Prompt 07D — Legacy/global route authorization classification

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, working tree sạch trước sửa, `.env`/`.env.local` gitignored, không có env tracked/staged.
- [x] Xác nhận commit Prompt 07C `7ad04f6` tồn tại.
- [x] Baseline static validation trước patch PASS.
- [x] Classify legacy/global groups: stats, providers, campaigns, global staff, Telegram destination write/test, handoff, Chatwoot test, Facebook pages/menu/subscription, test endpoint, analytics/raw SQL.
- [x] Thêm `platformAdminOnly` cho các route `PLATFORM_ONLY` rõ ràng trong `backend/src/api/dashboard.js`.
- [x] Không đổi route path/method/handler success response cho platform admin.
- [x] Không sửa RAG/raw SQL, schema/migrations, webhook, tenant handoff, bot, dashboard frontend, package/DevOps.
- [x] Static validation sau patch PASS: `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check`.
- [x] Runtime smoke PASS 79/79: no-token 401, tenant token 403 cho route patched, platform token không bị guard 403, regression prompts/settings/P0/07B/07C PASS.
- [x] Cleanup test data PASS: leftover `test_07d_*` = 0.
- [x] Tạo report Prompt 07D: `report/PROMPT_07D_LEGACY_GLOBAL_ROUTE_AUTH_CLASSIFICATION_REPORT.md`.

Trạng thái: **PASS WITH WARNINGS**.
Residual risk còn lại: `POST /knowledge/upload` và `POST /knowledge/scrape` vẫn cần Prompt 08/07E vì đi qua RAG side effect và chưa truyền tenantId; các tenant handoff routes mà frontend đã khai báo dưới `/tenants/:id/handoff/*` chưa có backend implementation; `settings.routes.js` còn các read/settings route global cần quyết định chính sách nếu muốn khóa platform-only toàn diện.
Commit: `Classify legacy global route authorization` (xem `git log -1` để lấy hash HEAD).
Next khuyến nghị: **Prompt 08 — RAG/raw SQL hardening** nếu ưu tiên raw SQL/RAG; hoặc **Prompt 07E — tenant handoff + remaining route follow-up** nếu muốn đóng nốt tenant handoff/upload-scrape authorization trước RAG.

### Prompt 07C — Detail resource tenant guard

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, `.env`/`.env.local` gitignored, không có env tracked/staged.
- [x] Xác nhận commit Prompt 07B `34496c61060561048e645e8dbea8b80894d95a5e` tồn tại.
- [x] Đọc context bắt buộc: report Prompt 07/07A/07B, docs progress/checklist/refactor/architecture/local guide, `dashboard.js`, `schema.prisma`.
- [x] Baseline static validation trước patch PASS.
- [x] Route map detail resource hoàn tất cho `knowledge`, `prompts`, `quick-reply-menus`, `content-packages`, `content-package-items`, `appointments`.
- [x] Schema ownership map xác nhận `KnowledgeBase`, `PromptTemplate`, `QuickReplyMenu`, `ContentPackage`, `Appointment` có `tenantId`; `ContentPackageItem` guard qua `ContentPackage.tenantId`.
- [x] Patch detail GET/update/delete: tenant-scoped request chỉ thấy resource thuộc tenant; cross-tenant trả `404`, không dùng `403` cho detail mismatch.
- [x] Patch package items: verify parent package tenant ownership trước khi list/create/update/delete item; tenant branch update/delete item ràng buộc thêm `packageId`.
- [x] Giữ platform behavior khi không có tenant scope; không tự thêm `tenantId: null` cho detail route cũ.
- [x] Không sửa schema/migrations/RAG/webhook/handoff/bot/dashboard frontend/package/DevOps.
- [x] Static validation sau patch PASS: `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check`.
- [x] Runtime smoke PASS 47/47 bằng Express app tạm mount `dashboardApi`: no-token 401, own tenant 200, cross tenant 404, platform không bị chặn, regression prompts/settings/handoff/P0/07B PASS.
- [x] Cleanup test data PASS: leftover `test_07c_*` bằng 0 cho knowledge/prompts/quick/package/items/conversations/messages/appointments.
- [x] Tạo report Prompt 07C: `report/PROMPT_07C_DETAIL_RESOURCE_TENANT_GUARD_REPORT.md`.

Trạng thái: **PASS**.
Residual risk còn lại: legacy/global routes (`staff/handoff/analytics/facebook/global Chatwoot`) cần Prompt 07D nếu muốn phân loại quyền rõ hơn; RAG/raw SQL và schema mismatch `knowledge_base.embedding NOT NULL` để Prompt 08; Prompt 06D chỉ làm sau khi ownership/detail guard đã rõ.
Commit: `Harden detail resource tenant authorization` (xem `git log -1` để lấy hash HEAD).
Next khuyến nghị: **Prompt 08 — RAG/raw SQL hardening** nếu chấp nhận legacy/global routes để Prompt 07D riêng; hoặc **Prompt 07D — legacy/global route classification** nếu muốn đóng tiếp các route quyền chưa rõ trước RAG.

### Prompt 07B — Tenant authorization hardening P1 conversations

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, working tree sạch trước sửa, `.env`/`.env.local` gitignored, không có env tracked/staged.
- [x] Xác nhận commit Prompt 07A `706ef9249c14a289b7c118eeecaa5cabc6086dc0` tồn tại.
- [x] Đọc context bắt buộc: report Prompt 07A/07, progress/checklist/refactor/architecture/local guide, `dashboard.js`, `schema.prisma`.
- [x] Baseline static validation trước patch PASS.
- [x] Route map xác nhận `GET /conversations` chỉ filter `status`, `GET /conversations/:id` lookup bằng id qua `contextManager`, `GET /conversations/:id/messages` query message trực tiếp theo `conversationId`.
- [x] Xác nhận `Conversation` có `tenantId`, `Message` không có `tenantId`.
- [x] Patch list conversations: khi có `tenantId = getTenantScope(req)` thì thêm `where.tenantId`.
- [x] Patch detail conversation: tenant-scoped request phải có conversation `{ id, tenantId }` trước khi trả summary; nếu không có trả `404`.
- [x] Patch messages: tenant-scoped request phải có conversation `{ id, tenantId }` trước khi query messages; nếu không có trả `404`.
- [x] Không đổi platform behavior khi không có tenant scope.
- [x] Static validation sau patch PASS: `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check`.
- [x] Runtime smoke cross-tenant PASS với sample local: tenant A thấy A, không thấy B; detail/messages B trả `404`; platform xem được A/B.
- [x] Cleanup test data PASS: xóa 2 messages và 2 conversations tạo bởi smoke.
- [x] Tạo report Prompt 07B: `report/PROMPT_07B_CONVERSATION_TENANT_GUARD_REPORT.md`.

Trạng thái: **PASS**.
Residual risk còn lại: **P1 detail resource routes** (`knowledge/prompts/quick-reply/content-package/package-items/appointments`) và legacy/global routes vẫn cần Prompt 07C; RAG raw SQL để Prompt 08.
Commit: `Harden conversation tenant authorization` (xem `git log -1` để lấy hash HEAD).
Next bắt buộc: **Prompt 07C — detail resource tenant guard** trước Prompt 06D prompt detail/write.

### Prompt 07A — Tenant authorization hardening P0

- [x] Preflight Git/env: branch `chore/prompt-05r-docs-local-run`, working tree sạch trước sửa, `.env`/`.env.local` gitignored, không có env tracked/staged.
- [x] Xác nhận commit Prompt 07 `5ec08c7e32c3173ac0fdc0c276fdf90d1835cef6` tồn tại.
- [x] Đọc context bắt buộc: report Prompt 07, progress/checklist/refactor/architecture/local guide, `dashboard.js`, `schema.prisma`.
- [x] Baseline static validation trước patch PASS.
- [x] Route map P0 xác nhận 12 route `/api/tenants/:id/*` chỉ có `authMiddleware`.
- [x] Thêm `tenantPathAccessOnly(req,res,next)` gần auth/role middleware.
- [x] Gắn `tenantPathAccessOnly` vào đúng 12 route P0 nested tenant.
- [x] Ràng buộc thêm `tenantId: req.params.id` cho `TenantStaff` update/delete và `TenantChannelConfig` delete để child id không bypass path tenant.
- [x] Không sửa P1/P2 conversation/detail/resource routes trong prompt này.
- [x] Static validation sau patch PASS: `node --check` các file backend trọng tâm và `npx prisma validate`.
- [x] Runtime smoke PASS bằng Express app tạm chỉ mount `dashboardApi`: no-token 401, tenant same-path 200, tenant other-path 403, platform path 200, prompts/settings/handoff regression 200.
- [x] Không start `src/index.js`, không kích hoạt Telegram/Facebook startup side effect, không in token/secret, không tạo tenant fake trong DB.
- [x] Tạo report Prompt 07A: `report/PROMPT_07A_TENANT_AUTHORIZATION_HARDENING_REPORT.md`.

Trạng thái: **PASS WITH FIXES**.
Residual risk còn lại: **P1** conversation/detail/messages và detail resource routes vẫn cần Prompt 07B; RAG raw SQL vẫn để Prompt 08.
Commit: `Harden tenant path authorization` (xem `git log -1` để lấy hash HEAD).
Next bắt buộc: **Prompt 07B — tenant authorization hardening P1** hoặc nếu tạm chấp nhận P1 thì Prompt 08, nhưng không nên mở rộng route detail/write trước 07B.

### Prompt 07 — Tenant safety audit + local DB preflight

- [x] Preflight Git: working tree sạch trước khi sửa docs/report; commit Prompt 06C `5b3fae6` tồn tại.
- [x] Preflight secret/env: `.env` và `.env.local` vẫn bị gitignore; không commit env.
- [x] Local DB preflight: container `bbotech-pgvector-local` đang chạy, port `5433` listening, log PostgreSQL ready; không chạy `docker compose up`, không chạy `db push`.
- [x] Backend process: port `3001` đang có backend sẵn; dùng để smoke test, không stop vì prompt không khởi động process này.
- [x] Static validation backend: `node --check` PASS cho các file dashboard/settings/prompts/repository/tenant/webhook/RAG/bot trọng tâm.
- [x] Prisma validation: PASS khi chạy Prisma CLI local `5.22.0` từ thư mục `backend`; ghi chú `npx prisma` từ root dùng CLI `7.8.0` và không tương thích schema hiện tại.
- [x] Runtime smoke: no-token `/api/prompts` → 401; `/api/prompts` → 200 array len=7; `/api/prompts?layer=intent` → 200 array len=6; `/api/settings/telegram-destinations` → 200; handoff GET/PUT → 200.
- [x] Tenant scope audit: đọc `getTenantScope`, prompt repository, tenant registry/webhook, tenant handoff, owner webhook/chatwoot, bot context, RAG pipeline, dashboard route map.
- [x] Tạo report Prompt 07: `report/PROMPT_07_TENANT_SAFETY_AUDIT_REPORT.md`.
- [x] Không sửa source runtime, không sửa schema/migrations, không sửa webhook/RAG/handoff/bot/dashboard frontend/package/DevOps.

Trạng thái: **NEEDS FIX**.
P0/P1 chính:

- **P0:** các route nested `/api/tenants/:id/*` dùng `authMiddleware` nhưng chưa có `platformAdminOnly` hoặc ownership guard, trong khi đọc/ghi/xóa theo `req.params.id`.
- **P1:** các route conversations/detail/messages, knowledge/prompts/quick-reply/content-package detail và một số route legacy handoff/analytics còn thiếu tenant scope hoặc platform-only guard.
- **P2:** RAG còn `$queryRawUnsafe` ở add/update vector; owner Chatwoot webhook là global/legacy và cần được khóa rõ nếu không phục vụ tenant.

Commit: `Audit tenant scope safety` (xem `git log -1` để lấy hash HEAD sau amend).
Next bắt buộc: **Prompt 07A — tenant authorization hardening** trước Prompt 06D hoặc Prompt 08.

### Prompt 01 — Project audit + clean architecture mapping

- [x] Đọc tree dự án.
- [x] Audit backend.
- [x] Audit dashboard.
- [x] Audit Prisma/Docker/scripts.
- [x] Xác định rủi ro mixed architecture.
- [x] Tạo report Prompt 01: `report/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md`.
- [x] Không sửa source runtime.
- [x] Không đọc `.env` thật.

Trạng thái: **PASS**.
Commit: chưa có Git repository tại thời điểm Prompt 01.

### Prompt 02 — Controlled clean architecture reorganization

- [x] Preflight safety gate.
- [x] Phát hiện thiếu `.git`.
- [x] Dừng đúng guardrail.
- [x] Tạo report blocked: `report/PROMPT_02_BLOCKED_NEED_GIT_CHECKPOINT.md`.
- [x] Không sửa source runtime.
- [x] Không chạy dependency install, migration, Docker hoặc start script.

Trạng thái: **BLOCKED đúng quy trình**.
Commit: chưa có Git repository tại thời điểm Prompt 02.

### Prompt 02A — Project progress + audit checklist

- [x] Tạo `docs/PROJECT_PROGRESS.md`.
- [x] Tạo `docs/FEATURE_AUDIT_CHECKLIST.md`.
- [x] Tạo report Prompt 02A: `report/PROMPT_02A_PROJECT_PROGRESS_AND_AUDIT_PLAN_REPORT.md`.
- [x] Tổng hợp roadmap an toàn trước refactor.
- [x] Không sửa source runtime.

Trạng thái: **PASS WITH WARNINGS** vì dự án vẫn thiếu Git checkpoint/dependencies/baseline validation tại thời điểm đó.
Commit: chưa có Git repository tại thời điểm Prompt 02A.

### Prompt 02B — Safety foundation + baseline validation

- [x] `git init`.
- [x] Cập nhật `.gitignore` để bảo vệ `.env`, dependency, build artifact, logs, uploads.
- [x] Tạo Git checkpoint.
- [x] Commit baseline `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca`.
- [x] `backend npm ci`.
- [x] `dashboard npm ci`.
- [x] Backend syntax check pass.
- [x] Prisma validate pass với `DATABASE_URL` dummy.
- [x] Dashboard `tsc --noEmit` pass.
- [x] Dashboard build pass.
- [x] Ghi warnings còn lại vào report Prompt 02B.
- [x] Không sửa source runtime.

Trạng thái: **PASS WITH WARNINGS**.
Warnings chính: backend chưa có lint/typecheck thật, dashboard lint chưa cấu hình không tương tác, npm audit vulnerabilities còn mở, `$queryRawUnsafe`, default credential/fallback, hard-code localhost và DevOps script rủi ro còn tồn tại.

### Prompt 03 — Architecture shell refactor

- [x] Tạo backend shell `domain/application/infrastructure/presentation`.
- [x] Tạo README layer/folder chính.
- [x] Tạo backend Prisma wrapper.
- [x] Tạo backend config helper.
- [x] Tạo dashboard shell `features/components/lib/config/lib/api`.
- [x] Tạo dashboard env/API helper.
- [x] Gom một số hard-code dashboard về helper fallback.
- [x] Tạo `docs/ARCHITECTURE.md`.
- [x] Tạo `docs/REFACTOR_PLAN.md`.
- [x] Backend syntax validation pass.
- [x] Prisma validate dummy pass.
- [x] Dashboard typecheck pass.
- [x] Dashboard build pass.
- [x] Commit `24ac487d1b406f06650ca942efb311619e6a7c47`.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Không đổi Prisma schema, migrations, public route, webhook URL, tenant handoff, RAG pipeline hoặc bot engine.

### Prompt 04 — Config hardening + localhost cleanup + env policy

- [x] Mở rộng backend config helper.
- [x] Chuẩn hóa dashboard env helper.
- [x] Gom Chatwoot/settings/Telegram dashboard URL về helper.
- [x] Tạo `docs/ENV_POLICY.md`.
- [x] Cập nhật `backend/.env.example`.
- [x] Tạo `dashboard/.env.example`.
- [x] Cập nhật `docs/ARCHITECTURE.md`.
- [x] Cập nhật `docs/REFACTOR_PLAN.md`.
- [x] Cập nhật `docs/FEATURE_AUDIT_CHECKLIST.md`.
- [x] Tạo report Prompt 04: `report/PROMPT_04_CONFIG_HARDENING_LOCALHOST_ENV_POLICY_REPORT.md`.
- [x] Backend validation pass.
- [x] Dashboard validation pass.
- [x] Commit `25f3bb79e419590fb14540a82f28efe6482d980f`.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. DevOps scripts, Dockerfile và stale webhook URL file chỉ được scan read-only, chưa sửa.

### Prompt 04A — Rewrite project progress + checklist before Prompt 05

- [x] Preflight Git.
- [x] Xác nhận commit Prompt 04 `25f3bb79e419590fb14540a82f28efe6482d980f`.
- [x] Đọc toàn bộ report/docs bắt buộc.
- [x] Rewrite `docs/PROJECT_PROGRESS.md`.
- [x] Cập nhật `docs/FEATURE_AUDIT_CHECKLIST.md`.
- [x] Tạo report `report/PROMPT_04A_PROJECT_PROGRESS_REWRITE_REPORT.md`.
- [x] Chỉ sửa docs/report.
- [ ] Runtime verification — không thuộc phạm vi Prompt 04A.

Trạng thái: **PASS — ready for Prompt 05 backend route split** nếu validation docs-only và commit pass.

### Prompt 05 — Backend API route/controller split

- [x] Preflight Git.
- [x] Xác nhận working tree không có source runtime change không rõ nguồn.
- [x] Route map trước khi tách bằng scan `router.get/post/put/delete`.
- [x] Chọn domain nhỏ ít rủi ro: `GET /settings/webhook`.
- [x] Tạo route/controller wrapper.
- [x] Giữ public route/response contract.
- [x] Không sửa webhook, tenant handoff, RAG, Prisma schema/migrations.
- [x] Backend syntax validation sau refactor.
- [x] Prisma validate dummy.
- [x] Không sửa dashboard frontend.
- [x] Tạo report Prompt 05.
- [x] Commit Prompt 05 nếu pass.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Public route `/api/settings/webhook`, method, auth middleware và response shape không đổi.

### Prompt 05B — Backend API route/controller split phase 2

- [x] Preflight Git.
- [x] Xác nhận commit Prompt 05 `c860ca416a3439dfc7b72bc1e9d9f5ab3cba5af0`.
- [x] Đọc docs/report bắt buộc và module settings từ Prompt 05.
- [x] Baseline validation trước thay đổi pass.
- [x] Route map update trước khi tách.
- [x] Chọn route nhỏ ít rủi ro: `GET /settings/telegram-destinations`.
- [x] Mở rộng controller/routes settings đã có.
- [x] Truyền `prisma` qua `createSettingsRoutes`.
- [x] Gỡ block GET tương ứng khỏi `backend/src/api/dashboard.js`.
- [x] Giữ public route/response contract.
- [x] Không sửa webhook, tenant handoff, RAG, Prisma schema/migrations.
- [x] Backend syntax validation sau refactor.
- [x] Prisma validate dummy.
- [x] Không sửa dashboard frontend.
- [x] Tạo report Prompt 05B.
- [x] Commit Prompt 05B nếu pass.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Public route `/api/settings/telegram-destinations`, method, auth middleware, Prisma query, status code và response shape không đổi.

### Prompt 05C — Backend API route/controller split phase 3

- [x] Preflight Git.
- [x] Xác nhận commit Prompt 05B `29a97a6c3950dc73219bcf91b74b373614ff4d28`.
- [x] Đọc docs/report bắt buộc và route map hiện tại.
- [x] Baseline validation trước thay đổi pass.
- [x] Route map update trước khi tách.
- [x] Chọn route nhỏ ít rủi ro: `GET /prompts`.
- [x] Tạo `prompts.controller.js`.
- [x] Tạo `prompts.routes.js`.
- [x] Mount `/prompts` tại đúng vị trí route cũ.
- [x] Gỡ block `GET /prompts` khỏi `backend/src/api/dashboard.js`.
- [x] Giữ public route/response contract.
- [x] Không sửa webhook, tenant handoff, RAG, bot engine, Prisma schema/migrations.
- [x] Backend syntax validation sau refactor.
- [x] Prisma validate dummy.
- [x] Không sửa dashboard frontend.
- [x] Tạo report Prompt 05C.
- [x] Commit Prompt 05C nếu pass.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Public route `/api/prompts`, method, auth middleware, tenant scope, Prisma query, status code và response shape không đổi.

### Prompt 05R — Feature inventory + local run readiness + runtime smoke test

- [x] Preflight Git; xác nhận commit Prompt 05C `5e51bf7eea53305b4800c1449f4dc60caf885f46` tồn tại.
- [x] Đọc docs/report/config/scripts bắt buộc; không đọc `.env` thật.
- [x] Tạo `docs/FEATURE_INVENTORY.md` (9 nhóm chức năng, không đánh dấu runtime PASS).
- [x] Tạo `docs/LOCAL_RUN_GUIDE.md` (trạng thái, cách chạy an toàn, checklist thủ công).
- [x] Kiểm tra readiness read-only: node/npm, node_modules, tồn tại `.env` (không mở nội dung).
- [x] Static validation: backend `node --check` toàn bộ file trọng yếu PASS; `prisma validate` dummy PASS; dashboard `tsc --noEmit` PASS; `next build` PASS.
- [x] Runtime smoke readiness check theo Phase 4.
- [ ] Runtime smoke test 3 route — **BLOCKED**: thiếu `backend/.env` local/test và DB local/test; không có token test an toàn.
- [x] Tạo report `report/PROMPT_05R_FEATURE_INVENTORY_LOCAL_RUN_RUNTIME_SMOKE_REPORT.md`.
- [x] Không sửa source runtime/schema/webhook/RAG/tenant handoff/DevOps script.

Trạng thái: **BLOCKED — needs local/test env** (tại thời điểm 05R). Docs/readiness/static validation hoàn tất; runtime chưa verify khi đó.
Điều kiện còn thiếu khi đó: `backend/.env` + `dashboard/.env.local` local/test, PostgreSQL local/test.

### Prompt 05R-ENV — Prepare local test env + runtime smoke gate

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean, commit `7425777` tồn tại.
- [x] Env readiness: xác nhận `.env` thiếu; người dùng phê duyệt tạo env local-only + Docker Postgres tạm.
- [x] Tạo `backend/.env` + `dashboard/.env.local` local-only (gitignored, không in secret, không commit).
- [x] Khởi động Docker Postgres tạm (`pgvector/pgvector:pg16`, port 5433, DB local/test).
- [x] `npx prisma migrate deploy` (non-destructive) áp dụng 10 migration vào DB tạm trống; KHÔNG `db push`/`--accept-data-loss`.
- [x] Static validation lại: backend `node --check` ×9 + `prisma validate` PASS; dashboard `tsc` + `next build` PASS.
- [x] Start backend local `node src/index.js`; seed default admin + prompt templates.
- [x] Lấy auth token qua `POST /api/auth/login` (không in token/secret).
- [x] Runtime smoke test 3 route — **PASS**: no-token→401; `webhook`→200 (secret mask/null); `telegram-destinations`→200 (`{destinations,envFallback}`); `prompts`→200 (array len=7).
- [x] Dừng server; gỡ container tạm; xóa file env local; working tree clean.
- [x] Tạo report `report/PROMPT_05R_ENV_RUNTIME_SMOKE_REPORT.md`.
- [x] Không sửa source runtime/schema/webhook/RAG/tenant handoff/DevOps; không push.

Trạng thái: **PASS — runtime smoke test passed**. 3 route đã tách runtime verified.

### Prompt 05R-LOCALDB-FIX — Fix local pgvector + run backend safely

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean, không đụng master/main.
- [x] Xác định 2 lỗi: `DATABASE_URL not found` (env hỏng/thiếu) và `type "vector" does not exist` (DB không có pgvector).
- [x] Tạo lại `backend/.env` local-only nhất quán (PORT/NODE_ENV/ENCRYPTION_KEY/DATABASE_URL/JWT/ADMIN), `dashboard/.env.local` local-only; gitignored, không commit, không in secret.
- [x] Dựng container **bền vững** `bbotech-pgvector-local` (`pgvector/pgvector:pg16`, port 5433, volume `bbotech_pgvector_local_data`); không đụng container Supabase dự án khác.
- [x] `CREATE EXTENSION IF NOT EXISTS vector;` + verify.
- [x] `npx prisma validate` PASS, `npx prisma migrate deploy` PASS (10 migration), `npx prisma generate` PASS; KHÔNG `db push --accept-data-loss`.
- [x] `npm run dev` chạy OK trên port 3001.
- [x] Smoke test 3 route PASS lại (401 no-token; 200 + shape đúng có token).
- [x] Dừng backend; **giữ** container + volume + env để user chạy lại.
- [x] Tạo report `report/PROMPT_05R_LOCALDB_PGVECTOR_FIX_REPORT.md`.
- [x] Không sửa source runtime/schema/webhook/RAG/tenant handoff.

Trạng thái: **PASS — backend local runs and smoke test passed**.

### Prompt 05D — Settings API route/controller split + runtime verify

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean, commit `040257b` tồn tại.
- [x] Baseline static validation PASS; route map toàn bộ `/settings*` còn lại.
- [x] Chọn route settings read-only an toàn nhất: `GET /settings/handoff` (còn lại đều write/external).
- [x] Thêm `createGetHandoffSettings({ prisma })` vào `settings.controller.js`; mount `GET /handoff` trong `settings.routes.js`; gỡ block khỏi `dashboard.js` (2408→2395 dòng).
- [x] Giữ nguyên public route/method/auth/status/shape/DB query/error — move handler **nguyên trạng**.
- [x] Static validation sau thay đổi PASS (`node --check` ×9, `prisma validate`, `git diff --check`).
- [x] Runtime smoke: no-token→401; `webhook`/`telegram-destinations`/`prompts`→200; `handoff`→500 (**giữ nguyên** behavior gốc).
- [x] Phát hiện **bug pre-existing**: route handoff dùng `prisma.handoffSettings` (số nhiều) trong khi model là `HandoffSetting` (accessor đúng `prisma.handoffSetting`) → undefined → 500. **Không tự sửa** (cần approval — Prompt 05D-FIX).
- [x] Dừng backend; giữ DB container/volume/env.
- [x] Tạo report `report/PROMPT_05D_SETTINGS_ROUTE_SPLIT_RUNTIME_REPORT.md`.
- [x] Không sửa schema/webhook/RAG/tenant handoff/dashboard FE.

Trạng thái: **PASS WITH WARNINGS** — tách route thành công, behavior giữ nguyên (không regression); tồn đọng bug pre-existing accessor cần fix riêng.

### Prompt 05D-FIX — Handoff settings Prisma accessor + runtime verify

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean trước khi sửa, commit Prompt 05D `a2fa5da` tồn tại.
- [x] Đọc context bắt buộc: report 05D, progress/checklist/refactor plan/local run guide, Prisma schema, backend index/API/controller/routes liên quan.
- [x] Xác minh model Prisma đúng là `HandoffSetting`, accessor đúng là `prisma.handoffSetting`; scan trước fix còn `prisma.handoffSettings` trong handoff settings.
- [x] Sửa `settings.controller.js`: `prisma.handoffSettings.findUnique/create` → `prisma.handoffSetting.findUnique/create`.
- [x] Sửa `dashboard.js`: `PUT /settings/handoff` và vị trí đọc handoff settings khi assign dùng `prisma.handoffSetting`.
- [x] Sửa schema compatibility trong cùng phạm vi handoff settings: bỏ `botGracePeriodSeconds` khỏi Prisma payload `HandoffSetting` vì field này không tồn tại trong schema và làm `PUT /settings/handoff` 500.
- [x] Static validation PASS: `node --check` 9 file backend, `npx prisma validate`, `git diff --check`; không sửa schema/migrations.
- [x] Runtime smoke PASS trên `bbotech-pgvector-local`: no-token `GET /api/settings/handoff` → 401; `webhook`/`telegram-destinations`/`prompts` → 200; `GET /settings/handoff` → 200 object; `PUT /settings/handoff` với payload tương đương current settings → 200; GET lại → 200.
- [x] Dừng backend process do prompt khởi động; giữ DB container/volume/env local.
- [x] Không sửa webhook handlers, tenant handoff, RAG, bot engine/tools, dashboard frontend, Prisma schema/migrations, package hoặc DevOps scripts.
- [x] Tạo report `report/PROMPT_05D_FIX_HANDOFF_SETTINGS_ACCESSOR_REPORT.md`.

Trạng thái: **PASS — bug fixed and runtime verified**. Public route/method/auth giữ nguyên; behavior fix có chủ đích là `/api/settings/handoff` từ 500 thành 200 đúng contract.

### Prompt 05E — Split PUT handoff settings route + runtime verify

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean trước khi sửa, commit Prompt 05D-FIX `6a427d9` tồn tại.
- [x] Đọc context bắt buộc: report 05D-FIX/05D, progress/checklist/refactor plan/local run guide, Prisma schema, dashboard API, settings/prompts controller/routes.
- [x] Baseline static validation PASS: `node --check` 9 file backend, `npx prisma validate`.
- [x] Route map xác nhận: `GET /settings/handoff` đã ở `settings.routes.js`; `PUT /settings/handoff` còn trong `dashboard.js`; không còn accessor sai `handoffSettings`; `botGracePeriodSeconds` không còn trong Prisma payload `HandoffSetting`.
- [x] Thêm `createPutHandoffSettings({ prisma })` vào `settings.controller.js` với logic upsert đã fix từ Prompt 05D-FIX.
- [x] Mount `router.put('/handoff', authMiddleware, createPutHandoffSettings({ prisma }))` trong `settings.routes.js`.
- [x] Gỡ block direct `router.put('/settings/handoff', ...)` khỏi `backend/src/api/dashboard.js`; public path vẫn là `/api/settings/handoff` qua mount `/settings`.
- [x] Static validation sau thay đổi PASS: `node --check` 9 file backend, `npx prisma validate`, `git diff --check`.
- [x] Runtime smoke PASS trên `bbotech-pgvector-local`: no-token GET/PUT handoff → 401; `webhook`/`telegram-destinations`/`prompts` → 200; handoff GET/PUT → 200; GET lại sau PUT → 200.
- [x] Dừng backend process do prompt khởi động; giữ DB container/volume/env local.
- [x] Không sửa webhook handlers, tenant handoff, RAG, bot engine/tools, dashboard frontend, Prisma schema/migrations, package hoặc DevOps scripts.
- [x] Tạo report `report/PROMPT_05E_PUT_HANDOFF_SETTINGS_ROUTE_SPLIT_REPORT.md`.

Trạng thái: **PASS — route split and runtime verified**. `dashboard.js` còn 2382 dòng và khoảng 96 route direct sau Prompt 05E.

### Prompt 06 — Repository layer phase 1 for settings/prompts

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean trước khi sửa, commit Prompt 05E `9eb536a` tồn tại.
- [x] Đọc context bắt buộc: report 05E/05D-FIX, progress/checklist/refactor plan/local run guide/architecture, Prisma schema/wrapper, dashboard API, settings/prompts controller/routes.
- [x] Baseline static validation PASS: `node --check` 9 file backend, `npx prisma validate`.
- [x] Lập candidate map repository: `settings/webhook` không cần DB repository; `telegram-destinations` read là candidate sau; `handoff settings` được chọn; `prompts` để sau vì có tenant scope.
- [x] Tạo `backend/src/infrastructure/repositories/handoffSettings.repository.js`.
- [x] Repository nhận `prisma` dependency rõ ràng; không tạo PrismaClient mới; không import Express/process.env; chỉ chứa DB operations `findSingleton`, `createDefault`, `upsertSingleton`.
- [x] Sửa `settings.controller.js`: `createGetHandoffSettings` và `createPutHandoffSettings` dùng `handoffSettingsRepository`, không gọi Prisma handoff trực tiếp.
- [x] Sửa `settings.routes.js`: tạo `handoffSettingsRepository` từ Prisma singleton được truyền vào `createSettingsRoutes({ authMiddleware, prisma })`, giữ compatibility route factory.
- [x] Static validation sau thay đổi PASS: `node --check` 10 file backend gồm repository mới, `npx prisma validate`, `git diff --check`.
- [x] Runtime smoke PASS trên `bbotech-pgvector-local`: no-token GET/PUT handoff → 401; handoff GET/PUT/GET-after-PUT → 200; `webhook`/`telegram-destinations`/`prompts` regression → 200.
- [x] Dừng backend process do prompt khởi động; giữ DB container/volume/env local.
- [x] Không sửa webhook handlers, tenant handoff, RAG, bot engine/tools, dashboard frontend, Prisma schema/migrations, package hoặc DevOps scripts.
- [x] Tạo report `report/PROMPT_06_REPOSITORY_LAYER_SETTINGS_PROMPTS_REPORT.md`.

Trạng thái: **PASS — repository layer phase 1 and runtime verified**. `dashboard.js` không đổi so với 05E: 2382 dòng và khoảng 96 route direct.

### Prompt 06B — Repository layer for Telegram destinations read

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean trước khi sửa, commit Prompt 06 `5b26b25` tồn tại.
- [x] Secret safety: `.env`/`.env.local` được gitignore, không nằm trong tracked files, không stage/commit secret; remote trống nên không push.
- [x] Đọc context bắt buộc: report Prompt 06/05E, progress/checklist/refactor plan/local run guide/architecture, Prisma schema, Prisma singleton wrapper, dashboard API, settings/prompts controller/routes.
- [x] Baseline static validation PASS: `node --check` các file backend liên quan, `npx prisma validate`.
- [x] Xác nhận candidate: `GET /settings/telegram-destinations` là read-only DB query đã tách route/controller; write/test Telegram routes còn trong `dashboard.js` và không thuộc phạm vi.
- [x] Tạo `backend/src/infrastructure/repositories/telegramDestinations.repository.js`.
- [x] Repository nhận `prisma` dependency rõ ràng; không tạo PrismaClient mới; không import Express/process.env; chỉ chứa DB operation `findAll`.
- [x] Sửa `settings.controller.js`: `createGetTelegramDestinations` dùng `telegramDestinationsRepository`, response `{ destinations, envFallback }` giữ nguyên.
- [x] Sửa `settings.routes.js`: tạo `telegramDestinationsRepository` từ Prisma singleton được truyền vào `createSettingsRoutes({ authMiddleware, prisma })`.
- [x] Static validation sau thay đổi PASS: `node --check` 11 file backend gồm repository mới, `npx prisma validate`, `git diff --check`.
- [x] Runtime smoke PASS trên `bbotech-pgvector-local`: no-token `GET /settings/telegram-destinations` và `GET /settings/handoff` → 401; có token local ký trong memory → `telegram-destinations` 200, `webhook` 200, handoff GET/PUT 200, `prompts` 200 array.
- [x] Dừng backend process do prompt khởi động; giữ DB container/volume/env local.
- [x] Khởi động backend có log Telegram bot polling vì local env có token; route `GET /settings/telegram-destinations` không gọi route test Telegram và không gửi external message.
- [x] Không sửa webhook handlers, tenant handoff, RAG, bot engine/tools, dashboard frontend, Prisma schema/migrations, package hoặc DevOps scripts.
- [x] Tạo report `report/PROMPT_06B_TELEGRAM_DESTINATIONS_REPOSITORY_REPORT.md`.

Trạng thái: **PASS — telegram destinations repository layer and runtime verified**. `dashboard.js` không đổi so với 05E/06: 2382 dòng và khoảng 96 route direct.

### Prompt 06C — Prompts repository with tenant scope checklist

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean trước khi sửa, commit Prompt 06B `5ac922d` tồn tại.
- [x] Secret safety: `.env`/`.env.local` được gitignore, không nằm trong tracked files, không stage/commit secret; remote trống nên không push.
- [x] Đọc context bắt buộc: report Prompt 06B/06, progress/checklist/refactor plan/local run guide/architecture, Prisma schema, Prisma singleton wrapper, repository hiện có, dashboard API, prompts/settings controller/routes.
- [x] Baseline static validation PASS: `node --check` các file backend liên quan, `npx prisma validate`.
- [x] Lập tenant scope map cho `GET /prompts`: controller lấy `layer` từ query, gọi `getTenantScope(req)`, dùng `where = { tenantId: tenantId ?? null }`, thêm `where.layer = layer` nếu có, order `layer asc`, `intentType asc`, không select/include, không raw SQL, không external API.
- [x] Tạo `backend/src/infrastructure/repositories/promptTemplates.repository.js`.
- [x] Repository nhận `prisma` dependency rõ ràng; không tạo PrismaClient mới; không import Express/process.env; chỉ chứa DB read operation `findManyForScope`.
- [x] Sửa `prompts.controller.js`: `createListPromptTemplates` dùng `promptTemplatesRepository`, vẫn gọi `getTenantScope(req)` trong controller, response array và error 500 giữ nguyên.
- [x] Sửa `prompts.routes.js`: tạo `promptTemplatesRepository` từ Prisma singleton được truyền vào `createPromptRoutes({ authMiddleware, getTenantScope, prisma })`.
- [x] Static validation sau thay đổi PASS: `node --check` 12 file backend gồm repository mới, `npx prisma validate`, `git diff --check`.
- [x] Runtime smoke PASS trên `bbotech-pgvector-local`: no-token `GET /prompts` và `GET /settings/telegram-destinations` → 401; có token local ký trong memory → `prompts` 200 array len=7, `prompts?layer=intent` 200 array len=6, `webhook` 200, `telegram-destinations` 200, handoff GET/PUT 200.
- [x] Tenant scope runtime: default/local scope PASS; local DB có `tenant_count=0`, `tenant_prompt_count=0`, nên chưa verify full tenant isolation.
- [x] Dừng backend process do prompt khởi động; giữ DB container/volume/env local.
- [x] Khởi động backend có log Telegram bot polling vì local env có token; smoke không gọi route test Telegram và không gửi external message.
- [x] Không sửa webhook handlers, tenant handoff, RAG, bot engine/tools, dashboard frontend, Prisma schema/migrations, package hoặc DevOps scripts.
- [x] Tạo report `report/PROMPT_06C_PROMPTS_REPOSITORY_TENANT_SCOPE_REPORT.md`.

Trạng thái: **PASS WITH WARNINGS — prompts repository done, default/local scope runtime verified; full tenant isolation vẫn cần Prompt 07**. `dashboard.js` không đổi so với 05E/06/06B: 2382 dòng và khoảng 96 route direct.

**Settings/Cài Đặt là khu vực mấu chốt** (webhook config, Telegram destinations, handoff, provider/API, channel/Chatwoot/Facebook config) → refactor phải an toàn, route-by-route, có runtime smoke test; không tách route external side effect khi chưa có test cô lập.

## 4. Next planned prompts

| Prompt | Tên | Mục tiêu | Tool nên dùng |
|---|---|---|---|
| Prompt 07 | Tenant safety audit | Trace tenant scope toàn hệ thống, đặc biệt prompts/knowledge/channel configs; không sửa lớn nếu chưa chắc | Codex |
| Prompt 06D | Prompt detail/write repository | Chỉ làm sau Prompt 07; tách prompt detail/write với tenant permission rõ ràng | Codex |
| Prompt 05F | Settings external/write isolated tests | Nếu chưa sang repository layer, tạo test cô lập cho Telegram/Chatwoot/Facebook settings route còn lại, không gọi external thật | Codex |
| Prompt 08 | RAG/raw SQL hardening | Audit `$queryRawUnsafe`, pgvector query và input source | Codex |
| Prompt 09 | Dashboard feature split | Tách page lớn thành features/components, giữ route/UI behavior | Claude Code hoặc Codex |
| Prompt 10 | DevOps/deploy hardening | Script, Docker, migration policy, CI/deploy env | Codex |

## 5. Rủi ro đang mở

| Rủi ro | Trạng thái | Ưu tiên | Prompt xử lý |
|---|---|---|---|
| `backend/src/api/dashboard.js` quá lớn | Open (2382 dòng, khoảng 96 route direct sau 05E; không đổi ở 06/06B/06C) | P0 | Prompt 07/05F/06D |
| Bug handoff: sai Prisma accessor `handoffSettings` (đúng `handoffSetting`) → `/settings/handoff` trả 500 | Closed ở Prompt 05D-FIX | P1 | Đã sửa + runtime verified GET/PUT 200 |
| Handoff settings payload có field ngoài schema `botGracePeriodSeconds` | Closed ở Prompt 05D-FIX | P1 | Đã bỏ khỏi Prisma payload `HandoffSetting`; không đổi schema |
| `PUT /settings/handoff` còn nằm trong `dashboard.js` | Closed ở Prompt 05E | P1 | Đã tách sang `settings.controller.js`/`settings.routes.js`; runtime verified |
| Handoff settings controller gọi Prisma trực tiếp | Closed ở Prompt 06 | P1 | Đã tạo `handoffSettingsRepository`; GET/PUT handoff dùng repository |
| Telegram destinations GET controller gọi Prisma trực tiếp | Closed ở Prompt 06B | P1 | Đã tạo `telegramDestinationsRepository`; `GET /settings/telegram-destinations` dùng repository |
| Prompts list controller gọi Prisma trực tiếp | Closed ở Prompt 06C | P1 | Đã tạo `promptTemplatesRepository`; `GET /prompts` dùng repository và giữ tenant scope cũ |
| Repository coverage còn ít | Open | P1 | Prompt 07 trước, sau đó Prompt 06D hoặc route nhỏ khác |
| `$queryRawUnsafe` | Open | P0 | Prompt 08 |
| Tenant scope chưa runtime verified toàn diện | Open | P0 | Prompt 07; Prompt 06C mới verify default/local scope vì local DB không có tenant sample |
| Default credential/fallback | Open | P0 | Prompt riêng sau env policy |
| `start-all.bat` có `db push --accept-data-loss` | Closed ở Prompt 10B | P0 | Thay bằng `prisma migrate deploy` + guard banner LOCAL ONLY; không còn lệnh executable destructive |
| Container start chạy `prisma migrate deploy` | Closed ở Prompt 10B | P0 | `backend/Dockerfile` CMD chỉ còn `node src/index.js`; migration tách thành release step riêng (docs/DEPLOYMENT_POLICY.md) |
| Runtime verification toàn hệ thống chưa chạy | Open | P0 | Đã verify nhóm settings/prompts nhỏ; route khác vẫn cần test |
| Backend chưa có lint/typecheck thật | Partial ở Prompt 10C | P1 | Có `npm run quality` (syntax `node --check` + `prisma validate`); ESLint chưa cài (không thêm dependency) |
| Dashboard lint chưa cấu hình | Partial ở Prompt 10C | P1 | Có `npm run quality` (typecheck + build); `next lint` cần cài ESLint (interactive) → để prompt dependency riêng, xem docs/QUALITY_GATE.md |
| npm audit vulnerabilities | Open | P1 | Prompt security deps riêng |
| Hard-code localhost trong script/root | Open | P1 | Prompt 10 |
| `webhook-urls-current.txt` có thể stale | Closed ở Prompt 10B | P1 | Thêm warning header local/stale + trỏ direct `/webhook` No-Chatwoot và docs/DEPLOYMENT_POLICY.md |
| Drift `knowledge_base.embedding` NOT NULL vs schema nullable | Closed ở Prompt 10B | P0 | Migration `align_knowledge_embedding_nullable` DROP NOT NULL (0 rows, no vector index); drift smoke insert content-first PASS 9/9 |
| `chatwoot/` folder không tồn tại ở root | Open | P1 | Prompt 10 |

## 6. Decision log

| Quyết định | Lý do | Prompt |
|---|---|---|
| Không refactor khi chưa có Git checkpoint | Tránh mất điểm rollback | Prompt 02 |
| Tạo Git checkpoint trước khi cài dependency/refactor | Có baseline khôi phục an toàn | Prompt 02B |
| Dùng `DATABASE_URL` dummy cho Prisma validate | Validate schema mà không đọc `.env` thật hoặc connect DB thật | Prompt 02B+ |
| Chỉ tạo architecture shell ở Prompt 03 | Tránh phá webhook/RAG/tenant/handoff | Prompt 03 |
| Không sửa webhook/tenant/RAG trong Prompt 03/04 | Rủi ro behavior cao, cần regression checklist | Prompt 03/04 |
| Gom config trước khi tách route | Giảm hard-code và chuẩn bị route split | Prompt 04 |
| Không sửa DevOps script trong Prompt 04 | Script có migration/db push/tunnel risk, cần prompt riêng | Prompt 04 |
| Prompt 05 chỉ tách domain nhỏ | Tránh rewrite `dashboard.js` quá rộng | Prompt 05 planned |
| Prompt 05B tiếp tục chọn route settings read-only | Giữ blast radius nhỏ, không đụng write route hoặc external side effect | Prompt 05B |
| Prompt 05C chọn `GET /prompts` thay vì settings còn lại | Settings còn lại có write/external side effect; `GET /prompts` read-only và có query rõ | Prompt 05C |

## 7. Validation history

| Mốc | Backend syntax | Prisma validate dummy | Dashboard typecheck | Dashboard build | Runtime verification | Commit hash |
|---|---|---|---|---|---|---|
| Prompt 01 | Not run | Not run | Not run | Not run | Not run | Không có Git |
| Prompt 02 | Not run | Not run | Not run | Not run | Not run | Không có Git |
| Prompt 02A | Not run | Not run | Not run | Not run | Not run | Không có Git |
| Prompt 02B | PASS | PASS | PASS | PASS | Not run | `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` |
| Prompt 03 | PASS | PASS | PASS | PASS | Not run | `24ac487d1b406f06650ca942efb311619e6a7c47` |
| Prompt 04 | PASS | PASS | PASS | PASS | Not run | `25f3bb79e419590fb14540a82f28efe6482d980f` |
| Prompt 04A | Docs-only diff validation | Not applicable | Not applicable | Not applicable | Not applicable | `cea82b1993abf46a7f732991c24e7d532dd2f347` |
| Prompt 05 | PASS | PASS | Not run | Not run | Not run | `c860ca416a3439dfc7b72bc1e9d9f5ab3cba5af0` |
| Prompt 05B | PASS | PASS | Not run | Not run | Not run | `29a97a6c3950dc73219bcf91b74b373614ff4d28` |
| Prompt 05C | PASS | PASS | Not run | Not run | Not run | `5e51bf7eea53305b4800c1449f4dc60caf885f46` |
| Prompt 05R | PASS | PASS | PASS | PASS | BLOCKED (thiếu env/DB local/test) | `2bf4386` / `7425777` |
| Prompt 05R-ENV | PASS | PASS | PASS | PASS | PASS (3 route, DB local/test tạm) | `c864390` |
| Prompt 05R-LOCALDB-FIX | PASS | PASS | Not run | Not run | PASS (3 route, DB pgvector local bền vững) | `040257b` |
| Prompt 05D | PASS | PASS | Not run | Not run | PASS WITH WARNINGS (3 route 200; handoff 500 giữ nguyên — bug pre-existing) | `a2fa5da` |
| Prompt 05D-FIX | PASS | PASS | Not run | Not run | PASS (`webhook`/`telegram-destinations`/`prompts` 200; handoff GET/PUT 200) | `6a427d9` |
| Prompt 05E | PASS | PASS | Not run | Not run | PASS (no-token GET/PUT handoff 401; 5 route smoke 200) | `9eb536a` |
| Prompt 06 | PASS | PASS | Not run | Not run | PASS (handoff repository GET/PUT 200; regression routes 200) | `5b26b25` |
| Prompt 06B | PASS | PASS | Not run | Not run | PASS (`telegram-destinations` repository GET 200; settings/prompts regression 200; no-token 401) | `5ac922d` |
| Prompt 06C | PASS | PASS | Not run | Not run | PASS WITH WARNINGS (`prompts` repository GET 200; layer filter 200; default/local scope only; no tenant sample) | Ghi sau commit 06C |

Ghi chú: “PASS” ở các mốc trên là static validation/build validation, không đồng nghĩa runtime smoke test đã pass.

## 8. Tool routing

| Tool | Việc nên dùng |
|---|---|
| Codex | Refactor backend, repository layer, config/env policy, DevOps hardening, validation, Git commit, báo cáo kỹ thuật. |
| Claude Code | Dashboard feature split, UI flow phức tạp, frontend component refactor lớn nếu cần thao tác nhiều UI state. |
| Claude Design | Chỉ dùng khi cần redesign visual/mockup, layout mới hoặc thiết kế giao diện trước khi code. |
| ChatGPT | Tạo prompt, review report, lập kế hoạch, tổng hợp quyết định và checklist. |

## 9. Bước tiếp theo rõ ràng

Prompt 06C đã hoàn tất: `GET /api/prompts` hiện đi qua `promptTemplatesRepository` trong `backend/src/infrastructure/repositories/`; `GET /api/settings/telegram-destinations` vẫn đi qua `telegramDestinationsRepository`; `GET/PUT /api/settings/handoff` vẫn đi qua `handoffSettingsRepository`. Nhóm route nhỏ `settings/prompts` runtime verified trên DB pgvector local/test, gồm `GET /api/settings/webhook`, `GET /api/settings/telegram-destinations`, `GET /api/prompts`, `GET /api/prompts?layer=intent`, `GET /api/settings/handoff`, `PUT /api/settings/handoff`. Auth không token vẫn trả 401; token smoke được ký cục bộ trong memory từ admin user hiện có, không in credential/token. Local DB không có tenant sample, nên tenant isolation full chưa thể kết luận.

Bước tiếp theo (sau Prompt 06C):

- **Prompt 07**: tenant safety audit toàn hệ thống, đặc biệt các route có `getTenantScope(req)` và prompt/knowledge/channel config.
- **Prompt 06D**: chỉ sau Prompt 07, cân nhắc repository cho prompt detail/write với permission/tenant ownership rõ ràng.

Lưu ý tái chạy: Prompt 05R-LOCALDB-FIX đã dựng DB pgvector local **bền vững** (`bbotech-pgvector-local`, port 5433, volume `bbotech_pgvector_local_data`) và giữ `backend/.env`. User chạy lại backend bằng: `docker start bbotech-pgvector-local` → `cd backend` → `npm run dev` (xem `docs/LOCAL_RUN_GUIDE.md` mục 1c). Không chạy migration/db push/Docker compose/start-all trên dữ liệu production.

Điều kiện bắt buộc:

- Không đụng webhook handlers.
- Không đụng tenant handoff.
- Không đụng RAG pipeline.
- Không đụng Prisma schema/migrations.
- Không sửa Dockerfile/scripts.
- Không chạy migration/db push/Docker/start script.
- Nếu chưa có runtime smoke test, ghi rõ **Static validation pass — chưa runtime verified**.

## Prompt 08D - Dashboard no-Chatwoot cleanup + backend tenant contract bridge

Ngày cập nhật: 2026-07-09

Phạm vi đã làm:

- Xóa toàn bộ reference Chatwoot trong `dashboard/src` theo scan yêu cầu: env runtime, API helper, Settings page, Channel Configs page, Tenants page và README feature nằm dưới `dashboard/src/features`.
- Gỡ `NEXT_PUBLIC_CHATWOOT_URL`/`CHATWOOT_BASE_URL` khỏi `dashboard/src/lib/config/env.ts`.
- Gỡ Dashboard call tới `/api/settings/chatwoot-test` và `/api/channel-configs/lookup-inboxes`.
- Gỡ picker inbox legacy khỏi Channel Configs; form kênh vẫn cho nhập thủ công `inboxId`, `channelType`, `name`, filter và persona như trước.
- Gỡ form/label/payload legacy khỏi Tenants page: Dashboard không còn gửi `chatwootModel`, `chatwootAccountId`, token, team, base URL hoặc webhook secret.
- Thêm bridge tối thiểu trong `backend/src/api/dashboard.js`: `POST /tenants` chỉ còn bắt buộc `slug` và `name`; backend tự điền giá trị compatibility cho các cột schema cũ để không cần Dashboard gửi legacy fields.
- Không sửa Prisma schema/migrations, RAG, webhook handler, tenant handoff, bot engine/tools, package, Dockerfile hoặc script.

Validation đã chạy:

- Baseline trước sửa: `node --check` cho các file backend trọng yếu, `npx prisma validate`, `npx --no-install tsc --noEmit` đều PASS.
- Sau sửa: `rg -n -i "chatwoot|NEXT_PUBLIC_CHATWOOT|lookupInboxes|chatwoot-test|lookup-inboxes" dashboard/src` không còn kết quả.
- Sau sửa: `node --check backend/src/api/dashboard.js` PASS.
- Sau sửa: `npx prisma validate` PASS.
- Sau sửa: `npx --no-install tsc --noEmit` trong `dashboard` PASS.
- Sau sửa: `npm run --if-present build` trong `dashboard` PASS.
- Sau sửa: `git diff --check` PASS, chỉ có warning CRLF/LF của Git trên Windows.
- Runtime nhẹ: backend đang chạy sẵn và `GET http://localhost:3001/health` trả `{"status":"ok"}`; dashboard đang chạy sẵn và `GET http://localhost:3002` trả HTTP 200.

Giới hạn validation:

- `npm run --if-present lint` trong `dashboard` bị chặn bởi prompt tương tác cấu hình ESLint vì dự án chưa có ESLint config; không tự tạo config trong Prompt 08D để tránh mở rộng scope.
- Không chạy tenant create/update runtime mutating test vì sẽ ghi DB. Backend startup mới cũng có side effect seed/reset/setup menu/notification nên không tự start thêm instance.

Trạng thái: **PASS WITH WARNINGS** - Dashboard source đã sạch Chatwoot keyword theo yêu cầu; backend tenant create có compatibility bridge; còn cần prompt riêng cho schema legacy cleanup và lint config.

Gợi ý tiếp theo:

- Prompt 08E hoặc 10: lập migration/schema cleanup thực thi cho các cột legacy trong `Tenant`, có backup và migration plan rõ ràng.
- Prompt quality gate: cấu hình ESLint không tương tác hoặc thay script lint phù hợp Next.js hiện tại.
- Prompt runtime smoke có kiểm soát: tạo/update tenant trên DB test/snapshot riêng, xác nhận payload mới không cần legacy fields.

## Prompt 08E — Tenant contract runtime smoke + backend legacy stop-write

Ngày cập nhật: 2026-07-09

- Đã verify runtime tenant create/update bằng payload mới (chỉ `slug`/`name`, không legacy field) trên DB local `bbotech-pgvector-local`: smoke PASS 17/17, tenant test cleanup còn 0.
- Backend tenant contract: `POST/PUT /api/tenants` không còn nhận/ghi field legacy Chatwoot từ client (stop-write). Backend tự set giá trị compatibility `direct-facebook` cho cột NOT NULL còn lại.
- `maskTenant()` không còn expose cột legacy (`chatwootModel/AccountId/BaseUrl/TeamId/ApiTokenEnc`, `webhookSecretEnc`, `hasApiToken/hasWebhookSecret`, `webhookUrl`); thêm field trung tính `integrationMode`/`messagingMode = direct-facebook`.
- Prisma schema/migrations KHÔNG sửa; cột legacy vẫn tồn tại tạm để tương thích.
- Điều kiện để migration removal: backend đã stop-write (đạt ở 08E), dashboard không đọc legacy (đạt), cần backup DB + migration mới drop columns/indexes trên local/staging trước production.
- Regression PASS: prompts/settings/handoff/telegram-destinations 200; `/webhook` verify sai 403; `/chatwoot-webhook`, `/api/settings/chatwoot-test`, `/api/channel-configs/lookup-inboxes` đều 404.
- Next prompt đề xuất: 08F/schema-removal migration (drop cột legacy sau backup) hoặc quality-gate lint non-interactive.

## Prompt 08H - Browser login redirect fix + auth flow regression

Ngày cập nhật: 2026-07-10

Phạm vi đã làm:

- Điều tra lỗi đăng nhập đúng tài khoản nhưng không vào được Dashboard bằng browser smoke trên Chrome headless/CDP.
- Nguyên nhân thật: dashboard dev server đang phục vụ `_next/static` chunk bị 404 sau build/dev mismatch, nên React không hydrate; form đăng nhập rơi vào native submit `/login?` và không gọi `/api/auth/login`.
- Sửa source auth flow: login thành công dùng `router.replace('/dashboard')`, login page tự redirect về Dashboard nếu đã có user, nút submit bị khóa trong lúc auth provider đang hydrate.
- Sửa API interceptor: 401 từ `/auth/login` không bị global redirect nữa, để login page hiện lỗi an toàn; 401 protected route vẫn xóa `token`, `user`, `selectedTenantId` và về `/login`.
- Sửa backend seed admin: không còn fallback mật khẩu mẫu local/dev; mọi môi trường đều phải có `ADMIN_PASSWORD` khi cần tạo admin ban đầu.
- Không sửa `.env`, Prisma schema/migrations, RAG/raw SQL, webhook, tenant handoff, package, Dockerfile hoặc scripts.

Validation:

- Backend: `node --check src/index.js`, `node --check src/api/dashboard.js`, `npx prisma validate` PASS.
- Dashboard: `npx --no-install tsc --noEmit`, `npm run --if-present build` PASS.
- `git diff --check` PASS, chỉ có warning CRLF/LF của Git trên Windows.
- Backend auth smoke 8/8 PASS: health, login đúng/sai, protected prompts/settings/handoff/telegram-destinations, webhook verify sai 403, `chatwoot-webhook` 404.
- Browser redirect smoke PASS: hydration hoạt động, login đúng vào `/dashboard`, refresh vẫn ở Dashboard, logout xóa localStorage và về `/login`, login sai hiện lỗi an toàn và không lưu token.
- Sau smoke, dashboard dev server do Codex khởi động đã được dừng lại; backend đang chạy sẵn không bị dừng.

Trạng thái: **PASS**.

Gợi ý tiếp theo:

- Prompt 09: RAG/raw SQL hardening, audit tenant scope và parameterized query cho các điểm truy vấn dữ liệu.
- Nên tách prompt riêng cho auth storage hardening nếu muốn giảm rủi ro localStorage token về sau; không trộn với Prompt 09.

## Prompt 09 - RAG/raw SQL hardening phase 1

Ngày cập nhật: 2026-07-10

- Đã audit raw SQL/RAG và harden đường runtime RAG trong `backend/src/rag/pipeline.js`: thêm validate vector 768 chiều, clamp limit/threshold, chuyển RAG insert/update/search sang `$queryRaw`/`$executeRaw` tagged template.
- Vì DB local hiện vẫn bắt buộc `knowledge_base.embedding NOT NULL`, fallback khi embedding provider lỗi dùng vector placeholder đã validate thay vì insert `NULL`; vector search lọc similarity không hữu hạn để placeholder không lọt kết quả.
- `backend/src/api/dashboard.js`: fallback add knowledge và reindex đã bỏ `$queryRawUnsafe`; upload/scrape truyền `tenantId` từ `getTenantScope(req)`.
- `backend/src/rag/docParser.js`: thêm guard scrape URL cơ bản, chỉ cho `http/https`, chặn `file:`, localhost và private/internal IP literal.
- Raw unsafe còn lại là backlog ngoài RAG runtime: analytics dashboard, tenant handoff và script seed; chưa sửa tenant handoff theo giới hạn prompt.
- Validation PASS: backend syntax, Prisma validate, dashboard typecheck, `git diff --check`.
- Runtime smoke PASS: auth regression, helper vector/scrape guard, DB RAG add/update/search parameterized, tenant scope và cleanup `test-09-* = 0`.

Gợi ý tiếp theo:

- Prompt 09B: chuyển raw SQL analytics sang `$queryRaw` tagged template và chuẩn hóa `days` limit.
- Prompt 09C hoặc handoff-specific: xử lý `$queryRawUnsafe` trong `backend/src/tenants/handoff.js` với test tenant handoff riêng.

## Prompt 09B - Analytics raw SQL hardening

Ngày cập nhật: 2026-07-10

- Đã xử lý 4 `$queryRawUnsafe` trong `GET /api/analytics` tại `backend/src/api/dashboard.js`, chuyển sang Prisma `$queryRaw` tagged template với `sinceDate` parameterized.
- `days` đã được sanitize: default `30`, min `1`, max `365`; input không hợp lệ như `abc` dùng default, input quá lớn như `999999` bị clamp.
- Runtime smoke `/api/analytics` PASS trên Express app tạm mount source mới: default, `days=7`, `days=abc`, `days=999999` đều 200 và giữ response shape; no-token 401, tenant token 403, platform token 200.
- Auth/regression smoke PASS: `/api/prompts` 200, `/api/settings/handoff` 200, `/webhook` thiếu verify token 403, `/chatwoot-webhook` 404.
- Validation PASS: backend syntax checks, Prisma validate, dashboard `tsc --noEmit`, `git diff --check` (chỉ warning CRLF/LF của Git trên Windows).
- Raw SQL unsafe còn lại ngoài phạm vi Prompt 09B: `backend/src/tenants/handoff.js` và `backend/scripts/seed.js`.

Gợi ý tiếp theo:

- Prompt 09C: xử lý `$queryRawUnsafe` trong tenant handoff với tenant isolation/runtime smoke riêng.
- Sau handoff, cân nhắc Prompt 10 DevOps/security scripts để xử lý seed script nếu vẫn cần loại bỏ toàn bộ unsafe raw SQL.

## Prompt 19A-FIX - Full runtime bug sweep + Next.js chunk fix

Ngày cập nhật: 2026-07-10

- Đã xử lý regression runtime sau Prompt 19A: lỗi được báo `Cannot find module './20.js'` trong `.next/server/webpack-runtime.js` / `_not-found`.
- Root cause phân loại: stale `.next` cache/dev server mismatch sau build/dev process cũ, không phải source split analytics và không phải backend.
- Baseline sau `npm run quality` không còn tái hiện lỗi trên port 3019 hoặc process 3002 đang chạy sẵn; audit `.next/server/**/*.js` không còn reference thiếu `./20.js`.
- Đã clean `dashboard/.next`, chạy lại `npm run quality`, start dev server fresh port 3019 và smoke route thật: `/`, `/login`, `/dashboard`, `/dashboard/analytics`, `/dashboard/prompts`, `/dashboard/knowledge`, `/dashboard/settings`, `/dashboard/tenants`, `/dashboard/handoff`, `/dashboard/content-packages`, route 404 đều không có server error/chunk error/500.
- Backend smoke PASS 7/7 trên process 3001 đang chạy sẵn: health, login test token, prompts, settings/handoff, analytics `days=7`, webhook 403, chatwoot-webhook 404.
- Không sửa source dashboard/backend/package/schema/migration; chỉ cập nhật docs/report. Phase 19 vẫn Started, Prompt 19B chỉ tiếp tục sau khi giữ rule dev server route smoke thật.

Gợi ý tiếp theo:

- Prompt 19B chỉ nên bắt đầu khi sau mỗi lần split page đều chạy `npm run quality`, clean/fresh dev server nếu cần, và route smoke thật trên các route dashboard trọng yếu.
