# FEATURE AUDIT CHECKLIST - BBOTECH BOT AUTOMATION

## Prompt 22C-SAFE Update - Meta Real Event + Log Redaction Audit (BLOCKED)

Ngày cập nhật: 2026-07-13

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Preflight git | PASS | branch `chore/prompt-05r-docs-local-run`, commit `908fca9` tồn tại | Working tree sạch trước patch, chỉ ignored env/node_modules/.next/backups/tmp-runtime. |
| Env secret safety | PASS | exact sensitive env tracked scan rỗng | Không mở/in `.env` thật hoặc `.env.local`. Regex prompt có false-positive `backend/.env.example` là sample tracked hợp lệ. |
| Context read | PASS | 22B report, staging docs, quality gate, env example, webhook handler | Không đọc env thật. |
| Static validation | PASS | backend quality, Prisma validate, dashboard typecheck | Trước patch docs/report. |
| Operator Meta verify confirmation | MISSING | Không có `META_VERIFY_OPERATOR_CONFIRMED=YES` trong phiên | Dừng trước real event theo prompt. |
| Public HTTPS readiness | KEPT | `PUBLIC_SMOKE_PASS_NO_SECRET` từ Prompt 22B-SAFE | Không rerun real event branch. |
| Meta Verify Challenge | PENDING | `META_VERIFY_OPERATOR_CONFIRMATION_PENDING` | Chưa claim Meta verified. |
| Meta POST event thật | PENDING | command audit | Không gửi/chờ event thật. |
| Log redaction runtime audit | BLOCKED | chưa có event thật | Source đã harden, nhưng runtime event log chưa audit được. |
| External Meta/Facebook API | No | command audit | Không gọi Graph API. |
| Source/schema/package/dashboard | Unchanged | diff guard | Docs/report only. |

Kết luận: không đủ điều kiện test event thật. Prompt sau chỉ được tiếp tục khi người vận hành xác nhận `META_VERIFY_OPERATOR_CONFIRMED=YES`.

## Prompt 22B-SAFE Update - Public Ngrok Smoke + Meta Verify Checkpoint (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-13

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Preflight git | PASS | branch `chore/prompt-05r-docs-local-run`, commit `dede1fb` tồn tại | Working tree sạch trước patch, chỉ ignored env/node_modules/.next/backups/tmp-runtime. |
| Env secret safety | PASS | exact sensitive env tracked scan rỗng | Không mở/in `.env` thật hoặc `.env.local`. Regex prompt có false-positive `backend/.env.example` là sample tracked hợp lệ. |
| Static validation | PASS | backend quality, Prisma validate, dashboard typecheck | Trước patch docs/report. |
| DB container | PASS | `bbotech-pgvector-local` Up | Không chạy Docker Compose, không tạo container mới. |
| DB port 5433 | PASS | `Test-NetConnection localhost:5433` | Local DB listen. |
| Backend port 3001 | PASS | `Test-NetConnection localhost:3001` | Dùng process hiện có, không kill/start backend mới. |
| Prisma migrate deploy | PASS | no pending migrations | Không dùng `db push`. |
| Local smoke | PASS | health/webhook/chatwoot/login/settings/prompts | Admin tạm cleanup deleted 1; không in token. |
| STAGING_BASE_URL | VALID | `https://backspace-scrambler-stuck.ngrok-free.dev` | HTTPS, không localhost, không placeholder, không trailing `/webhook`. |
| Callback URL | READY_FOR_OPERATOR | `https://backspace-scrambler-stuck.ngrok-free.dev/webhook` | Dùng trong Meta Developer, không dùng `/api/settings/webhook`. |
| Public Ngrok smoke | PASS | `/health` 200, `/webhook` 403, `/chatwoot-webhook` 404 | Không dùng verify token thật, không gửi challenge, không POST object `page`. |
| Meta Verify Challenge | PENDING | `META_VERIFY_OPERATOR_CONFIRMATION_PENDING` | Chưa có xác nhận Meta UI Verify and Save PASS từ người vận hành. |
| Meta POST event thật | PENDING | command audit | Không gửi trong prompt này. |
| External Meta/Facebook API | No | command audit | Không gọi Graph API. |
| Source/schema/package/dashboard | Unchanged | diff guard | Docs/report only. |

Kết luận: public HTTPS safe smoke đã PASS; bước tiếp theo là người vận hành verify thủ công trong Meta Developer bằng token thật, không đưa token cho Codex.

## Prompt 22A-2 Update - Ngrok Local Runtime Restore + Public HTTPS Smoke (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-13

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Docker readiness | PASS | `docker version` | Docker client/server phản hồi. |
| DB container | PASS | `bbotech-pgvector-local` Up | Không cần `docker start`; không chạy Docker Compose. |
| DB port 5433 | PASS | `Test-NetConnection localhost:5433` | Local DB listen. |
| Backend port 3001 | PASS | `Test-NetConnection localhost:3001` | Dùng process hiện có, không kill. |
| Prisma migrate deploy | PASS | no pending migrations | Không dùng `db push`. |
| Local smoke | PASS | health/webhook/chatwoot/login/settings/prompts/options | Không POST `/webhook` object `page`. |
| Admin temp cleanup | PASS | deleted 1 | Không in credential/token. |
| STAGING_BASE_URL | MISSING | env shell check | Public smoke blocked. |
| Public Ngrok smoke | BLOCKED | `BLOCKED_STAGING_BASE_URL_MISSING` | Không fake public readiness. |
| External call | No | command audit | Không gọi Meta/Facebook API thật. |
| Source/schema/package/dashboard | Unchanged | diff guard | Docs/report only. |

Kết luận: local runtime restored và local smoke PASS; cần set `STAGING_BASE_URL` để chạy public smoke.

## Prompt 22A-1 Update - Webhook Log Redaction + Staging Runbook Hardening (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-12

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Webhook log audit | Done | scan `backend/src/webhook`, `index.js`, `facebook`, `bot`, `tenants`, `telegram` | Phân loại log trong report. |
| Message text log | Removed from webhook logs | `handler.js` | Message text vẫn được dùng để xử lý/lưu DB theo behavior cũ, nhưng không console log. |
| Sender/recipient id log | Masked | `maskId()` + log metadata | Không log full id trong `handler.js`. |
| Postback payload log | Removed from webhook logs | `postback_event_processing` metadata | Payload vẫn dùng cho bot/handoff như cũ. |
| Raw body/event log | Absent | log safety scan | Không log `req.body`, raw event hoặc JSON stringify payload. |
| Token/secret log | Absent | log safety scan | Env token vẫn đọc để verify/send API, không log giá trị. |
| Error detail | Hardened | `safeError()` | Không log `error.response.data`; chỉ name/status/code. |
| Behavior preservation | PASS | diff review | Không đổi export, route path, status code, bot/handoff calls. |
| Static validation | PASS | `node --check`, backend quality, Prisma validate, dashboard typecheck | Không sửa package/schema/dashboard. |
| Runtime smoke safe | BLOCKED | port `3001` và `5433` không listen | Không chạy Docker Compose/start-all; không fake PASS. |
| Staging runbook | Created | `docs/META_WEBHOOK_STAGING_RUNBOOK.md` | Public smoke/verify/rollback hướng dẫn rõ. |
| Public URL | Still missing | no `STAGING_BASE_URL` | Public HTTPS smoke vẫn pending. |
| External call | No | command audit | Không gọi Meta/Facebook/Telegram/Gemini/Jina/LLM thật. |

Kết luận: webhook log source đã harden, còn cần public URL và runtime staging event thật để xác nhận log thực tế.

## Prompt 22A Update - Public HTTPS / Meta Webhook Staging Readiness (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-12

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Staging readiness doc | Created | `docs/META_WEBHOOK_STAGING_READINESS.md` | Ghi đúng callback `https://<domain>/webhook` và checklist staging. |
| Source callback endpoint | PASS | `backend/src/index.js` | `GET /webhook` và `POST /webhook` được mount trực tiếp. |
| Verify challenge handler | PASS | `backend/src/webhook/handler.js` | Dùng `hub.mode`, `hub.verify_token`, `hub.challenge`; sai/thiếu token trả 403. |
| Dashboard config endpoint | PASS | `settings.routes.js`, `settings.controller.js` | `GET /api/settings/webhook` có auth, secret mask/null; không phải callback Meta. |
| Legacy Chatwoot callback | PASS | local smoke | `POST /chatwoot-webhook` trả 404. |
| Env example | PASS | `backend/.env.example` | Có `APP_BASE_URL`, `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID`. |
| Baseline validation | PASS | backend quality, Prisma validate, dashboard typecheck | Không sửa source để làm đẹp readiness. |
| Local runtime smoke | PASS | backend 3001 hiện có | Health/webhook/settings/prompts/channel/quick-reply/campaigns/analytics PASS; admin tạm cleanup. |
| Docker API | WARNING | `docker version`, `docker ps` | Docker Desktop API trả 500/time-out; port DB/backend vẫn listen. |
| Public HTTPS smoke | NOT RUN | `STAGING_BASE_URL_NOT_SET` | Không tự đoán URL, không dùng docs stale. |
| Public staging URL | MISSING | scan docs/example | Chỉ có placeholder `https://your-domain.com`; chưa claim staging ready. |
| Meta verify challenge | PENDING | chưa gọi Meta Developer | Chỉ người vận hành có secret thật mới verify. |
| Meta POST event thật | PENDING | prompt không gọi Meta/Facebook external | Chưa claim nhận event thật. |
| Log PII policy | NEEDS REVIEW | `handler.js` log sender/message text | Cần redaction/policy trước POST event thật. |
| Source/schema/package/dashboard | Unchanged | diff guard | Không sửa `backend/src/**`, `dashboard/src/**`, Prisma/package/Docker/script. |

Kết luận: đủ checklist và local baseline để chuẩn bị staging, nhưng chưa có public HTTPS URL thật nên verdict là PASS WITH WARNINGS, không phải Meta verified hoặc production ready.

## Prompt 21D Update - Docs Index + Stale Docs / Legacy Cleanup Plan (PASS)

Ngày cập nhật: 2026-07-12

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Current docs index | Created | `docs/CURRENT_STATUS_INDEX.md` | Nguồn vào hiện tại cho status/architecture/webhook/deploy/quality. |
| Historical docs index | Created | `docs/HISTORICAL_DOCS_INDEX.md` | Phân loại reports/root stale docs và cách đọc tài liệu cũ. |
| Stale root docs header | Done | `MULTITENANT_PROGRESS.md`, `ROADMAP.md` | Chỉ thêm header, không rewrite nội dung lịch sử. |
| Legacy empty dirs audit | Done | `backend/src/chatwoot`, `backend/src/adapters`, `backend/src/infrastructure/integrations/chatwoot` | Cả 3 rỗng và đã xóa; không có Git diff vì thư mục rỗng không tracked. |
| Script legacy audit | Done | `start-all.bat`, `start_all.bat`, `stop-all.bat` | Còn Chatwoot local legacy; không sửa vì ngoài scope 21D. |
| False Meta/production claims | None in current docs | Safety scan | Current docs đều ghi pending/không claim; historical docs giữ nguyên. |
| Runtime source changed | No | diff guard | Không sửa `backend/src/**/*.js` hoặc `dashboard/src/**`. |
| Schema/package changed | No | diff guard | Không sửa Prisma schema/migrations/package. |
| External call | No | command audit | Không gọi Meta/Facebook/Telegram/Gemini/Jina/LLM thật. |

Kết luận: docs clarity được cải thiện, stale root docs đã gắn nhãn, legacy empty dirs đã cleanup an toàn. Phase 21 vẫn Started.

## Prompt 21B-3 Update - Backend Route Consolidation campaigns read (PASS)

Ngày cập nhật: 2026-07-12

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Candidate selection | Done | Audit `campaigns` và `stats` | Chọn `campaigns` vì prompt ưu tiên nếu GET list/detail đủ an toàn; `stats` để lại. |
| Route đã tách | Done | `GET /api/campaigns`, `GET /api/campaigns/:id` | Platform-only, read-only. |
| Repository | Created | `backend/src/infrastructure/repositories/campaigns.repository.js` | `findMany` order `createdAt desc`, `findById`; không Express/env. |
| Controller | Created | `backend/src/presentation/http/controllers/dashboard/campaigns.controller.js` | Giữ 200/404/500 và JSON shape cũ. |
| Routes factory | Created | `backend/src/presentation/http/routes/dashboard/campaigns.routes.js` | Inject `authMiddleware`, `platformAdminOnly`, `prisma`. |
| `dashboard.js` | Modified | require + `router.use('/campaigns', ...)` | POST/upload/PUT/DELETE giữ nguyên; không duplicate GET. |
| API contract | Preserved | path/method/auth/status/response | `platformAdminOnly` giữ nguyên; list trả array; detail trả object hoặc 404 `Not found`. |
| Secret/external/mutation/raw SQL | None for selected GET | Schema `Campaign` + source audit + smoke | `assets` là JSON domain data, không token/credential field theo schema; không external. |
| Runtime smoke | PASS | app tạm mount source mới + process 3001 regression | 401/403/200/404 campaigns; regression prompts/settings/channel/quick-reply/analytics/webhook/chatwoot. |
| Cleanup | PASS | admin tạm leftover = 0 | Không in token/credential/secret. |
| Dashboard/schema/package | Unchanged | diff guard | Không sửa `dashboard/src`, Prisma schema/migrations hoặc package. |

Kết luận: consolidation route read-only thứ 3 hoàn tất, behavior giữ nguyên. Bước tiếp theo: 21B-4 cho route backend read-only nhỏ khác nếu còn candidate an toàn, hoặc 21D docs/legacy, hoặc 21C dashboard content-packages với action migrate bị khóa.

## Prompt 21R Update - Local Runtime Readiness + Webhook Smoke (PASS)

Ngày cập nhật: 2026-07-12

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Docker readiness | PASS | `docker version` client/server OK | Không chạy `docker compose up`. |
| DB container | PASS | `bbotech-pgvector-local` Up, `5433->5432` | Không tạo container mới. |
| DB port 5433 | PASS | `Test-NetConnection localhost:5433` true | Local DB ready. |
| Prisma migrate status/deploy | PASS | schema up to date, no pending migrations | Chỉ dùng `migrate status/deploy`, không `db push`. |
| Backend health | PASS | existing process port `3001`, `/health` 200 | Prompt không start/kill backend. |
| Webhook wrong-token/empty verify | PASS | `GET /webhook` -> 403 | Không thử token thật. |
| Legacy Chatwoot webhook | PASS | `POST /chatwoot-webhook` -> 404 | No-Chatwoot target giữ đúng. |
| Login local admin smoke | PASS | temp admin login 200, token exists | Không in credential/token, cleanup leftover 0. |
| Settings webhook config | PASS | `GET /api/settings/webhook` -> 200 | Secret fields chỉ kiểm trạng thái mask/null, không in giá trị. |
| Prompts regression | PASS | `GET /api/prompts` -> 200 array | Read-only smoke. |
| Channel configs regression | PASS | `GET /api/channel-configs` -> 200 array | Route 21B-2 vẫn OK. |
| Quick reply menus regression | PASS | `GET /api/quick-reply-menus` -> 200 array | Route 21B vẫn OK. |
| Analytics optional | PASS | `GET /api/analytics?days=7` -> 200 shape OK | Read-only. |
| No source changed | Confirmed | final source diff guard | Chỉ docs/report. |
| No external call | Confirmed | không POST `/webhook`, không provider/menu/Telegram test | Không claim Meta connected. |

Kết luận: local runtime/webhook smoke đã PASS, đủ an toàn để tiếp tục Prompt 21B-3 nếu chỉ chọn route read-only/low-risk.

## Prompt 21S Update - Project goals + Facebook webhook readiness status sync (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-12

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Goal status captured | Done | `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md` | Ghi rõ product/architecture/security/runtime/structure/devops/webhook goals. |
| No-Chatwoot target | Confirmed | Phase 17 docs + `docs/DEPLOYMENT_POLICY.md` | Target là direct Facebook -> backend Express, không dùng Chatwoot. |
| Real Meta callback endpoint | Confirmed | `backend/src/index.js`, `backend/src/webhook/handler.js` | Callback thật là `GET/POST /webhook`, không phải `/api/settings/webhook`. |
| Dashboard webhook config endpoint | Confirmed | `settings.routes.js`, `settings.controller.js` | `GET /api/settings/webhook` có auth, trả secret mask/null + `webhookUrl`; chỉ là config/read endpoint. |
| Source route readiness | DONE | Code route + handler read | Có thể claim source route readiness. |
| Local smoke status | PASS WITH WARNINGS | Docker daemon unavailable, DB 5433/backend 3001 không listen | Không fake local runtime smoke mới trong 21S. |
| Prior local smoke evidence | Available | Reports 21B/21B-2/10C | `/webhook` sai/thiếu verify token -> 403; `/chatwoot-webhook` -> 404. |
| Public HTTPS/staging | STAGING_PENDING | Deploy docs yêu cầu `https://<domain>/webhook` | Chưa có public URL smoke trong 21S. |
| Meta Developer verification | META_PENDING | Không có callback/challenge thật trong docs/report | Không claim Meta connected/verified. |
| Production rollout | PRODUCTION_PENDING | Rollout checklist yêu cầu backup + migrate deploy + smoke prod | Không claim production ready. |
| No external call | Confirmed | Lệnh chạy chỉ local validation/git/port check | Không gọi Facebook/Telegram/Gemini/Jina/LLM thật. |
| No source changed | Confirmed | Final source diff guard | Chỉ docs/report. |
| Schema/migration/package | Unchanged | Git diff guard | Không sửa Prisma/package/Docker/script. |

Kết luận: trạng thái mục tiêu và readiness đã được đồng bộ. Có thể nói source/local-route readiness có bằng chứng, nhưng Meta Developer verification và production rollout vẫn pending.

## Prompt 21B-2 Update - Backend Route Consolidation channel-configs read (PASS)

Ngày cập nhật: 2026-07-11

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Route được chọn | Done | `GET /channel-configs` + `/:id` | READ_ONLY_LOW_RISK; soi A/B/C chọn A. |
| Secret exposure check | None | schema + smoke `secretFields=NONE` | ChannelConfig/TenantChannelConfig không có token/secret. |
| Controller tách | Created | `presentation/http/controllers/dashboard/channelConfigs.controller.js` | List + detail. |
| Routes factory | Created | `presentation/http/routes/dashboard/channelConfigs.routes.js` | `router.use('/channel-configs')`. |
| Repository | Created | `infrastructure/repositories/channelConfigs.repository.js` | Dual-model tenant/global + mismatch→404; không Express/env. |
| dashboard.js | Modified | mount thay 2 GET; POST/PUT/DELETE giữ nguyên | Fall-through smoke PASS. |
| API contract | Preserved | path/method/auth/response | `authMiddleware`+`getTenantScope`, JSON không đổi. |
| Static validation | PASS | `node --check`, `npm run quality`, `prisma validate` | — |
| Runtime smoke | PASS | backend 3001 + DB local | 401 no-token, 200 list, 404 detail id ảo, regression + 21B PASS. |
| External/mutation/raw SQL | None | smoke chỉ read GET | Không gọi Facebook/Telegram/LLM thật. |
| Dashboard/schema/package | Unchanged | git diff | Chỉ backend/src + docs/report. |

Kết luận: consolidation route read-only thứ 2 hoàn tất, behavior giữ nguyên. Bước tiếp: 21B-3 (campaigns/stats read) hoặc 21C/21D.

## Prompt 21B Update - Backend Route Consolidation quick-reply-menus read (PASS)

Ngày cập nhật: 2026-07-11

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Route được chọn | Done | `GET /quick-reply-menus` + `/:id` | READ_ONLY_LOW_RISK, tenant guard sẵn (07C). |
| Controller tách | Created | `presentation/http/controllers/dashboard/quickReplyMenus.controller.js` | List + detail, giữ HTTP concern. |
| Routes factory | Created | `presentation/http/routes/dashboard/quickReplyMenus.routes.js` | `router.use('/quick-reply-menus')` mount. |
| Repository | Created | `infrastructure/repositories/quickReplyMenus.repository.js` | `findManyForScope`/`findByIdForScope`, không import Express/env. |
| dashboard.js | Modified | mount thay 2 GET; POST/PUT/DELETE giữ nguyên | Fall-through smoke PASS. |
| API contract | Preserved | path/method/auth/response shape | `authMiddleware`+`getTenantScope`, không đổi JSON. |
| Static validation | PASS | `node --check`, `npm run quality`, `prisma validate` | — |
| Runtime smoke | PASS | backend 3001 + DB local | 401 no-token, 200 list, 404 detail id ảo, regression PASS. |
| External call | None | smoke chỉ read GET | Không gọi Facebook/Telegram/LLM thật. |
| Dashboard/schema/package | Unchanged | git diff | Chỉ backend/src + docs/report. |

Kết luận: consolidation route read-only thứ 1 hoàn tất, behavior giữ nguyên. Bước tiếp: 21B-2 (campaigns/channel-configs read) hoặc 21C/21D.

## Prompt 21A Update - Project Structure Consolidation Audit/Plan (PASS)

Ngày cập nhật: 2026-07-11

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Structure audit | Done | `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` | Map backend/dashboard/docs/report/scripts. |
| No source runtime changed | Confirmed | `git diff --name-status` docs/report only | Không move file, không rename, không đổi import. |
| Baseline validation | PASS | backend quality+prisma validate, dashboard typecheck+build | Read-only, không mutation. |
| Backend monolith mapped | Done | `api/dashboard.js` 2363 LOC / 96 route | Mới rút ~5 route sang presentation. |
| Dashboard split status | Done | 4/13 page orchestrator mỏng | analytics/prompts/staff/appointments; còn lại placeholder. |
| Active risks mapped | Done | Plan mục 5 | start-all.bat Chatwoot, docs stale, settings direct fetch, dashboard.js. |
| Legacy dirs flagged | Done | `src/chatwoot`, `src/adapters`, `integrations/chatwoot` rỗng | Cleanup đề xuất 21D, không xóa ở 21A. |
| Raw SQL / destructive scan | Clean | rg scan | 0 `$queryRawUnsafe`, 0 destructive thật. |
| Next prompt proposal | Done | Plan mục 12 | 21B backend / 19E content-packages locked. |
| Production readiness | Not ready | Plan mục 11 | Rollout thật chưa chạy; chỉ local/staging improved. |

Kết luận: audit/plan-only hoàn tất, không đổi source runtime. Next: Prompt 21B (backend route consolidation nhỏ) hoặc 19E (content-packages locked).

## Prompt 19D Update - Dashboard Appointments Feature Split (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-11

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Appointments page split | Done | `appointments/page.tsx` 131->37 dòng | Page chỉ còn orchestrator gọi hook + components. |
| Data/state hook | Created | `features/appointments/hooks/useAppointments.ts` | Giữ selected tenant reload, list, loading, page, status filter, update status. |
| Components tách | Created | `features/appointments/components/*` | Header, filters, loading, empty, list, card, status badge, pagination. |
| Types/formatters | Created | `features/appointments/types.ts`, `lib/appointmentFormatters.ts`, `index.ts` | Appointment type, status filter options, badge map, date format. |
| UI/text/layout | Preserved | source diff + route smoke | Không redesign, không đổi className/text có chủ đích. |
| API contract | Unchanged | focused rg scan | Vẫn dùng `appointmentsApi.list/update`; không thêm fetch trực tiếp hoặc external call. |
| Mutation/notification policy | NOT RUN BY DESIGN | backend route audit | `PUT /appointments/:id` có thể gọi appointment notifications khi đổi status/notes. |
| Dashboard validation | PASS | `npm run quality`, `npm run typecheck`, `npm run build` | Chạy baseline và sau refactor. |
| Runtime route smoke | PASS | fresh dev server `3019` | `/dashboard/appointments` và route dashboard trọng yếu không 500/chunk error. |
| Backend/read smoke | PASS | backend port `3001` | Health/login/prompts/handoff/analytics/webhook/legacy + appointments GET PASS. |

Kết luận: Appointments feature split hoàn tất, nhưng mutation status smoke không chạy để tránh notification/external side effect thật.

## Prompt 19C Update - Dashboard Staff Feature Split (PASS)

Ngày cập nhật: 2026-07-11

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Staff page split | Done | `staff/page.tsx` 205->50 dòng | Page chỉ còn orchestrator gọi hook + components. |
| Data/state hook | Created | `features/staff/hooks/useStaff.ts` | Giữ load, modal state, create/update/delete, toggle active/on-duty, toast, confirm. |
| Components tách | Created | `features/staff/components/*` | Header, guide, form modal, loading, empty state, list. |
| Types/formatters | Created | `features/staff/types.ts`, `lib/staffFormatters.ts`, `index.ts` | Staff type, form payload, initial/date formatter. |
| UI/text/layout | Preserved | source diff + route smoke | Không redesign, không đổi className/text có chủ đích. |
| API contract | Unchanged | focused rg scan | Vẫn dùng `staffApi.list/create/update/delete`; không thêm fetch trực tiếp hoặc external call. |
| Mutation policy | PASS | staff API smoke 13/13 | Test prefix `Prompt 19C Test Staff`, cleanup leftover = 0. |
| Dashboard validation | PASS | `npm run quality`, `npm run typecheck`, `npm run build` | Chạy baseline và sau refactor. |
| Runtime route smoke | PASS | fresh dev server `3019` | `/dashboard/staff` và route dashboard trọng yếu không 500/chunk error. |
| Backend smoke | PASS | backend port `3001` | Health/login/prompts/handoff/analytics/webhook/legacy + staff mutation PASS. |

Kết luận: Staff feature split hoàn tất, giữ nguyên global staff semantics hiện tại. Prompt tiếp theo cần tiếp tục mutation-safe smoke nếu chọn page có create/update/delete.

## Prompt 19B Update - Dashboard Prompts Feature Split (PASS)

Ngày cập nhật: 2026-07-11

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Prompts page split | Done | `prompts/page.tsx` 317->51 dòng | Page chỉ còn orchestrator gọi hook + components. |
| Data/state hook | Created | `features/prompts/hooks/usePrompts.ts` | Giữ `selectedTenantId` reload, loading, modal state, create/update/delete, toast, confirm. |
| Components tách | Created | `features/prompts/components/*` | Header, tabs, form modal, loading, empty state, list. |
| Types/formatters | Created | `features/prompts/types.ts`, `lib/promptFormatters.ts`, `index.ts` | TABS, intent map, default layer/intent, filter/count. |
| UI/text/layout | Preserved | source diff + route smoke | Không redesign, không đổi className/text có chủ đích. |
| API contract | Unchanged | focused rg scan | Vẫn dùng `promptsApi.list/create/update/delete`; không thêm fetch trực tiếp hoặc provider call. |
| Backend/package/schema | Unchanged | `git diff --name-status` | Không sửa backend source, package, Prisma schema/migration. |
| Dashboard validation | PASS | `npm run quality`, `npm run typecheck`, `npm run build` | Chạy trước và sau refactor. |
| Runtime route smoke | PASS | fresh dev server `3019` | `/dashboard/prompts` và route dashboard trọng yếu không 500/chunk error. |
| Backend smoke | PASS | backend port `3001` | Health/login/prompts/handoff/analytics/webhook/legacy 7/7 PASS. |

Kết luận: Prompts feature split đã hoàn tất theo pattern Phase 19, không đổi behavior. Điểm còn mở là tiếp tục tách page nhỏ tiếp theo với route smoke thật sau mỗi lần split.

## Prompt 19A Update - Dashboard Analytics Feature Split (PASS)

Ngày cập nhật: 2026-07-10

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Analytics page split | Done | `analytics/page.tsx` 374→54 dòng | Orchestrator mỏng: gọi hook + render components. |
| Data hook | Created | `features/analytics/hooks/useAnalytics.ts` | Giữ nguyên loading/error/data + filter days; gọi `analyticsApi.get`. |
| Components tách | Created | `features/analytics/components/*` (9 file) | Filters, SummaryCards, BotVsHandoff, IntentDistribution, StaffResponseTimes, HourlyActivity, DailyActivity, HandoffStatus, FallbackAnalysis. |
| Types/formatters | Created | `features/analytics/types.ts`, `lib/formatters.ts`, `index.ts` | `Analytics` type + `formatTime`/`getHandoffRate`/INTENT maps. |
| UI/text/layout | Preserved | git diff | Không đổi text/className/layout; chỉ componentize. |
| API contract | Unchanged | rg scan | Chỉ `analyticsApi.get` read-only; không POST/PUT/DELETE/fetch mới. |
| Backend/dependency | Unchanged | — | Không sửa backend/api.ts/package/dependency. |
| Dashboard quality | PASS | `npm run quality` | typecheck + build 19 routes; `/dashboard/analytics` build OK. |

## Prompt 10C Update - Quality Gate + Phase 19 Readiness (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-10

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Quality script audit | Done | `backend/package.json`, `dashboard/package.json` | Backend: không lint/typecheck; Dashboard: `next lint` (interactive). |
| ESLint availability | Missing | `node_modules` check | Không có `eslint`/`eslint-config-next` ở cả 2; không config file. |
| Backend quality script | Added | `npm run quality` = `syntax`+`prisma:validate` | `node --check` 6 file + `prisma validate`; không thêm dependency. |
| Dashboard quality script | Added | `npm run quality` = `typecheck`+`build` | `tsc --noEmit` + `next build`; không thêm dependency. |
| Backend quality run | PASS | `npm run quality` (backend) | syntax + prisma validate PASS. |
| Dashboard quality run | PASS | `npm run quality` (dashboard) | typecheck exit 0; build 17 routes PASS. |
| Dashboard lint non-interactive | BLOCKED (dependency) | — | ESLint chưa cài → OPTION C; hướng dẫn cài ở `docs/QUALITY_GATE.md`; không tự install. |
| Production smoke dry-run (local) | PASS 9/9 | temp admin `test-10c-*`, backend :3001 | `/health` 200; login 200+token; `/api/prompts`(token) 200; `/api/settings/handoff`(token) 200; no-token 401; `/webhook` 403; `/chatwoot-webhook` 404; knowledge insert content-first OK; cleanup=0. |
| Phase 19 readiness | Done | `docs/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md` | Candidate #1 = `analytics/page.tsx` (read-only, 374 LOC, backend harden 09B). Chưa sửa page. |
| Docs quality gate | Created | `docs/QUALITY_GATE.md` | Required checks + lint status + smoke link. |
| Destructive scan | Clean | rg scripts/docker/package | Không executable; chỉ comment historical. |

## Prompt 10B Update - DevOps Deploy Hardening + Embedding Drift Fix (PASS)

Ngày cập nhật: 2026-07-10

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Embedding drift audit | Done | `information_schema` + migrations | DB `knowledge_base.embedding` NOT NULL (init migration `vector(768) NOT NULL`); schema Prisma `Unsupported("vector")?` nullable → drift. 0 rows, 0 vector index. |
| Drift strategy | OPTION A | RAG search filter `embedding IS NOT NULL` | DB align theo schema nullable; RAG đã tolerate null embedding, add-path dùng fallback vector. |
| Backup local | Done | `backups/prompt-10b-before-embedding-drift-fix-<ts>.dump` | pg_dump -Fc, size>0, TOC đọc được, **không commit** (gitignored). |
| Migration mới | Created + applied | `backend/prisma/migrations/20260710154312_align_knowledge_embedding_nullable` | `ALTER TABLE knowledge_base ALTER COLUMN embedding DROP NOT NULL`; `migrate deploy` local PASS; cột giờ nullable. |
| Drift smoke | PASS 9/9 | Prisma create/read/delete + `$queryRaw` | Insert content-first không embedding OK; embedding NULL trong DB; findMany không crash; cleanup leftover=0. |
| `start-all.bat` destructive | Closed | `start-all.bat` | Bỏ `prisma db push --accept-data-loss` → `prisma migrate deploy` + guard banner LOCAL ONLY / DO NOT USE FOR PRODUCTION. |
| Docker migration startup | Closed | `backend/Dockerfile` | CMD chỉ `node src/index.js`; migration là release step riêng. |
| `webhook-urls-current.txt` | Hardened | file header | Warning local/stale + trỏ direct `/webhook` No-Chatwoot + docs. |
| Deploy docs | Created | `docs/DEPLOYMENT_POLICY.md`, `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` | Backup/migrate/rollback/health/webhook checklist. |
| Static validation | PASS | backend `node --check` (6 files), `prisma validate`, dashboard `tsc --noEmit`, `docker compose config` | |
| Regression smoke | PASS | backend :3001 | `/health` 200; `/webhook` no-token 403; `/chatwoot-webhook` 404. |
| Destructive scan | Clean | rg `db push\|accept-data-loss` | Không còn executable; còn lại chỉ docs/reports/comment historical. |
| Production rollout thật | NOT RUN | — | Chỉ local/test; production để release step theo checklist. |

## Prompt 10A Update - Seed Raw SQL Cleanup + Progress Sync (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-10

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Seed raw SQL audit | Done | `backend/scripts/seed.js` | 1 `$queryRawUnsafe` (INSERT knowledge_base, escaping thủ công `replace(/'/g,"''")`). |
| Convert sang Prisma API | Done | `prisma.knowledgeBase.create()` | Bỏ raw SQL + escaping; input parameterize; giữ data shape (title/content/category/sourceType/sourceUrl/isActive). |
| Unsafe raw SQL trong `backend/scripts` | Closed | rg scan | 0 match `$queryRawUnsafe`/`$executeRawUnsafe`. |
| Unsafe raw SQL trong `backend/src` | Closed | rg scan | Chỉ còn 1 dòng README documentation-only. |
| Static validation | PASS | backend `node --check` (6 files), `prisma validate`, dashboard `tsc --noEmit` | |
| Seed execution | NOT RUN (by design) | Option A | Seed mutate DB rộng → không chạy thật. |
| Behavior parity | Verified | psql rollback + Prisma rollback | Cả raw SQL cũ lẫn Prisma create mới đều dừng ở cùng constraint DB (embedding NOT NULL) → behavior không đổi. |
| Drift phát hiện | Logged (out of scope) | `information_schema` | `knowledge_base.embedding` DB = NOT NULL nhưng schema Prisma = `Unsupported("vector")?` nullable → knowledge_base seed insert fail từ trước (pre-existing). Để Prompt 10B/DevOps. |

## Prompt 09C Update - Tenant Handoff Raw SQL Hardening (PASS)

Ngày cập nhật: 2026-07-10

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Handoff raw SQL audit | Done | `backend/src/tenants/handoff.js` | 1 `$queryRawUnsafe` trong `getHandoffAnalytics` (group-by-day). |
| Convert sang tagged template | Done | `$queryRaw` | Parameterize `tenantId` + `since` (Date); giữ query/response shape. |
| Period sanitize | Verified | switch enum `24h/7d/30d`+default | Không đưa raw string vào SQL. |
| Tenant scope | Preserved | `WHERE tenant_id = ${tenantId}` | Không bỏ tenant filter. |
| Static validation | PASS | backend `node --check` (7 files), `prisma validate`, dashboard `tsc --noEmit` | |
| Module smoke | PASS 10/10 | script tạm, DB local | Isolation A/B, invalid/null period no-crash, injection tenantId→0 rows, cleanup leftover=0. |
| No external call | Verified | `getHandoffAnalytics` chỉ đọc DB | Không gọi Telegram/Facebook thật. |
| Unsafe còn lại trong handoff.js | 0 | rg scan | Còn `backend/scripts/seed.js` (ngoài phạm vi). |

## Prompt 08G Update - Login Auth Production Readiness Fix (PASS)

Ngày cập nhật: 2026-07-10

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Nguyên nhân login fail | Diagnosed | Diagnostic controlled (boolean, không in secret) | Hash admin DB local stale, không khớp `ADMIN_PASSWORD` hiện tại/`admin123`; seed cũ không update khi env đổi. |
| Login UI cleanup | Done | `dashboard/src/app/login/page.tsx` | Bỏ "Mặc định: admin / admin123", placeholder trung tính, câu hướng dẫn an toàn. |
| Frontend bypass removal | Done | `dashboard/src/lib/auth.tsx` | Gỡ standalone fallback `admin/admin123` + fake token. |
| Backend dev self-heal | Done | `backend/src/index.js` seedDefaults | Dev-only: đồng bộ hash admin từ `ADMIN_PASSWORD`; không reset ở production. |
| Backend production guard | Done | `backend/src/index.js` `assertProductionAuthEnv()` | Fail-fast khi `JWT_SECRET`/`ADMIN_PASSWORD` yếu/thiếu (chỉ khi `NODE_ENV=production`). |
| Static validation | PASS | backend `node --check`, `prisma validate`, dashboard `tsc --noEmit`, `npm run build` | |
| Runtime login smoke | PASS 11/11 | Express app tạm, DB local | Login đúng 200+token, sai 401, token→protected 200, webhook 403, legacy 404. |
| Login UI credential scan | Clean | `dashboard/src` | 0 match `admin123`/credential mẫu/standalone. |

## Prompt 08F Update - No-Chatwoot Schema Migration Removal (PASS)

Ngày cập nhật: 2026-07-10

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| DB backup trước migration | Done | `backups/prompt-08f-before-schema-drop-<timestamp>.dump` | pg_dump custom-format từ container `bbotech-pgvector-local`, size > 0, **không commit**, `backups/` đã ignored. |
| Legacy field runtime scan | Clean | backend/src, dashboard/src | 0 phụ thuộc cột legacy; gỡ write `chatwootModel/chatwootAccountId` + strip `maskTenant` trong `backend/src/api/dashboard.js`. Chỉ còn 3 README kiến trúc (docs). |
| Schema patch | Applied | `backend/prisma/schema.prisma` | Xóa `tenants.chatwootModel/AccountId/BaseUrl/ApiTokenEnc/TeamId/webhookSecretEnc` + `conversations.chatwootConversationId`. |
| Migration mới | Created + applied | `backend/prisma/migrations/20260710025758_remove_no_chatwoot_legacy_columns` | `--create-only` rồi thay body bằng SQL drop legacy tối thiểu (auto-SQL chạm drift + `knowledge_base.embedding` nên không dùng nguyên trạng). |
| Apply local/test | PASS | `prisma migrate deploy` + `generate` + `validate` | Không `db push`, không `--accept-data-loss`, không reset; DB còn 0 cột/index legacy. |
| Static validation | PASS | backend `node --check`, `prisma validate`, dashboard `tsc --noEmit`, `npm run build` | |
| Runtime smoke | PASS 13/13 | Express app tạm, DB local | Tenant create/update payload mới không lộ field legacy; route legacy 404; webhook 403; cleanup leftover = 0. |
| Production rollout | DEFERRED | — | Cần backup + `migrate deploy` riêng trên production, ngoài phạm vi 08F. |

## Prompt 08C Update - Prisma/Env No-Chatwoot Cleanup Plan (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Backend env example | Cleaned | `backend/.env.example` | Đã xóa block `CHATWOOT_*`; giữ direct Facebook env và ghi rõ local pgvector `localhost:5433`. |
| Dashboard env example | Cleaned | `dashboard/.env.example` | Đã xóa `NEXT_PUBLIC_CHATWOOT_URL`; chỉ còn `NEXT_PUBLIC_API_URL`. |
| Backend config warning | Cleaned | `backend/src/infrastructure/services/config.js` | Không còn warning placeholder cho `CHATWOOT_API_TOKEN`/`CHATWOOT_WEBHOOK_SECRET`. |
| Env policy | Updated | `docs/ENV_POLICY.md` | Ghi rõ Chatwoot env là legacy/deprecated và không thuộc target mới. |
| Schema cleanup plan | Created | `docs/NO_CHATWOOT_SCHEMA_ENV_CLEANUP_PLAN.md` | Có bảng field legacy, migration strategy, dashboard/backend/devops blockers. |
| Prisma schema | Not changed | `backend/prisma/schema.prisma` | Không sửa schema trong Prompt 08C. |
| Prisma migrations | Not changed | `backend/prisma/migrations/**` | Không xóa migration lịch sử, không tạo migration mới. |
| Dashboard source blockers | OPEN | `dashboard/src/lib/config/env.ts`, `dashboard/src/lib/api.ts`, settings/channel-configs/tenants pages | Để Prompt 08D; 08C chỉ audit, không sửa dashboard source. |
| Backend/API blockers | OPEN | `backend/src/api/dashboard.js` tenant CRUD còn field `chatwoot*` | Cần prompt cleanup backend/API sau hoặc cùng schema-removal prep. |
| DevOps/scripts blockers | OPEN | `backend/scripts/*`, `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt` | Để Prompt 10/DevOps. |
| Static validation | PASS | backend `node --check`, `npx prisma validate`, dashboard `tsc --noEmit`, `git diff --check` | Không chạy server, không chạy migration. |
| Runtime smoke | NOT REQUIRED | Env example/config policy/docs cleanup only | Không đánh dấu runtime toàn hệ thống PASS trong 08C. |

## Prompt 08B Update - Backend Chatwoot Runtime Removal (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Backend Chatwoot webhook routes | Removed | `backend/src/index.js` không còn `POST /chatwoot-webhook` hoặc `POST /chatwoot-webhook/:slug` | Direct Facebook `GET/POST /webhook` vẫn giữ nguyên. |
| Runtime Chatwoot files | Deleted | `backend/src/webhook/chatwootHandler.js`, `backend/src/tenants/webhookHandler.js`, `backend/src/chatwoot/api.js`, `backend/src/chatwoot/crypto.js`, `backend/src/adapters/chatwootAdapter.js` | Không còn handler/client/adapter Chatwoot active trong backend runtime. |
| Dashboard backend Chatwoot API routes | Removed | `/api/settings/chatwoot-test` và `/api/channel-configs/lookup-inboxes` không còn route riêng | Runtime smoke xác nhận cả hai trả 404. |
| Credential crypto | Replaced | `backend/src/infrastructure/services/credentialCrypto.js` | Helper generic thay cho `chatwoot/crypto`; vẫn dùng để mã hóa field legacy còn trong schema. |
| Tenant registry | Cleaned | `backend/src/tenants/registry.js` | Không còn decrypt `_decryptedApiToken` hoặc `_webhookSecret` cho Chatwoot webhook. |
| Owner Telegram handoff | Cleaned | `backend/src/telegram/handoff.js` | Bỏ sync/takeover/end-session qua Chatwoot; staff outbound dùng direct Facebook `sendFBMessage` như nhánh hiện hữu. |
| Tenant handoff | Degraded safely | `backend/src/tenants/handoff.js` | Không fallback sang Chatwoot; tenant direct outbound được báo rõ là chưa implemented, tránh gọi tích hợp cũ. |
| Direct Facebook webhook | Preserved | `backend/src/index.js`, `backend/src/webhook/handler.js` | Smoke `GET /webhook` thiếu/wrong verify token trả 403, không crash. |
| Static validation | PASS | `node --check` các file backend trọng tâm và `npx prisma validate` | Không sửa Prisma schema/migrations. |
| Runtime smoke | PASS | 16/16 checks PASS bằng Express app tạm, DB local `localhost:5433` | Không gọi Facebook/Telegram/Gemini/Chatwoot thật. |
| Remaining backend source refs | Tracked | `backend/src/api/dashboard.js`, `backend/src/infrastructure/services/config.js`, README placeholder | Các ref còn lại là schema/env/docs legacy, chuyển Prompt 08C hoặc docs cleanup. |
| Out-of-scope safety | PASS | `git diff --name-status` | Không sửa env thật, env examples, dashboard frontend, package, Dockerfile, scripts, RAG/raw SQL. |

## Prompt 08A Update - No-Chatwoot Architecture Directive Intake (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| No-Chatwoot directive | Captured | `docs/NO_CHATWOOT_DIRECT_ARCHITECTURE_CONTEXT.md` | Chatwoot bị loại khỏi kiến trúc đích; không sinh thêm Chatwoot route/controller/service/model/env mới. |
| Full reference scan | Done | `rg -n -i "chatwoot"` toàn repo, bỏ `node_modules`, `.next`, `dist`, `build`, `coverage`, `.git` | Tìm thấy backend runtime, Prisma, env, dashboard, docs, report, scripts/bat. |
| Backend runtime blockers | CLOSED BY 08B | `backend/src/index.js`, `backend/src/webhook/chatwootHandler.js`, `backend/src/tenants/webhookHandler.js`, `backend/src/chatwoot/*`, `backend/src/adapters/chatwootAdapter.js`, handoff modules | Prompt 08B đã xóa route/client/adapter/webhook runtime Chatwoot; scripts/docs/schema/env/dashboard còn backlog riêng. |
| Schema/data model blockers | OPEN | `Conversation.chatwootConversationId`, `Tenant.chatwootModel/chatwootAccountId/chatwootBaseUrl/chatwootApiTokenEnc/chatwootTeamId`, migrations 20260614120000 và 20260615150000 | Cần Prompt 08C migration/data policy; không sửa schema trong 08A. |
| Env/config blockers | OPEN | `backend/.env.example`, `dashboard/.env.example`, `dashboard/src/lib/config/env.ts`, `docs/ENV_POLICY.md`, `backend/src/infrastructure/services/config.js` | Còn `CHATWOOT_*` và `NEXT_PUBLIC_CHATWOOT_URL`; target mới không được thêm biến Chatwoot. |
| Dashboard blockers | OPEN | settings/channel-configs/tenants pages và `dashboard/src/lib/api.ts` | Cần Prompt 08D để bỏ UI/API Chatwoot và đổi hướng sang Facebook direct. |
| DevOps/script blockers | OPEN | `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt`; root `scripts/` không tồn tại, `backend/scripts/` có Chatwoot helpers | Không sửa script trong 08A; cần Prompt 10/DevOps sau khi runtime/schema/dashboard rõ. |
| Direct architecture validation | WARNINGS | Backend port 3001 PASS; dashboard port 3002 PASS; local DB 5433 PASS; Prisma 5.22.0; Socket.io chưa thấy code thật | Mismatch: sample/dummy `localhost:5432` trong docs policy không khớp local pgvector `localhost:5433`; `/api/settings/webhook` không phải Meta webhook endpoint. |
| Docs/current architecture | OPEN | `docs/ARCHITECTURE.md`, `docs/ENV_POLICY.md`, `docs/FEATURE_INVENTORY.md`, `MULTITENANT_PROGRESS.md` còn mô tả Chatwoot | Tài liệu mới phải coi Chatwoot deprecated/removed target; historical docs/report không rewrite hàng loạt. |
| Historical reports | Preserved | `report/PROMPT_01...` đến `PROMPT_07D...` còn Chatwoot | Giữ để bảo toàn audit trail, không dùng làm kiến trúc đích. |
| Runtime source changed | NO | `git diff --name-status` dự kiến chỉ docs/report | Đúng phạm vi Prompt 08A. |

## Prompt 07D Update - Legacy/Global Route Authorization Classification (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Legacy/global route map | Done | Scan `router.*`, staff/handoff/analytics/facebook/chatwoot/global/raw SQL trong `backend/src/api/dashboard.js` | Phân loại theo `PLATFORM_ONLY`, `TENANT_SCOPED`, `OWNER_GLOBAL_INTEGRATION`, `LEGACY_DEPRECATE_OR_REVIEW`, `ALREADY_GUARDED`. |
| Platform-only guard | Fixed | Thêm `platformAdminOnly` cho stats, providers update/test, campaigns, global staff, Telegram write/test, handoff, Chatwoot test, Facebook pages/menu/subscription, test-message, analytics | Chỉ đổi middleware, không đổi handler logic hoặc response shape cho platform admin. |
| Already guarded | PASS | `admin-users`, parent `tenants`, tenant nested routes, conversations, detail resources, channel configs, knowledge reindex | Giữ nguyên guard từ 07A/07B/07C. |
| Tenant-scoped routes | PASS/Tracked | conversations, knowledge CRUD chính, prompts, quick replies, content packages/items, appointments, channel-configs dùng `getTenantScope` hoặc tenant guard | Không refactor trong Prompt 07D. |
| Owner/global integration | Guarded | Chatwoot test, Facebook pages/menu/subscription và test-message bị khóa platform-only | Smoke dùng mock in-memory để không gọi API thật. |
| Raw SQL routes | Classified | Analytics raw SQL đã platform-only; RAG/raw SQL trong knowledge/reindex vẫn để Prompt 08 | Không sửa raw SQL trong 07D. |
| Follow-up route | OPEN | `POST /knowledge/upload`, `POST /knowledge/scrape` chưa tenant-scoped và đi qua RAG side effect | Cần Prompt 08/07E, không vá bừa trong 07D. |
| Tenant handoff API | OPEN | Frontend khai báo `/tenants/:id/handoff/*` nhưng backend `dashboard.js` chưa có route tương ứng | Cần Prompt 07E nếu tenant handoff dashboard là yêu cầu. |
| Static validation | PASS | `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check` | Không sửa schema/migrations. |
| Runtime smoke | PASS | 79/79 checks PASS; tenant token 403 cho route patched; platform token không bị guard 403 | Platform call migration campaign được skip để tránh DB migration side effect. |
| Test data cleanup | PASS | leftover `test_07d_*` = 0 | Sample chỉ gồm prompt/conversation/message để regression 07B/07C. |

## Prompt 07C Update - Detail Resource Tenant Guard (PASS)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Knowledge detail guard | Fixed | `GET/PUT/DELETE /api/knowledge/:id` dùng ownership check theo `{ id, tenantId }` khi request có tenant scope | Cross-tenant trả `404`; PUT/DELETE cross-tenant bị chặn trước khi gọi RAG pipeline. |
| Prompts detail/write guard | Fixed | `GET/PUT/DELETE /api/prompts/:id` tenant-scoped bằng `findScopedById` hoặc pre-check `{ id, tenantId }` | `POST /api/prompts` đã scoped từ trước bằng `getTenantScope(req)`. |
| Quick reply detail/write guard | Fixed | `GET/PUT/DELETE /api/quick-reply-menus/:id` tenant-scoped bằng `{ id, tenantId }` | Cross-tenant không leak resource tồn tại. |
| Content package detail/write guard | Fixed | `GET/PUT/DELETE /api/content-packages/:id` tenant-scoped bằng `{ id, tenantId }` | Platform không có tenant scope giữ lookup theo id như cũ. |
| Content package items guard | Fixed | `GET/POST/PUT/DELETE /api/content-packages/:packageId/items...` verify parent package bằng `{ id: packageId, tenantId }` trước khi query item | `ContentPackageItem` không có `tenantId`, isolation đi qua `ContentPackage.tenantId`; tenant update/delete item ràng buộc thêm `packageId`. |
| Appointment update guard | Fixed | `PUT /api/appointments/:id` dùng `findFirst({ id, tenantId })` khi có tenant scope | Own update smoke dùng payload không đổi status/notes để không kích hoạt notification. |
| Static validation | PASS | `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check` | Không sửa schema/migrations. |
| Runtime cross-tenant smoke | PASS | 47/47 route checks PASS: own 200, cross 404, platform 200, no-token 401 | Smoke bằng Express app tạm mount `dashboardApi`, DB local `localhost:5433`. |
| Regression smoke | PASS | prompts list/layer 200, telegram destinations 200, handoff GET/PUT 200, P0 tenant staff guard 403, 07B conversation detail/messages 404 | Không start `src/index.js`, không kích hoạt startup side effect. |
| Test data cleanup | PASS | leftover `test_07c_*` = 0 cho knowledge/prompts/quick/package/items/conversations/messages/appointments | Knowledge sample dùng vector zero 768 chiều vì DB local hiện còn `embedding NOT NULL`; không sửa schema. |
| Source changed | Có, scoped | `backend/src/api/dashboard.js`, docs/report | Không sửa RAG pipeline, webhook, tenant handoff, bot, dashboard frontend, package, DevOps. |
| P1 residual | OPEN | legacy/global staff/handoff/analytics/facebook/global Chatwoot | Cần Prompt 07D nếu muốn phân loại quyền riêng. |
| P2 residual | OPEN | RAG/raw SQL và schema/runtime mismatch quanh `knowledge_base.embedding` | Chuyển Prompt 08. |

## Prompt 07B Update - Conversation Tenant Guard (PASS)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Conversation list guard | Fixed | `GET /api/conversations` dùng `getTenantScope(req)` và thêm `where.tenantId` khi có scope | Platform không có `tenantScope` vẫn giữ behavior hiện tại. |
| Conversation detail guard | Fixed | `GET /api/conversations/:id` pre-check `{ id, tenantId }` khi request có tenant scope | Cross-tenant trả `404`, success shape giữ qua `contextManager.getConversationSummary`. |
| Conversation messages guard | Fixed | `GET /api/conversations/:id/messages` pre-check conversation `{ id, tenantId }` trước khi query messages | `Message` không có `tenantId`; isolation đi qua `Conversation.tenantId`. |
| Static validation | PASS | `node --check` các file backend trọng tâm, `npx prisma validate`, `git diff --check` | Không sửa schema/migrations. |
| Runtime cross-tenant smoke | PASS | Tenant A list có conv A, không có conv B; detail/messages B → 404 | Tạo sample local tối thiểu trên DB localhost. |
| Platform behavior | PASS | Platform token detail conv A/B → 200 | Không có tenant scope thì behavior cũ giữ nguyên. |
| Regression smoke | PASS | prompts 200, prompts layer intent 200, telegram destinations 200, handoff GET/PUT 200, P0 tenant path guard 403 | Smoke bằng Express app tạm mount `dashboardApi`, không start `src/index.js`. |
| Test data cleanup | PASS | Xóa 2 messages và 2 conversations tạo bởi smoke | Không tạo tenant fake; không chạm production DB. |
| Source changed | Có, scoped | `backend/src/api/dashboard.js` | Chỉ sửa 3 route conversations. |
| Behavior-critical modules | Không đổi | Không sửa webhook/RAG/tenant handoff/bot/dashboard FE/package/DevOps | Không thêm package, không tạo PrismaClient mới. |
| P1 residual | OPEN | detail resource routes: knowledge/prompts/quick-reply/content-package/package-items/appointments | Chuyển Prompt 07C. |

## Prompt 07A Update - Tenant Authorization Hardening P0 (PASS WITH FIXES)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| P0 route scope | Fixed | 12 route `/api/tenants/:id/*` nested staff/channel-configs/knowledge/webhook-info | Không sửa route P1/P2 ngoài nhóm này. |
| Middleware guard | Done | `tenantPathAccessOnly(req,res,next)` trong `backend/src/api/dashboard.js` | Platform admin (`tenantId=null`) đi qua; tenant user chỉ đi qua khi `req.user.tenantId === req.params.id`. |
| Route wiring | PASS | Mọi nested route P0 có `authMiddleware, tenantPathAccessOnly` | Parent tenant CRUD vẫn giữ `platformAdminOnly`. |
| Child resource hardening | PASS | `TenantStaff` update/delete và `TenantChannelConfig` delete dùng `tenantId: req.params.id` | Chặn bypass bằng `sid/cid` của tenant khác trong cùng nhóm route P0. |
| Static validation | PASS | `node --check` các file backend trọng tâm, `npx prisma validate` | Không sửa schema/migrations. |
| Runtime denied smoke | PASS | Tenant token gọi tenant khác: staff/webhook-info/PUT staff → 403 | JWT ký trong memory, không in token/secret. |
| Runtime allow smoke | PASS | Tenant token gọi cùng tenant staff → 200; platform token gọi staff → 200 | Không tạo tenant fake trong DB; list rỗng là behavior hiện hữu khi tenant id không có dữ liệu. |
| Regression smoke | PASS | `/api/prompts` 200 len=7; `?layer=intent` 200 len=6; telegram destinations 200; handoff GET/PUT 200 | Smoke bằng Express app tạm mount `dashboardApi`, không start `src/index.js`. |
| Source changed | Có, scoped | `backend/src/api/dashboard.js` | Chỉ sửa P0 guard trong dashboard API. |
| Behavior-critical modules | Không đổi | Không sửa webhook/RAG/tenant handoff/bot/dashboard FE/package/DevOps | Không thêm package, không tạo PrismaClient mới. |
| P1 residual | OPEN | conversations/detail/messages/detail resource routes | Chuyển Prompt 07B. |

## Prompt 07 Update - Tenant Safety Audit + Local DB Preflight (NEEDS FIX)

Ngày cập nhật: 2026-07-09

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Git/env preflight | PASS | Working tree sạch trước docs edit; `.env`/`.env.local` vẫn gitignored | Không in secret, không commit env. |
| Local DB preflight | PASS | `bbotech-pgvector-local` running, port `5433` listening, PostgreSQL ready | Lỗi P1001 được gỡ ở preflight vì DB local đã chạy. |
| Backend runtime availability | PASS | Port `3001` đã có backend process trước prompt | Dùng process hiện có; prompt không stop process này. |
| Static backend validation | PASS | `node --check` các file dashboard/settings/prompts/repository/tenant/webhook/RAG/bot trọng tâm | Không sửa source runtime. |
| Prisma validate | PASS WITH TOOLCHAIN NOTE | Prisma CLI local backend `5.22.0` PASS từ thư mục `backend` | `npx prisma` từ root dùng CLI `7.8.0` nên fail do schema Prisma 5 còn `url = env(...)`. |
| Runtime smoke default/local | PASS | no-token `/prompts` 401; prompts 200 len=7; intent 200 len=6; telegram destinations 200; handoff GET/PUT 200 | JWT local ký trong memory, không in token/credential. |
| Tenant runtime sample | Not verified | Local DB: `tenants=0`, `tenantPrompts=0`, `tenantConversations=0` | Cross-tenant behavior chỉ audit tĩnh trong Prompt 07. |
| Prompt list tenant scope | PASS | `GET /api/prompts` qua repository `findManyForScope({ tenantId, layer })` | Tenant admin bị lock bởi `getTenantScope(req)`; platform dùng `tenantScope` query. |
| Tenant webhook isolation | PASS | Tenant webhook resolve bằng slug, conversation query/create có `tenantId` | Handoff tenant có nhiều guard tenant trong claim/takeover. |
| Nested tenant routes | P0 NEEDS FIX | `/api/tenants/:id/staff`, `/channel-configs`, `/knowledge`, `/webhook-info` chỉ có `authMiddleware` | Thiếu platform/ownership guard cho `req.params.id`; có read/write/delete cross-tenant risk. |
| Conversation/detail routes | P1 NEEDS FIX | `/conversations`, `/conversations/:id`, `/messages`, detail knowledge/prompts/menu/package | List có nơi scoped, nhưng detail/read hoặc message route còn dùng id trực tiếp. |
| Legacy global routes | P1/P2 OPEN | legacy staff/handoff/analytics/facebook/global Chatwoot routes | Cần khóa platform-only hoặc tách owner/global vs tenant rõ ràng. |
| Source runtime changed | Không | Chỉ docs/report | Không sửa schema/migrations/webhook/RAG/handoff/bot/dashboard frontend/package/DevOps. |

## Prompt 06C Update - Prompts Repository + Tenant Scope Checklist (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Prompt templates repository | Done | `backend/src/infrastructure/repositories/promptTemplates.repository.js` | Method: `findManyForScope({ tenantId, layer })`. |
| Controller dùng repository | Done | `createListPromptTemplates` nhận `promptTemplatesRepository` | Controller vẫn lấy `layer` và gọi `getTenantScope(req)` như cũ; không gọi Prisma trực tiếp. |
| Tenant filter giữ nguyên | PASS | `where = { tenantId: tenantId ?? null }`; nếu có `layer` thì thêm `where.layer = layer` | Không đổi default/global prompt behavior; không thêm filter tenant mới. |
| Query/order giữ nguyên | PASS | `orderBy: [{ layer: 'asc' }, { intentType: 'asc' }]`; không select/include | Không raw SQL, không external API. |
| Route inject dependency | Done | `prompts.routes.js` tạo repository từ `prisma` được truyền vào | Giữ `createPromptRoutes({ authMiddleware, getTenantScope, prisma })`. |
| Dependency rule | PASS | Repository không import Express/process.env/domain; không tạo PrismaClient mới | Đây là bước infrastructure repository, chưa tạo use case/domain interface. |
| Static validation | PASS | `node --check` 12 file backend gồm repository mới, `npx prisma validate`, `git diff --check` | Không sửa schema/migrations. |
| Runtime prompts | PASS WITH WARNINGS | no-token `/prompts` → 401; `/prompts` 200 array len=7; `/prompts?layer=intent` 200 array len=6 | Runtime verified default/local scope only. |
| Tenant isolation full | Not verified | Local DB: `tenant_count=0`, `tenant_prompt_count=0` | Prompt 07 vẫn bắt buộc để audit tenant scope toàn hệ thống. |
| Regression routes | PASS | `webhook` 200, `telegram-destinations` 200, handoff GET/PUT 200 | Không đổi public API contract. |
| Prompt detail/write routes | Không đổi | `GET /prompts/:id`, `POST/PUT/DELETE /prompts` còn trong `dashboard.js` | Không tách trong Prompt 06C. |
| Behavior-critical modules | Không đổi | Không sửa webhook/RAG/tenant handoff/dashboard FE/DevOps/package | Chỉ sửa repository/controller/route prompts read. |

## Prompt 06B Update - Telegram Destinations Repository (PASS)

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Telegram destinations repository | Done | `backend/src/infrastructure/repositories/telegramDestinations.repository.js` | Method: `findAll`; giữ `orderBy: purpose asc, name asc`. |
| Controller dùng repository | Done | `createGetTelegramDestinations` nhận `telegramDestinationsRepository` | Response `{destinations, envFallback}` giữ nguyên; `envFallback.statusGroupIdConfigured` vẫn xử lý ở controller. |
| Route inject dependency | Done | `settings.routes.js` tạo repository từ `prisma` được truyền vào | Không tạo PrismaClient mới; giữ `createSettingsRoutes({ authMiddleware, prisma })`. |
| Dependency rule | PASS | Repository không import Express/process.env/domain; domain không phụ thuộc Prisma | Đây là bước infrastructure repository, chưa tạo use case/domain interface. |
| Static validation | PASS | `node --check` 11 file backend gồm repository mới, `npx prisma validate`, `git diff --check` | Không sửa schema/migrations. |
| Runtime telegram destinations | PASS | no-token GET → 401; có token local ký trong memory → 200 `{destinations, envFallback}` | Không in credential/token. |
| Regression routes | PASS | `webhook` 200, handoff GET/PUT 200, `prompts` 200 array len=7 | Không đổi public API contract. |
| Telegram write/test routes | Không đổi | `POST/PUT/DELETE /settings/telegram-destinations` và `POST /settings/telegram-destinations/:id/test` còn trong `dashboard.js` | Không gọi route test Telegram trong smoke. |
| Behavior-critical modules | Không đổi | Không sửa webhook/RAG/tenant handoff/dashboard FE/DevOps/package | Chỉ sửa repository/controller/route settings read. |

## Prompt 06 Update - Repository Layer Phase 1 (PASS)

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Handoff settings repository | Done | `backend/src/infrastructure/repositories/handoffSettings.repository.js` | Methods: `findSingleton`, `createDefault`, `upsertSingleton`. |
| Controller dùng repository | Done | `createGetHandoffSettings` và `createPutHandoffSettings` nhận `handoffSettingsRepository` | Controller vẫn giữ HTTP concern, không gọi Prisma handoff trực tiếp. |
| Route inject dependency | Done | `settings.routes.js` tạo repository từ `prisma` được truyền vào | Không tạo PrismaClient mới; giữ `createSettingsRoutes({ authMiddleware, prisma })`. |
| Dependency rule | PASS | Repository không import Express/process.env/domain; domain không phụ thuộc Prisma | Đây là bước trung gian infrastructure repository, chưa tạo use case. |
| Static validation | PASS | `node --check` 10 file backend gồm repository mới, `npx prisma validate`, `git diff --check` | Không sửa schema/migrations. |
| Runtime handoff | PASS | no-token GET/PUT → 401; GET/PUT/GET-after-PUT có token → 200 | PUT payload chỉ gồm field schema hợp lệ. |
| Regression routes | PASS | `webhook` 200, `telegram-destinations` 200, `prompts` 200 array len=7 | Không đổi public API contract. |
| Behavior-critical modules | Không đổi | Không sửa webhook/RAG/tenant handoff/dashboard FE/DevOps/package | Chỉ sửa repository/controller/route settings handoff. |

## Prompt 05E Update - Split PUT Handoff Settings Route (PASS)

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| `PUT /settings/handoff` route split | Done | `router.put('/handoff', authMiddleware, createPutHandoffSettings({ prisma }))` trong `settings.routes.js` | Public route vẫn là `/api/settings/handoff`. |
| Controller settings mở rộng | Done | `createPutHandoffSettings({ prisma })` trong `settings.controller.js` | Move logic upsert đã fix từ Prompt 05D-FIX. |
| `dashboard.js` gỡ block PUT | Done | Direct `router.put('/settings/handoff')` đã bị gỡ | `dashboard.js` còn 2382 dòng, khoảng 96 route direct. |
| Auth no-token | Runtime verified | GET/PUT `/api/settings/handoff` không token → 401 `{error}` | Không crash. |
| Existing routes | Runtime verified PASS | `webhook` 200, `telegram-destinations` 200, `prompts` 200 array len=7 | Token lấy qua login endpoint local/test; không in credential/token. |
| Handoff GET/PUT | Runtime verified PASS | GET 200 object, PUT 200 object, GET lại sau PUT 200 | PUT payload chỉ gồm field schema hợp lệ. |
| Behavior/public contract | Preserved | Route/method/auth/status/response shape giữ nguyên | Chỉ đổi vị trí code. |
| Static validation | PASS | `node --check` 9 file backend, `npx prisma validate`, `git diff --check` | Không sửa schema/migrations. |
| Behavior-critical modules | Không đổi | Không sửa webhook/RAG/tenant handoff/dashboard FE/DevOps/package | Chỉ sửa route/controller settings handoff. |

## Prompt 05D-FIX Update - Handoff Settings Accessor + Runtime (PASS)

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Prisma accessor handoff settings | Fixed | `prisma.handoffSettings` → `prisma.handoffSetting` trong `settings.controller.js` và `dashboard.js` | Model schema là `HandoffSetting`, accessor đúng là số ít. |
| Prisma payload `HandoffSetting` | Fixed | Bỏ `botGracePeriodSeconds` khỏi `create/update` payload | Field này không tồn tại trong schema; không đổi schema/migrations. |
| Static validation | PASS | `node --check` 9 file backend, `npx prisma validate`, `git diff --check` | Không sửa package, dashboard FE, webhook/RAG/tenant handoff. |
| Auth no-token | Runtime verified | `GET /api/settings/handoff` không token → 401 `{error}` | Không crash. |
| Existing routes | Runtime verified PASS | `webhook` 200, `telegram-destinations` 200, `prompts` 200 array len=7 | Token lấy qua login endpoint local/test; không in credential/token. |
| `GET /api/settings/handoff` | Runtime verified PASS | 200 object `{id,pendingTimeoutSeconds,sessionTimeoutSeconds,offHoursPendingTimeout,workHoursStart,workHoursEnd,updatedAt}` | Trước fix là 500 do accessor sai. |
| `PUT /api/settings/handoff` | Runtime verified PASS | 200 object cùng shape; GET lại sau PUT vẫn 200 | Payload dùng current settings, chỉ gồm field có trong schema. |
| Behavior/public contract | Preserved except intended bug fix | Route/method/auth giữ nguyên | Behavior fix có chủ đích: 500 → 200 đúng contract. |
| Behavior-critical modules | Không đổi | Không sửa schema/migrations/webhook/RAG/tenant handoff/dashboard FE/DevOps | Chỉ sửa phạm vi handoff settings. |

## Prompt 05D Update - Settings Route Split + Runtime (PASS WITH WARNINGS)

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Route group settings kế tiếp | Done with warnings | `GET /settings/handoff` | Public route vẫn `/api/settings/handoff`. |
| Controller settings mở rộng | Done | `createGetHandoffSettings({ prisma })` trong `settings.controller.js` | Move handler **nguyên trạng**. |
| Route module settings mở rộng | Done | `router.get('/handoff', authMiddleware, ...)` trong `settings.routes.js` | Dùng `prisma` đã truyền sẵn. |
| `dashboard.js` gỡ block | Done | 2408 → 2395 dòng | Giữ nguyên `PUT /settings/handoff`. |
| Static validation | PASS | `node --check` ×9, `prisma validate`, `git diff --check` | — |
| Runtime: webhook/telegram-destinations/prompts | PASS | 200, shape đúng | Auth 401 khi thiếu token. |
| Runtime: `GET /settings/handoff` (mới) | 500 — behavior giữ nguyên | Bản gốc `git HEAD` cũng 500 | Không regression. |
| Bug pre-existing phát hiện | Open (P1) | model `HandoffSetting` nhưng route dùng `prisma.handoffSettings` (undefined) | Cần Prompt 05D-FIX; `index.js` seed dùng đúng `prisma.handoffSetting`. |
| Behavior-critical modules | Không đổi | Không sửa schema/webhook/RAG/tenant handoff/dashboard FE | — |

## Prompt 05R-LOCALDB-FIX Update - Local pgvector + Backend Run PASS

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Lỗi `DATABASE_URL not found` | Fixed | `backend/.env` tạo lại đầy đủ, gitignored | Env cũ hỏng/thiếu; không in secret. |
| Lỗi `type "vector" does not exist` | Fixed | `CREATE EXTENSION IF NOT EXISTS vector;` + verify trên container pgvector | Dùng image `pgvector/pgvector:pg16`. |
| DB pgvector local bền vững | Done (giữ lại) | container `bbotech-pgvector-local`, port 5433, volume `bbotech_pgvector_local_data` | Không xóa sau test; không đụng Supabase dự án khác. |
| Prisma migrate deploy | PASS | 10 migration áp dụng | KHÔNG `db push --accept-data-loss`. |
| Backend `npm run dev` | PASS | Log "Server running on port 3001", DB connected | Không dùng start-all/Docker compose. |
| `GET /api/settings/webhook` | Runtime verified PASS | 200, secret mask/null | — |
| `GET /api/settings/telegram-destinations` | Runtime verified PASS | 200, `{destinations:[],envFallback}` | — |
| `GET /api/prompts` | Runtime verified PASS | 200, array len=7 | — |
| Auth | Runtime verified | no-token → 401 | Không crash. |
| Env commit | Không | `git check-ignore` xác nhận | KHÔNG commit `.env`. |
| Source runtime | Không đổi | Không sửa src/schema/webhook/RAG/handoff | Chỉ tạo env + migrate DB local. |

## Prompt 05R-ENV Update - Local Test Env + Runtime Smoke PASS

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Env local/test | Done (dùng một lần) | `backend/.env` + `dashboard/.env.local` local-only, gitignored | Không in secret; đã xóa sau test. |
| DB local/test | Done (dùng một lần) | Docker `pgvector/pgvector:pg16` container tạm `bbotest_pg`, port 5433 | Không production; đã gỡ sau test. |
| Schema setup | Done | `npx prisma migrate deploy` áp 10 migration vào DB tạm | Non-destructive; KHÔNG `db push`/`--accept-data-loss`. |
| Static validation | PASS | `node --check` ×9 + `prisma validate` + dashboard `tsc` + `next build` | Không thay đổi source. |
| Auth behavior | Runtime verified | `GET /api/prompts` không token → 401 | Auth enforced, không crash. |
| `GET /api/settings/webhook` | Runtime verified PASS | status 200, object 4 keys, secret mask/null, webhookUrl đúng | Không cần DB, không external API. |
| `GET /api/settings/telegram-destinations` | Runtime verified PASS | status 200, `{destinations:[],envFallback}` | Read-only DB. |
| `GET /api/prompts` | Runtime verified PASS | status 200, array len=7, shape khớp `promptTemplate` | Read-only DB + tenant scope mặc định `null`. |
| Behavior-critical modules | Không đổi | Không sửa source/schema/webhook/RAG/tenant handoff/DevOps | Chỉ tạo env tạm + chạy migration lên DB tạm. |
| Env commit | Không | `git check-ignore` xác nhận; working tree clean | KHÔNG commit `.env`. |

Rủi ro còn lại sau Prompt 05R-ENV:

- Runtime verify chỉ trên DB test dùng một lần; cần chuẩn bị lại nếu tái chạy.
- `backend/src/api/dashboard.js` còn 2.408 dòng, 98 route trực tiếp; phần lớn route chưa runtime verified.
- `$queryRawUnsafe`, tenant scope sâu, handoff, RAG, DevOps script risk, default credential, npm audit (backend 10, dashboard 3) vẫn mở.

## Prompt 05R Update - Feature Inventory + Local Run + Runtime Smoke

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Feature inventory | Done | `docs/FEATURE_INVENTORY.md` | 9 nhóm chức năng; không mục nào đánh dấu runtime PASS. |
| Local run guide | Done | `docs/LOCAL_RUN_GUIDE.md` | Trạng thái readiness + checklist thủ công + lệnh an toàn. |
| Preflight | Done | `git status` clean, commit 05C `5e51bf7...` tồn tại | Không có source runtime change lạ. |
| Backend static validation | PASS | `node --check` 9 file trọng yếu + `prisma validate` dummy | Không start server, không migrate/db push. |
| Dashboard static validation | PASS | `tsc --noEmit` exit 0, `next build` PASS | Không sửa dashboard frontend. |
| Dependency | Có sẵn | `backend/node_modules`, `dashboard/node_modules` EXISTS | Node v22.18.0, npm 11.6.0. |
| Env file | Thiếu | `backend/.env`, `dashboard/.env(.local)` MISSING | Chỉ kiểm tra tồn tại, không mở nội dung. |
| DB local/test | Chưa xác nhận | Không có `DATABASE_URL` | Cần chuẩn bị thủ công. |
| Runtime smoke test 3 route | BLOCKED | Thiếu env/DB local/test + không có token test | `GET /api/settings/webhook`, `/telegram-destinations`, `/prompts` chưa runtime verified. |
| Behavior-critical modules | Không đổi | Git diff guardrail | Không đụng source runtime/schema/webhook/RAG/tenant handoff/DevOps. |

Rủi ro còn lại sau Prompt 05R:

- Runtime của 3 route đã tách vẫn chưa verify (BLOCKED — thiếu `.env`/DB local/test).
- `backend/src/api/dashboard.js` còn 2.408 dòng, 98 route trực tiếp.
- `$queryRawUnsafe`, tenant scope, DevOps script risk, default credential, npm audit vulnerabilities (backend 10, dashboard 3) vẫn mở.
- Sau khi người dùng chuẩn bị env/DB local/test, chạy lại Prompt 05R (Phase 5) để runtime verify.

## Prompt 05C Update - Backend API Route/Controller Split Phase 3

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Route group thứ ba | Done with warnings | `GET /prompts` | Public route vẫn là `/api/prompts`. |
| Controller prompts mới | Done | `backend/src/presentation/http/controllers/dashboard/prompts.controller.js` | Move nguyên query list prompt template, tenant scope và response JSON từ `dashboard.js`. |
| Route module prompts mới | Done | `backend/src/presentation/http/routes/dashboard/prompts.routes.js` | Mount `router.get('/')` dưới `/prompts`. |
| `dashboard.js` mount route | Done | `router.use('/prompts', createPromptRoutes({ authMiddleware, getTenantScope, prisma }))` | Đặt tại vị trí route cũ, trước `GET /prompts/:id`, không đổi public path. |
| Route write/detail còn lại | Không đổi | `GET /prompts/:id`, `POST/PUT/DELETE /prompts` | Không tách route write trong Prompt 05C. |
| Validation backend | Static validation pass | `node --check`, Prisma validate dummy, route scan, `git diff --check` | Chưa chạy app server/API thật. |
| Runtime verification | Not done | Không chạy server | Không đánh dấu route runtime là DONE. |
| Behavior-critical modules | Không đổi | Git diff guardrail | Không đụng webhook, tenant handoff, RAG, bot engine, Prisma schema/migrations, dashboard frontend. |

Rủi ro còn lại sau Prompt 05C:

- `backend/src/api/dashboard.js` vẫn còn 2.408 dòng và 98 route trực tiếp.
- Đã có 3 route read-only được tách nhưng chưa runtime verified, nên nên chạy Prompt 05R trước khi tách tiếp hoặc sang repository layer.
- `$queryRawUnsafe`, analytics raw SQL, tenant scope, handoff, RAG và DevOps script risk vẫn mở.

## Prompt 05B Update - Backend API Route/Controller Split Phase 2

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Route group thứ hai | Done with warnings | `GET /settings/telegram-destinations` | Public route vẫn là `/api/settings/telegram-destinations`. |
| Controller settings mở rộng | Done | `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | Move nguyên Prisma query, response JSON và error handling từ `dashboard.js`. |
| Route module settings mở rộng | Done | `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Thêm `router.get('/telegram-destinations', authMiddleware, ...)`. |
| `dashboard.js` mount route | Done | `router.use('/settings', createSettingsRoutes({ authMiddleware, prisma }))` | Truyền `prisma` vào route factory, không đổi public path. |
| Route write/test còn lại | Không đổi | `POST/PUT/DELETE /settings/telegram-destinations`, `POST /settings/telegram-destinations/:id/test` | Không tách route có write hoặc external Telegram side effect trong Prompt 05B. |
| Validation backend | Static validation pass | `node --check`, Prisma validate dummy | Chưa chạy app server/API thật. |
| Runtime verification | Not done | Không chạy server | Không đánh dấu route runtime là DONE. |
| Behavior-critical modules | Không đổi | Git diff guardrail | Không đụng webhook, tenant handoff, RAG, Prisma schema/migrations, dashboard frontend. |

Rủi ro còn lại sau Prompt 05B:

- `backend/src/api/dashboard.js` vẫn còn 2.422 dòng và 99 route trực tiếp, cần tiếp tục tách theo nhóm nhỏ.
- Các route settings còn lại có write/external side effect hoặc handoff singleton, nên không nên gom hết trong một prompt.
- `$queryRawUnsafe`, analytics raw SQL, tenant scope, handoff, RAG và DevOps script risk vẫn mở.
- Prompt tiếp theo nên là Prompt 05C để tách thêm route nhỏ, ưu tiên read-only không raw SQL và không gọi external API.

## Prompt 05 Update - Backend API Route/Controller Split Phase 1

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Route group đầu tiên | Done with warnings | `GET /settings/webhook` | Public route vẫn là `/api/settings/webhook`. |
| Controller mới | Done | `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | Move nguyên trạng response JSON, không đổi mask config. |
| Route module mới | Done | `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Dùng lại `authMiddleware` truyền từ `dashboard.js`. |
| `dashboard.js` mount route | Done | `router.use('/settings', createSettingsRoutes({ authMiddleware }))` | Giữ path, method và auth behavior. |
| Validation backend | Static validation pass | `node --check`, Prisma validate dummy | Chưa chạy app server/API thật. |
| Runtime verification | Not done | Không chạy server | Không đánh dấu route runtime là DONE. |
| Behavior-critical modules | Không đổi | Git diff guardrail | Không đụng webhook, tenant handoff, RAG, Prisma schema/migrations, dashboard frontend. |

Rủi ro còn lại sau Prompt 05:

- `backend/src/api/dashboard.js` vẫn còn khoảng 2.439 dòng và khoảng 100 route trực tiếp, cần tiếp tục tách theo nhóm nhỏ.
- `$queryRawUnsafe`, analytics raw SQL, tenant scope, handoff, RAG và DevOps script risk vẫn mở.
- Prompt tiếp theo nên là Prompt 05B để tách thêm một nhóm route nhỏ trước khi chuyển sâu sang repository layer.

## Prompt 04A Update - Progress Rewrite Before Prompt 05

Ngày cập nhật: 2026-07-08

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú cho Prompt 05 |
|---|---|---|---|
| Prompt 01 audit | Done | `report/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md` | Read-only audit, không sửa source runtime. |
| Prompt 02 safety gate | Done / Blocked đúng guardrail | `report/PROMPT_02_BLOCKED_NEED_GIT_CHECKPOINT.md` | Việc dừng vì thiếu `.git` là đúng quy trình. |
| Prompt 02A progress/checklist foundation | Done | `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`, report Prompt 02A | Chỉ docs/report, không runtime source. |
| Prompt 02B safety foundation | Done with warnings | Commit `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` | Baseline static validation pass, còn warnings quality/security. |
| Prompt 03 architecture shell | Done with warnings | Commit `24ac487d1b406f06650ca942efb311619e6a7c47` | Static validation pass — chưa runtime verified. |
| Prompt 04 config/env policy | Done with warnings | Commit `25f3bb79e419590fb14540a82f28efe6482d980f` | Static validation pass — chưa runtime verified. |
| Prompt 04A progress rewrite | Done | `docs/PROJECT_PROGRESS.md`, report Prompt 04A | Chỉ docs/report; dùng để vào Prompt 05 rõ hơn. |
| Runtime verification | Not done | Chưa chạy app/API thật | Không đánh dấu feature runtime là DONE cho đến khi có smoke test. |
| Prompt 05 readiness | Ready with warnings | `docs/REFACTOR_PLAN.md`, `docs/ENV_POLICY.md`, report Prompt 04 | Chỉ tách route/controller domain nhỏ trong `backend/src/api/dashboard.js`. |

Rủi ro còn lại cần giữ trước Prompt 05:

- `backend/src/api/dashboard.js` vẫn quá lớn và là mục tiêu Prompt 05.
- Không chạm webhook, tenant handoff, RAG pipeline, Prisma schema/migrations trong Prompt 05.
- `$queryRawUnsafe`, tenant scope, default credential/fallback, DevOps script rủi ro và npm audit vulnerabilities vẫn mở.
- Nếu Prompt 05 chỉ đạt syntax/build validation thì phải ghi: **Static validation pass — chưa runtime verified**.

## Prompt 04 Config/Env Validation Update

Ngày cập nhật: 2026-07-08

| Nhóm | Kết quả thật | Trạng thái cập nhật | Bằng chứng kiểm tra | Hành động tiếp theo |
|---|---|---|---|---|
| Backend config helper | Đã có helper normalize URL, mode env, app base URL, port và placeholder warning | Static validation pass | `backend/src/infrastructure/services/config.js`, `node --check` | Prompt sau mới cân nhắc migrate từng call site runtime nếu có regression checklist. |
| Dashboard public env helper | `NEXT_PUBLIC_API_URL` và `NEXT_PUBLIC_CHATWOOT_URL` được normalize tại helper tập trung | Static validation pass | `dashboard/src/lib/config/env.ts`, `tsc`, `next build` | Không thêm fallback localhost mới trong page/component. |
| Dashboard settings | Chatwoot base URL không còn hard-code trực tiếp trong settings page | Static validation pass | `dashboard/src/app/dashboard/settings/page.tsx` | Các fetch trực tiếp khác sẽ xử lý trong prompt dashboard/API cleanup riêng. |
| Env example backend | Đã bổ sung `DASHBOARD_URL`, `FRONTEND_URL`, `TELEGRAM_MANAGER_CHAT_ID`, các biến `MESSAGE_*` | Documentation pass | `backend/.env.example` | Production phải đặt giá trị thật ngoài Git. |
| Env example dashboard | Đã tạo `.env.example` riêng cho `NEXT_PUBLIC_*` | Documentation pass | `dashboard/.env.example` | Không đặt secret trong `NEXT_PUBLIC_*`. |
| Env policy | Đã tạo quy tắc local vs production, public vs secret, validation an toàn | Documentation pass | `docs/ENV_POLICY.md` | Dùng làm guardrail cho Prompt 05+. |
| DevOps/local URL | Chỉ scan read-only, chưa sửa script/Docker/webhook URL file | Risk confirmed | `start-all.bat`, `backend/Dockerfile`, `webhook-urls-current.txt` | Prompt 10 hoặc prompt DevOps riêng xử lý. |
| Behavior-critical modules | Không sửa webhook, tenant handoff, RAG, Chatwoot crypto, Prisma schema/migrations | Risk controlled | Git diff sau Prompt 04 | Tiếp tục giữ ngoài phạm vi Prompt 05 trừ khi prompt ghi rõ. |

## Prompt 03 Static Validation Update

Ngày cập nhật: 2026-07-08

| Nhóm | Kết quả thật | Trạng thái cập nhật | Bằng chứng kiểm tra | Hành động tiếp theo |
|---|---|---|---|---|
| Backend architecture shell | Đã tạo shell `domain/application/infrastructure/presentation` | Static validation pass | README layer + `node --check` wrapper mới | Prompt 05 mới bắt đầu tách route/controller nhỏ. |
| Backend Prisma wrapper | Re-export singleton cũ, không tạo PrismaClient thứ hai | Static validation pass | `backend/src/infrastructure/persistence/prisma/client.js` | Prompt 06 dùng wrapper này cho repository layer. |
| Backend config helper | Đã tạo helper env an toàn, chưa migrate code cũ | Static validation pass | `backend/src/infrastructure/services/config.js` | Prompt 04 mở rộng config policy. |
| Dashboard architecture shell | Đã tạo feature/component/lib shell | Static validation pass | `dashboard/src/features/**`, `dashboard/src/components/**`, `dashboard/src/lib/**` | Prompt 09 mới tách page lớn. |
| Dashboard API helper | `api.ts` dùng factory mới nhưng giữ interceptor cũ | Static validation pass | `dashboard/src/lib/api.ts`, `dashboard/src/lib/api/client.ts` | Theo dõi auth header và tenantScope khi tách API theo feature. |
| Dashboard config helper | `http://localhost:3001` trong dashboard source còn duy nhất ở helper fallback | Static validation pass | `rg "http://localhost:3001" dashboard/src` | Prompt 04 xử lý phần backend/scripts/root còn lại. |
| Backend validation | Syntax check + Prisma validate dummy pass | Static validation pass | `node --check`, `npx prisma validate` với `DATABASE_URL` dummy | Chưa runtime verified. |
| Dashboard validation | TypeScript + Next build pass | Static validation pass | `npx --no-install tsc --noEmit`, `npm run build` | Chưa browser/runtime verified. |
| Behavior-critical modules | Không move webhook, tenant handoff, RAG, bot engine | Risk controlled | Git diff không đổi các file này | Cần checklist riêng trước khi refactor sâu. |

## Prompt 02B Validation Update

Ngày cập nhật: 2026-07-07

| Nhóm | Kết quả thật | Trạng thái cập nhật | Bằng chứng kiểm tra | Hành động tiếp theo |
|---|---|---|---|---|
| Git safety | Đã có `.git` và checkpoint local | PASS | Commit `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` | Giữ checkpoint trước mọi refactor source. |
| `.gitignore` | Đã bổ sung rule bảo vệ secret/build artifact | PASS | `.gitignore`, `git diff --cached --name-only`, bộ lọc staged file cấm | Không commit `.env`, `node_modules`, `.next`, log, build output. |
| Backend dependencies | `npm ci` pass | PASS WITH WARNINGS | `backend/package-lock.json`, `npm ci` | Audit vulnerability sau, không dùng `npm audit fix` trong prompt refactor. |
| Dashboard dependencies | `npm ci` pass | PASS WITH WARNINGS | `dashboard/package-lock.json`, `npm ci` | Audit vulnerability sau, không tự upgrade package. |
| Backend syntax | Các file JS trọng yếu pass `node --check` | PASS | `src/index.js`, `src/api/dashboard.js`, webhook/tenant/bot/RAG files | Prompt 03 có thể tạo shell/wrapper nhưng phải validate lại sau mỗi nhóm. |
| Backend lint/typecheck | Không có script lint/typecheck | Needs verification | `backend/package.json` | Không đánh dấu backend quality gate là full pass. |
| Prisma schema | Fail khi thiếu `DATABASE_URL`, pass với dummy local URL | PASS WITH ENV WARNING | `npx prisma validate` | Cần env local an toàn trước validation chuẩn; không migrate/db push. |
| Dashboard lint | `next lint` yêu cầu cấu hình ESLint tương tác | Risk confirmed | `dashboard/package.json`, `npm run lint` | Prompt riêng cần cấu hình ESLint có kiểm soát hoặc thay script phù hợp. |
| Dashboard typecheck | `tsc --noEmit` pass | PASS | `npx --no-install tsc --noEmit` | Tiếp tục chạy sau từng thay đổi TS/TSX. |
| Dashboard build | `next build` pass | PASS | `npm run build` | Build là guardrail chính hiện tại cho dashboard. |
| Raw SQL unsafe | Nhiều điểm `$queryRawUnsafe` xác nhận | Risk confirmed | `backend/src/api/dashboard.js`, `backend/src/tenants/handoff.js`, `backend/src/rag/pipeline.js`, `backend/scripts/seed.js` | Audit từng query, ưu tiên input người dùng và tenant scope. |
| Hard-code localhost | Xác nhận ở backend, dashboard, script, webhook URL file | Risk confirmed | `dashboard/src/lib/api.ts`, `dashboard/src/app/dashboard/settings/page.tsx`, `campaigns/page.tsx`, `tenants/page.tsx`, `start-all.bat` | Prompt config hardening sau khi architecture shell ổn. |
| Default credential/fallback | Xác nhận `admin/admin123`, standalone fallback, placeholder provider key | Risk confirmed | `backend/src/index.js`, `dashboard/src/lib/auth.tsx`, `dashboard/src/app/login/page.tsx`, `start-all.bat` | Không dùng production; cần env policy và login regression test. |
| DevOps destructive command | Xác nhận `prisma db push --accept-data-loss` | Risk confirmed | `start-all.bat` | Không chạy script này trên dữ liệu thật. |
| Container migration on start | Xác nhận `prisma migrate deploy` trong backend container | Risk confirmed | `backend/Dockerfile` | Cần migration/deploy policy riêng. |
| Chatwoot local folder | `chatwoot/` không tồn tại tại root | Risk confirmed | `Test-Path chatwoot` trả `False` | Không chạy `start-all.bat`/`stop-all.bat` nếu chưa xác minh môi trường. |

Ngày cập nhật: 2026-07-07  
Phạm vi: bảng kiểm tính năng hiện tại, rủi ro ẩn và cách kiểm tra an toàn trước refactor. File này chỉ phục vụ audit/tài liệu, không xác nhận tính năng đã chạy thành công trong runtime.

Quy ước trạng thái:

| Trạng thái | Ý nghĩa |
|---|---|
| Đã có | File/API/module có tồn tại theo scan read-only. |
| Cần kiểm chứng | Có dấu hiệu tồn tại nhưng chưa chạy validation/runtime. |
| Rủi ro | Có khả năng gây lỗi, mất dữ liệu, sai tenant scope hoặc sai deploy. |
| Chưa thấy | Chưa thấy rõ trong scan hiện tại. |

## A. Backend core

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Express server | Đã có | `backend/src/index.js` | Startup có seed defaults và phụ thuộc env/database | Sau dependency, chạy syntax/start smoke bằng env local giả lập | P0 | Không chạy nếu chưa rõ database. |
| Health/API root | Đã có | `backend/src/index.js` | Có thể không phản ánh trạng thái DB/LLM/webhook | Smoke test endpoint sau khi backend chạy | P1 | Nên mở rộng health theo dependency. |
| Auth dashboard JWT | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/auth.tsx` | Fallback secret/default admin có thể không an toàn | Kiểm tra env required và login flow sau baseline | P0 | Production không được dùng default credential. |
| Dashboard REST API | Đã có | `backend/src/api/dashboard.js` | File rất lớn, nhiều domain lẫn nhau, khó refactor an toàn | Ghi danh sách route trước khi tách | P0 | Ưu tiên split sau checkpoint. |
| Prisma client | Đã có | `backend/src/db.js`, `backend/prisma/schema.prisma` | Chưa chạy `prisma validate`; vector dùng `Unsupported` | Prompt 02B chạy `npx prisma validate` | P0 | Không chạy migration/db push. |
| Seed defaults | Đã có | `backend/src/index.js`, `backend/scripts/seed.js` | Tự tạo admin/provider placeholder; có `$queryRawUnsafe` trong seed script | Chỉ đọc logic; không chạy seed nếu chưa có DB backup | P1 | Cần tách local seed khỏi production. |
| CORS/helmet/upload | Đã có | `backend/src/index.js`, `backend/src/api/dashboard.js` | Chính sách CORS/upload chưa được xác nhận production | Kiểm tra cấu hình env và giới hạn file | P1 | Liên quan dashboard/RAG upload. |

## B. Messaging và webhook

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Facebook webhook verify | Đã có | `backend/src/webhook/handler.js` | Phụ thuộc `FB_VERIFY_TOKEN`; page fallback có thể đi sai tenant | Test verify bằng token giả local sau baseline | P0 | Không in token thật. |
| Facebook message handling | Đã có | `backend/src/webhook/handler.js`, `backend/src/facebook/menu.js` | Rate limit, sender/page mapping, access token fallback | Test với payload mẫu đã ẩn secret | P0 | Cần bảo toàn behavior. |
| Chatwoot owner webhook | Đã có | `backend/src/webhook/chatwootHandler.js`, `backend/src/chatwoot/api.js` | Signature/credential owner vs tenant có thể lẫn | Test payload mẫu và config env | P0 | Prompt 01 ghi có cả owner/tenant mode. |
| Chatwoot tenant webhook | Đã có | `backend/src/tenants/webhookHandler.js`, `backend/src/tenants/registry.js` | Rủi ro tenant scope, decrypt credential, channel mapping | Audit từng query theo tenant/page/channel | P0 | Là phần nhạy cảm nhất của multi-tenant. |
| Telegram bot | Đã có | `backend/src/telegram/bot.js` | Thiếu token thì module có thể không chạy; command routing cần test | Kiểm tra startup khi token thiếu/có | P1 | Không đọc token thật. |
| Telegram handoff legacy | Đã có | `backend/src/telegram/handoff.js` | File lớn, nhiều nhánh xử lý, có dynamic require | Tạo checklist command/callback trước refactor | P0 | Không tách khi chưa có baseline. |
| Tenant handoff | Đã có | `backend/src/tenants/handoff.js` | Có `$queryRawUnsafe`; rủi ro assign sai tenant/staff | Audit tenantId trên mọi query/action | P0 | Ưu tiên cao. |
| Alert/notification queue | Đã có | `backend/src/notifications/*` | Có thể nuốt lỗi hoặc gửi sai destination | Test bằng mock destination sau baseline | P1 | Liên quan handoff/appointments. |

## C. Bot và AI

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Bot engine | Đã có | `backend/src/bot/engine.js` | Core behavior dễ vỡ nếu tách vội | Tạo golden sample conversation trước refactor | P0 | Không đổi trước baseline. |
| Agent/tools | Đã có | `backend/src/bot/agent.js`, `backend/src/bot/tools.js` | Tool calling phụ thuộc provider format và DB state | Test từng tool bằng payload tối thiểu | P0 | Có liên quan appointment/RAG. |
| Intent router | Đã có | `backend/src/bot/router.js`, `backend/src/bot/intents.js` | Intent sai gây route sai hoặc fallback quá mức | Snapshot input/output mẫu | P1 | Tách sau khi có sample. |
| Context manager | Đã có | `backend/src/bot/context.js` | Context có thể thiếu tenant/page scope | Audit query scope | P0 | Liên quan trộn dữ liệu. |
| LLM factory | Đã có | `backend/src/llm/factory.js` | Provider fallback/alert có thể che lỗi cấu hình | Test provider disabled/missing key | P1 | Không in API key. |
| Gemini provider | Đã có | `backend/src/llm/gemini.js` | API response shape có thể đổi | Mock response hoặc smoke test có kiểm soát | P2 | Phụ thuộc external API. |
| DeepSeek provider | Đã có | `backend/src/llm/deepseek.js` | Response/error handling cần kiểm tra | Mock response hoặc smoke test có kiểm soát | P2 | Phụ thuộc external API. |
| Claude provider | Đã có | `backend/src/llm/claude.js` | Tool format khác provider khác | Mock tool response | P2 | Phụ thuộc external API. |
| Jina/embedding | Đã có | `backend/src/llm/jina.js`, `backend/src/rag/pipeline.js` | Embedding dimension/vector SQL | Test embedding mock/sample | P0 | Liên quan pgvector. |
| Appointment tools | Đã có | `backend/src/bot/tools.js`, `backend/src/api/dashboard.js`, `docs/appointment-modify-spec.md` | Docs có thể lệch code; update/reschedule/cancel cần test | So sánh spec với route/tool thực tế | P0 | Cần không làm mất flow đặt lịch. |
| Content package tools | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/content-packages/page.tsx` | Flow migrate từ campaign có thể trùng dữ liệu | Chỉ test với DB mẫu/backup | P1 | Không chạy migrate trên dữ liệu thật. |

## D. RAG và knowledge base

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Knowledge CRUD | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | Query scope tenant/category cần kiểm chứng | Test CRUD với dữ liệu mẫu | P0 | Không dùng dữ liệu thật khi chưa backup. |
| Upload tài liệu | Đã có | `backend/src/api/dashboard.js`, `backend/src/rag/docParser.js` | File type/size/parser lỗi có thể làm crash | Test file nhỏ sau baseline | P1 | Cần kiểm tra multer limits. |
| Scrape URL | Đã có | `backend/src/rag/docParser.js`, `dashboard/src/lib/api.ts` | SSRF/timeout/parser HTML | Thêm allowlist/timeout sau audit | P1 | Không chạy crawl tùy tiện. |
| Parser PDF/DOCX/HTML | Đã có | `backend/src/rag/docParser.js` | Dynamic require có thể fail nếu dependency thiếu | Kiểm tra dependency và test file mẫu | P1 | Hiện chưa có `node_modules`. |
| Embedding pipeline | Đã có | `backend/src/rag/pipeline.js` | `$queryRawUnsafe`, vector formatting, provider errors | Audit input vào raw SQL | P0 | Ưu tiên bảo mật. |
| pgvector search | Đã có | `backend/src/rag/pipeline.js`, `backend/prisma/schema.prisma` | Prisma `Unsupported("vector")`, raw SQL bắt buộc nhưng cần an toàn | Test `prisma validate`; dùng parameterized raw SQL nếu có thể | P0 | Không đổi schema trước checkpoint. |
| Reindex knowledge | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | Reindex all có thể tốn chi phí API/ghi DB hàng loạt | Chỉ chạy trên sample DB | P1 | Cần dry-run hoặc confirmation. |
| Fallback search | Cần kiểm chứng | `backend/src/rag/pipeline.js` | Fallback có thể trả sai tenant hoặc kết quả kém | Test query sample theo tenant | P1 | Cần đọc sâu sau checkpoint. |

## E. Multi-tenant

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Tenant model/schema | Đã có | `backend/prisma/schema.prisma` | Quan hệ tenant với page/channel/staff cần validate | `npx prisma validate` trong Prompt 02B | P0 | Không đổi schema lúc này. |
| Tenant registry/cache | Đã có | `backend/src/tenants/registry.js` | Cache stale credential hoặc decrypt fail | Test cache invalidation sau update config | P0 | Phụ thuộc `ENCRYPTION_KEY`. |
| Channel config | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/channel-configs/page.tsx` | Mapping Chatwoot/Facebook sai tenant | Test create/update với tenant mẫu | P0 | Rủi ro cao khi deploy. |
| Tenant webhook info | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | URL fallback hard-code/empty `APP_BASE_URL` | Kiểm tra env mapping | P0 | Liên quan public webhook. |
| Tenant staff | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/staff/page.tsx`, `dashboard/src/app/dashboard/tenants/[id]/staff/page.tsx` | Staff có thể lẫn giữa global và tenant route | Audit query theo tenantId | P0 | Cần ưu tiên trước handoff refactor. |
| Scoped conversations | Cần kiểm chứng | `backend/src/api/dashboard.js`, `backend/src/webhook/*`, `backend/src/tenants/*` | Trộn conversation giữa page/tenant | Trace từ webhook payload đến DB query | P0 | Cần sample payload. |
| Scoped knowledge | Cần kiểm chứng | `backend/src/api/dashboard.js`, `backend/src/rag/pipeline.js` | Search knowledge sai tenant | Test search theo tenant/sample data | P0 | Liên quan RAG. |
| Admin users/roles | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | Role/permission chưa rõ mức tenant/global | Audit auth middleware và role checks | P1 | Có thể cần RBAC sau. |

## F. Dashboard

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Login/auth provider | Đã có | `dashboard/src/lib/auth.tsx`, `dashboard/src/app/page.tsx` | Token storage/refresh/error handling cần test | Build/lint và login smoke | P0 | Phụ thuộc backend auth. |
| API client | Đã có | `dashboard/src/lib/api.ts` | Base URL fallback localhost; duplicate interceptor | Chuẩn hóa sau baseline | P0 | Không sửa trong Prompt 02A. |
| Dashboard layout | Đã có | `dashboard/src/app/dashboard/layout.tsx` | Navigation/tenant banner cần test responsive | Dashboard build + manual smoke | P1 | UI refactor sau. |
| Overview dashboard | Đã có | `dashboard/src/app/dashboard/page.tsx` | Stats API có thể lỗi nếu DB rỗng | Test với DB mẫu | P1 | Liên quan analytics. |
| Conversations | Đã có | `dashboard/src/app/dashboard/conversations/page.tsx` | Message list có thể không scope tenant | Test filter/tenant | P0 | Liên quan dữ liệu khách. |
| Knowledge | Đã có | `dashboard/src/app/dashboard/knowledge/page.tsx` | Upload/reindex tốn chi phí hoặc lỗi parser | Test file nhỏ sau baseline | P1 | Không chạy reindex all trên dữ liệu thật. |
| Prompts/providers | Đã có | `dashboard/src/app/dashboard/prompts/page.tsx` | API key/provider update có thể lộ hoặc lỗi encrypt | Không in secret; test save masked | P0 | Liên quan LLM. |
| Campaigns legacy | Đã có | `dashboard/src/app/dashboard/campaigns/page.tsx` | Có link hard-code `http://localhost:3001`; legacy data chưa migrate hết | Không sửa trước baseline; ghi rủi ro | P1 | Có content packages mới. |
| Content packages | Đã có | `dashboard/src/app/dashboard/content-packages/page.tsx` | Nút migrate có thể ghi DB hàng loạt | Chỉ dùng với DB backup | P1 | Cần confirmation UI tốt hơn. |
| Quick replies | Đã có | `dashboard/src/app/dashboard/quick-replies/page.tsx` | Mapping tenant/page/menu cần test | Test CRUD sample | P1 | Liên quan Facebook menu. |
| Channel configs | Đã có | `dashboard/src/app/dashboard/channel-configs/page.tsx` | Credential/inbox mapping có thể sai | Test lookup/update sample | P0 | Liên quan Chatwoot. |
| Tenants | Đã có | `dashboard/src/app/dashboard/tenants/page.tsx`, `dashboard/src/app/dashboard/tenants/[id]/*` | Fallback localhost; multi-page CRUD cần test | Audit API calls và env | P0 | Core multi-tenant. |
| Analytics | Đã có | `dashboard/src/app/dashboard/analytics/page.tsx` | Backend analytics có nhiều raw SQL | Test with sample DB | P1 | Raw SQL cần kiểm tra. |
| Appointments | Đã có | `dashboard/src/app/dashboard/appointments/page.tsx` | Update status/reschedule có thể lệch bot tool | Test flow create/update/cancel | P0 | Business-critical. |
| Staff | Đã có | `dashboard/src/app/dashboard/staff/page.tsx` | Global vs tenant staff có thể lẫn | Audit route and query | P0 | Liên quan handoff. |
| Handoff | Đã có | `dashboard/src/app/dashboard/handoff/page.tsx` | Assign/force-end sai tenant/staff | Test với sample conversation | P0 | Rủi ro cao. |
| Settings | Đã có | `dashboard/src/app/dashboard/settings/page.tsx` | Có fetch trực tiếp và hard-code localhost | Chuẩn hóa về `lib/api.ts` sau baseline | P0 | Không sửa khi chưa checkpoint. |

## G. DevOps, deploy và vận hành local

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Docker compose | Đã có | `docker-compose.yml` | Chưa chạy; có thể phụ thuộc env/volume/ports | Chỉ validate config sau checkpoint | P1 | Không `docker compose up` trong Prompt 02A. |
| Backend Dockerfile | Đã có | `backend/Dockerfile` | CMD chạy `npx prisma migrate deploy` khi start container | Chỉ dùng khi migration plan rõ | P0 | Production cần kiểm soát migration. |
| Dashboard Dockerfile | Cần kiểm chứng | `dashboard/Dockerfile` | Prompt scan có nhắc diagnostic block; cần đọc sâu nếu deploy | Build sau dependency | P1 | Không xử lý trong Prompt 02A. |
| start-all.bat | Đã có | `start-all.bat` | Chạy `npm install`, `prisma db push --accept-data-loss`, cloudflared/ngrok; có hard-code path | Không chạy trên dữ liệu thật | P0 | Cần tách local bootstrap an toàn. |
| stop-all.bat | Đã có | `stop-all.bat` | Có thể kill process rộng nếu không kiểm soát | Đọc kỹ trước khi chạy | P1 | Không chạy nếu chưa cần. |
| Env example | Đã có | `backend/.env.example` | Cần kiểm tra biến thiếu/dư/thừa so với `process.env` | Prompt 02B mapping env | P0 | Không đọc `.env` thật. |
| webhook URLs current | Đã có | `webhook-urls-current.txt` | Có thể stale; có localhost và có thể chứa thông tin nhạy cảm | Không dùng làm nguồn production | P1 | Không in secret/token. |
| Test bot scripts | Đã có | `test-bot.js`, `test-bot-simple.js` | Hard-code localhost; có thể ghi dữ liệu local | Chỉ chạy sau khi backend local ổn | P2 | Dùng cho smoke test có kiểm soát. |
| GitHub/CI/Vercel | Chưa thấy | Không thấy `.git` | Không có guardrail remote/CI | Tạo git local trước | P0 | Điều kiện bắt buộc trước refactor. |

## Checklist kiểm tra nhanh cho Prompt 02B

- [ ] Xác nhận `.git` tồn tại hoặc tạo repository local.
- [ ] Tạo checkpoint baseline trước khi sửa source.
- [ ] Cài dependency backend/dashboard.
- [ ] Chạy validation không phá dữ liệu.
- [ ] Ghi lỗi baseline vào report.
- [ ] Cập nhật trạng thái trong `docs/PROJECT_PROGRESS.md`.
- [ ] Chỉ sau đó mới chọn một refactor nhỏ cho prompt tiếp theo.

## Prompt 08D Feature Audit Update

Ngày cập nhật: 2026-07-09

| Nhóm | Trạng thái sau Prompt 08D | Bằng chứng | Điểm còn mở |
|---|---|---|---|
| Dashboard source Chatwoot refs | Closed trong `dashboard/src` | `rg -n -i "chatwoot|NEXT_PUBLIC_CHATWOOT|lookupInboxes|chatwoot-test|lookup-inboxes" dashboard/src` không còn kết quả | Docs ngoài `dashboard/src` vẫn có thể nhắc lịch sử no-Chatwoot. |
| Dashboard env runtime | Closed | `CHATWOOT_BASE_URL` và `NEXT_PUBLIC_CHATWOOT_URL` đã bị gỡ khỏi `dashboard/src/lib/config/env.ts` | Env example đã xử lý ở Prompt 08C; chưa động `.env.local`. |
| Settings page legacy connection test | Closed | Gỡ UI test và fetch `/api/settings/chatwoot-test` khỏi `dashboard/src/app/dashboard/settings/page.tsx` | Backend route cũ nếu còn tồn tại cần xử lý trong prompt backend cleanup riêng. |
| Channel Configs lookup inbox | Closed ở Dashboard | Gỡ `lookupInboxes` khỏi `dashboard/src/lib/api.ts` và picker khỏi page | Backend route lookup cũ nếu còn tồn tại cần xử lý theo no-Chatwoot backend cleanup sau. |
| Tenants create/update Dashboard payload | Closed ở client | `dashboard/src/app/dashboard/tenants/page.tsx` không còn gửi legacy fields | Cần runtime mutating test trên DB test riêng. |
| Backend tenant create compatibility | Done tối thiểu | `POST /tenants` trong `backend/src/api/dashboard.js` chỉ bắt buộc `slug`, `name`, tự điền compatibility fields | Schema vẫn còn cột legacy, chưa cleanup database. |
| Prisma schema legacy fields | Open intentional | Prompt 08D không sửa schema/migration | Cần migration plan riêng, không làm trong prompt này. |
| Dashboard lint | Open | `npm run --if-present lint` mở prompt cấu hình ESLint tương tác | Cần quality gate prompt riêng. |
| Dashboard build/typecheck | PASS | `npx --no-install tsc --noEmit`, `npm run --if-present build` PASS | Nên thêm browser/manual smoke theo flow tenant khi có DB test. |

Kết luận: Prompt 08D hoàn tất cleanup Dashboard theo no-Chatwoot directive, nhưng chưa hoàn tất cleanup dữ liệu/schema/backend legacy toàn diện.

## Prompt 08E Feature Audit Update

Ngày cập nhật: 2026-07-09

| Nhóm | Trạng thái sau Prompt 08E | Bằng chứng | Điểm còn mở |
|---|---|---|---|
| Tenant create/update payload mới | Verified runtime | Smoke mount tạm trên DB local: POST/PUT chỉ `slug`/`name` => 201/200, 17/17 PASS | Slug validation chỉ cho `[a-z0-9-]`, test dùng `test-08e-<ts>`. |
| Backend tenant legacy write | Closed (stop-write) | `POST/PUT /api/tenants` trong `backend/src/api/dashboard.js` không còn destructure/ghi field Chatwoot từ client | Cột schema legacy vẫn còn (compat nội bộ). |
| maskTenant legacy exposure | Closed | maskTenant strip cột legacy, thêm `integrationMode/messagingMode` | Không client nào còn phụ thuộc field legacy. |
| Prisma schema legacy fields | Open intentional | 08E không sửa schema/migration | Cần migration drop riêng sau backup. |
| Regression read routes + legacy 404 | PASS | prompts/settings/handoff/telegram-destinations 200; chatwoot-webhook/chatwoot-test/lookup-inboxes 404; webhook verify sai 403 | — |

Kết luận: Prompt 08E đã đóng backend legacy stop-write và runtime-verify contract tenant mới; còn lại là migration drop schema legacy.

## Prompt 08H Feature Audit Update

Ngày cập nhật: 2026-07-10

| Nhóm | Trạng thái sau Prompt 08H | Bằng chứng | Điểm còn mở |
|---|---|---|---|
| Browser login hydration | Closed | Sau restart dashboard dev server, `_next/static` chunk không còn 404; eye toggle đổi `password` -> `text`; form gọi `/api/auth/login` | Cần restart dev server khi vừa chạy `next build` làm lệch chunk với server dev cũ. |
| Login đúng credential | Closed | Browser smoke: login đúng vào `http://localhost:3002/dashboard`, có `token`/`user`, Dashboard render nội dung | Chưa đổi chiến lược lưu token trong localStorage. |
| Refresh Dashboard | Closed | Browser smoke: refresh `/dashboard` vẫn giữ Dashboard, không bị kick về `/login` | Auth provider vẫn phụ thuộc localStorage hiện tại. |
| Logout | Closed | Browser smoke: logout về `/login`, xóa `token` và `user` | Nên xem xét xóa thêm state liên quan nếu bổ sung key mới. |
| Login sai credential | Closed | API interceptor bỏ qua 401 của `/auth/login`; page hiện lỗi an toàn `Sai tài khoản hoặc mật khẩu`, không lưu token | Thông điệp lỗi đã an toàn, không lộ credential. |
| Admin seed password fallback | Closed | `backend/src/index.js` không còn fallback `admin123`; thiếu `ADMIN_PASSWORD` thì dừng seed admin | `admin123` chỉ còn là giá trị denylist weak secret trong config, không phải bypass/fallback. |
| Sample credential trên Login UI | Closed | Scan không thấy sample credential/fallback/standalone token trong `dashboard/src` và `backend/src` | Không có. |
| Env và secret hygiene | Preserved | Không stage `.env`; smoke script không in username/password/token/JWT/DB URL | Tiếp tục giữ policy này trong các prompt sau. |

Kết luận: Prompt 08H đã đóng lỗi login redirect/hydration regression và lỗ hổng UX của failed-login 401; các hardening lớn hơn về token/session nên để prompt riêng.

## Prompt 09 Feature Audit Update

Ngày cập nhật: 2026-07-10

| Nhóm | Trạng thái sau Prompt 09 | Bằng chứng | Điểm còn mở |
|---|---|---|---|
| RAG `$queryRawUnsafe` | Closed trong runtime RAG | `backend/src/rag/pipeline.js` không còn `$queryRawUnsafe`; add/update/search dùng tagged template | Raw unsafe analytics/handoff/seed còn backlog ngoài RAG. |
| Vector/pgvector safety | Hardened | `assertEmbeddingVector`, `toPgVectorLiteral`, clamp limit/threshold; DB smoke vector query PASS | Placeholder vector dùng khi provider lỗi do DB đang NOT NULL. |
| Knowledge upload/scrape tenant scope | Closed | Upload/scrape truyền `tenantId: getTenantScope(req) || null` vào `ragPipeline.addDocument` | Multipart upload route chưa smoke HTTP vì không thêm package. |
| Scrape URL SSRF guard | Basic guard done | `validateScrapeUrl()` chặn `file:`, localhost, private/internal IP literal; unit smoke PASS | Chưa có DNS resolution guard cho domain trỏ về private IP. |
| RAG search tenant isolation | Verified local | `rag.search()` smoke: tenant row trả đúng scope, tenant khác không thấy | Full provider smoke không chạy để tránh external API. |

Kết luận: Prompt 09 đã đóng P0 RAG/raw SQL runtime và tenant scope upload/scrape; còn lại raw SQL analytics/handoff/seed cần prompt riêng.

## Prompt 09B Feature Audit Update

Ngày cập nhật: 2026-07-10

| Nhóm | Trạng thái sau Prompt 09B | Bằng chứng | Điểm còn mở |
|---|---|---|---|
| Analytics `$queryRawUnsafe` | Closed trong `GET /api/analytics` | 4 query analytics đã chuyển sang Prisma `$queryRaw` tagged template, `sinceDate` là parameter | Không còn raw unsafe trong analytics route. |
| `days` query param | Hardened | Default `30`, min `1`, max `365`; `abc` trả 200 với default, `999999` trả 200 với clamp | Có thể bổ sung test tự động sau khi có test runner. |
| Analytics response contract | Preserved | Runtime smoke xác nhận các field `handoff`, `conversations`, `messages`, `intents` vẫn tồn tại | Không sửa dashboard UI trong prompt này. |
| Analytics authorization | PASS | No-token 401, tenant token 403, platform token 200 | Tenant handoff raw SQL vẫn cần prompt riêng. |
| Raw SQL còn lại | Backlog có chủ đích | Scan còn `backend/src/tenants/handoff.js` và `backend/scripts/seed.js` | Xử lý ở Prompt 09C/handoff hoặc Prompt 10 DevOps scripts. |

Kết luận: Prompt 09B đã đóng raw SQL analytics và giữ nguyên contract dashboard; backlog raw unsafe còn lại là handoff runtime và seed script nội bộ.

## Prompt 19A-FIX Feature Audit Update

Ngày cập nhật: 2026-07-10

| Nhóm | Trạng thái sau Prompt 19A-FIX | Bằng chứng | Điểm còn mở |
|---|---|---|---|
| Next.js chunk runtime | Closed | Sau `npm run quality`, audit `.next/server` và clean `.next`, không còn `Cannot find module './20.js'` | Khi chạy build rồi quay lại dev server cũ, cần restart/clean cache nếu gặp chunk mismatch. |
| Dashboard route smoke | PASS | Fresh dev server 3019: `/dashboard`, `/dashboard/analytics`, prompts, knowledge, settings, tenants, handoff, content-packages đều không 500/chunk error | Prompt 19B phải giữ dev-route smoke thật, không chỉ build. |
| Analytics source split | No source bug found | `features/analytics` client boundary hợp lệ; page/hook/filter/toggle dùng `'use client'`, formatter/types không import client hook | Không cần rollback 19A. |
| Backend smoke | PASS | Process 3001: health/login/prompts/settings/handoff/analytics/webhook/chatwoot 7/7 PASS | Không sửa backend trong prompt này. |
| Legacy script scan | Existing backlog | Scan còn script Chatwoot legacy trong `backend/scripts`/`start-all.bat`, không phát sinh từ 19A-FIX | Xử lý riêng nếu mở prompt DevOps cleanup, không trộn với bug fix này. |

Kết luận: Prompt 19A-FIX đã đóng regression runtime/chunk và thêm yêu cầu route smoke thật cho các bước split dashboard tiếp theo.
