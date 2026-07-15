# PROJECT STRUCTURE CONSOLIDATION PLAN

Ngày tạo: 2026-07-11 (Prompt 21A)
Loại tài liệu: **AUDIT / PLAN-ONLY**. Prompt 21A **không** move code, không rename folder, không đổi import, không đổi behavior.
Nguồn: audit read-only + static validation (backend `npm run quality` + `prisma validate`, dashboard `typecheck` + `build`).

---

## Cap nhat 19E - Settings API client normalization

Ngay cap nhat: 2026-07-15

Prompt 19E da PASS o pham vi dashboard API client:

- `dashboard/src/app/dashboard/settings/page.tsx` khong con direct `fetch()`.
- API call settings duoc dua ve `dashboard/src/lib/api.ts`.
- Khong split feature folder trong prompt nay, nen cau truc dashboard feature chua thay doi lon.
- Khong anh huong Phase 21 backend structure; khong sua `backend/src/api/dashboard.js`.
- Khong sua schema/env/package/webhook/Website Chatwoot runtime.

Tac dong len consolidation:

- Phase 19 co tien de an toan hon de mo `19F Settings feature split`.
- Phase 21 van **STARTED / HIGH_RISK_ONLY_REMAINING** sau 21B-6; khong mo tiep 21B thuong neu khong co prompt high-risk rieng.

---

## Cập nhật 23A - Hybrid Website Chatwoot architecture decision

Ngày cập nhật: 2026-07-14

Prompt 23A đã PASS ở phạm vi docs-only/ADR-only:

- Facebook Messenger vẫn đi direct qua Express `GET/POST /webhook`.
- Website live-chat có thể dùng Chatwoot như integration riêng nếu được duyệt ở 23B+.
- Chatwoot không được dùng làm trung gian cho Facebook.
- Legacy `/chatwoot-webhook*` không được khôi phục.
- Endpoint khuyến nghị cho Website Chatwoot tương lai là `POST /integrations/website-chat/events`.

Tác động lên Phase 21 structure:

- Không ảnh hưởng trực tiếp tới backend route consolidation hiện tại.
- Không move webhook/RAG/handoff/tenants trong refactor thường.
- Không sửa `backend/src/api/dashboard.js`, dashboard source, Prisma schema/migration, package hoặc env thật trong 23A.
- Nếu Website Chatwoot được triển khai sau này, phải đi qua prompt riêng với Clean Architecture target: route mỏng, use case normalize event, domain channel message, infrastructure adapter/verifier/client.

---

## Cập nhật 21B-5 - Backend admin-users read consolidation

Ngày cập nhật: 2026-07-14

Prompt 21B-5 đã PASS: tách `GET /api/admin-users` sang `backend/src/presentation/http/**` + `backend/src/infrastructure/repositories/adminUsers.repository.js`.

- Candidate được chọn vì GET-only, `platformAdminOnly`, chỉ đọc Prisma `findMany` với `select` không chứa `passwordHash`.
- Không external provider, không mutation, không raw SQL, không secret/token field.
- `backend/src/api/dashboard.js` chỉ mount `router.use('/admin-users', ...)`; `POST` và `DELETE` cùng domain vẫn giữ nguyên trong monolith.
- Public API contract giữ nguyên: path `/api/admin-users`, method GET, `authMiddleware`, `platformAdminOnly`, 401/403/200, response array cũ, error 500 `Internal server error`.
- Validation/smoke PASS: backend quality, Prisma validate, dashboard typecheck/build, backend smoke candidate + regression read routes, dashboard full route/static/dev-log gate.

Phase 21 vẫn **STARTED**, chưa Done; các route còn lại cần audit nghiêm, không tách nếu rơi vào external/mutation/PII/tenant core/RAG/handoff/analytics raw SQL risk.

---

## Cập nhật 21Y - Docs/report physical reorganization

Ngày cập nhật: 2026-07-14

Prompt 21Y đã PASS và chỉ thay đổi docs/report.

- Move vật lý docs/report bằng `git mv`.
- Root `docs/` chỉ giữ `README.md`; docs hiện nằm trong `docs/status/`, `docs/index/`, `docs/roadmap/`, `docs/runbooks/`, `docs/policies/`, `docs/architecture/`, `docs/archive/`.
- Root `report/` chỉ giữ `README.md`; reports hiện nằm trong `report/phase-17/`, `report/phase-18/`, `report/phase-19/`, `report/phase-20/`, `report/phase-21/`, `report/phase-22/`, `report/bugs/`, `report/archive/early-prompts/`.
- Tạo `docs/status/PROJECT_PROGRESS_MASTER.md` và `docs/status/PROJECT_PHASE_BOARD.md`.
- Cập nhật status/index/map để loại bỏ trạng thái "chưa move".
- Broken-link check docs/report PASS.
- Dashboard/backend validation và runtime regression gate PASS.

Không sửa backend/dashboard source, schema/migration/package/env. Phase 21 vẫn **STARTED** vì backend monolith debt còn; riêng docs/report physical organization là **DONE**.

---

## Cập nhật 21X - Global dashboard runtime + docs/report organization

Ngày cập nhật: 2026-07-14

Prompt 21X đã PASS và không thay đổi source structure.

- Bug `Bug_21C-3.md` được phân loại **MIXED_DEV_SERVER_OR_PORT + STALE_NEXT_DEV_CACHE**.
- Dừng đúng dashboard Next dev server cũ thuộc workspace trên port `3002`, PID `20916/3524`.
- Clean `.next`, rebuild, fresh dev server `3019`.
- Full dashboard route smoke PASS: `/dashboard/tenants` hiện 200, các dashboard routes thật không 500, route giả 404 hợp lệ.
- Static asset smoke PASS: 125 `_next/static` CSS/JS assets đều 200; không còn layout CSS/main-app/app-pages/page chunk 404.
- Dev log scan sạch: không còn missing chunk, `MODULE_NOT_FOUND`, `webpack.cache` ENOENT, `vendor-chunks` hoặc `/dashboard/tenants 500`.
- Tạo status hub/docs organization: `docs/status/PROJECT_STATUS_MASTER.md`, `docs/status/BUG_TRACKER.md`, `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md`, `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md`, report indexes.

Không sửa backend/schema/migration/package/dashboard source/API client/auth/config/webhook/RAG/handoff/tenants/Docker/env thật. Chưa move historical docs/report; chỉ tạo index/README để tránh gãy link. Phase 19 và Phase 21 vẫn **Started**, chưa Done.

---

## Cập nhật 21C-3-SAFE - Dashboard campaigns feature split

Ngày cập nhật: 2026-07-14

Prompt 21C-3-SAFE đã PASS: tách `dashboard/src/app/dashboard/campaigns/page.tsx` sang `dashboard/src/features/campaigns/**`.

- Page trước refactor: 196 LOC; sau refactor: 57 LOC.
- Feature mới gồm hook `useCampaigns`, components header/loading/empty/list/form modal, `types.ts`, formatter asset label và barrel `index.ts`.
- Route `/dashboard/campaigns`, UI text/className/layout và `campaignsApi` contract giữ nguyên.
- Upload/create/update/delete handlers được di chuyển nguyên behavior sang hook.
- Upload/write/delete được đánh dấu **LOCKED_NOT_EXECUTED** trong runtime smoke.
- Validation PASS: dashboard typecheck/build, backend quality, Prisma validate.
- Clean `.next` + fresh dev route smoke PASS trên port `3019`, không tái hiện chunk error.

Không sửa backend/schema/migration/package/API client/auth/config/webhook/RAG/handoff/tenants/Docker/env thật. Phase 19 vẫn **Started**, chưa Done; Phase 21 vẫn **Started**, chưa Done.

---

## Cập nhật 21C-2-SAFE - Dashboard quick-replies feature split

Ngày cập nhật: 2026-07-14

Prompt 21C-2-SAFE đã PASS: tách `dashboard/src/app/dashboard/quick-replies/page.tsx` sang `dashboard/src/features/quick-replies/**`.

- Page trước refactor: 182 LOC; sau refactor: 52 LOC.
- Feature mới gồm hook `useQuickReplies`, components header/loading/error/empty/list/form modal, `types.ts`, formatter intent label và barrel `index.ts`.
- Route `/dashboard/quick-replies`, UI text/className/layout và `quickReplyMenusApi` contract giữ nguyên.
- Create/update/delete handlers được di chuyển nguyên behavior sang hook.
- Mutation được đánh dấu **LOCKED_NOT_EXECUTED** trong runtime smoke.
- Validation PASS: dashboard typecheck/build, backend quality, Prisma validate.
- Clean `.next` + fresh dev route smoke PASS trên port `3019`, không tái hiện chunk error.

Không sửa backend/schema/migration/package/API client/auth/config/webhook/RAG/handoff/tenants/Docker/env thật. Phase 19 vẫn **Started**, chưa Done; Phase 21 vẫn **Started**, chưa Done.

---

## Cập nhật 21C-FIX - Dashboard runtime chunk error

Ngày cập nhật: 2026-07-14

Prompt 21C-FIX đã PASS và không thay đổi source structure.

- Root cause: **STALE_NEXT_DEV_CACHE_RESOLVED**.
- Bug evidence nằm trong `.next/server/webpack-runtime.js`, static chunks 404 và webpack cache ENOENT, không phải import/source structure mới.
- Audit `dashboard/src/features/content-packages/**` và các route bị lỗi không tìm thấy source import/client-boundary bug.
- `.next` ignored đã được xóa sau khi dừng dashboard dev server cũ; typecheck/build sạch.
- Fresh dev server tạm port `3019` route smoke PASS cho dashboard routes liên quan.

Không sửa backend, dashboard source, schema/migration/package, Docker/start scripts hoặc env thật. Phase 19 và Phase 21 vẫn **Started**, chưa Done.

---

## Cập nhật 21C-SAFE - Dashboard content-packages feature split

Ngày cập nhật: 2026-07-13

Prompt 21C-SAFE đã PASS: tách `dashboard/src/app/dashboard/content-packages/page.tsx` sang `dashboard/src/features/content-packages/**`.

- Page trước refactor: 671 LOC; sau refactor: 85 LOC.
- Feature mới gồm hook `useContentPackages`, components header/error/loading/list/detail/form modal, `types.ts`, formatter label và barrel `index.ts`.
- Route `/dashboard/content-packages`, UI text/className/layout và `contentPackagesApi` contract giữ nguyên.
- Package CRUD, item CRUD và handler migrate được di chuyển nguyên behavior sang hook.
- Migrate action từ campaign được đánh dấu **MIGRATE_ACTION_LOCKED_NOT_EXECUTED**: không chạy/click/gọi trong smoke.
- Validation PASS: dashboard typecheck/build, backend quality, Prisma validate.
- Runtime route smoke GET-only PASS trên dashboard dev server tạm port `3019`.

Không sửa backend/schema/migration/package/API client/auth/config/webhook/RAG/handoff/tenants/Docker/env thật. Phase 19 vẫn **Started**, chưa Done; Phase 21 vẫn **Started**, chưa Done.

---

## Cập nhật 21B-4 - Backend stats read consolidation

Ngày cập nhật: 2026-07-13

Prompt 21B-4 đã PASS: tách `GET /api/stats` sang `backend/src/presentation/http/**` + `backend/src/infrastructure/repositories/dashboardStats.repository.js`.

- Candidate được chọn vì GET-only, `platformAdminOnly`, chỉ đọc Prisma/count/groupBy và tính toán in-memory.
- Không external provider, không mutation, không upload, không migrate/action, không raw SQL, không secret/token field.
- `backend/src/api/dashboard.js` chỉ còn require + `router.use('/stats', ...)`; không duplicate handler cũ.
- Public API contract giữ nguyên: path `/api/stats`, method GET, `authMiddleware`, `platformAdminOnly`, response totals + `messagesByDay` + `intentDistribution`, error 500 `Lỗi máy chủ nội bộ`.
- Validation/smoke PASS: backend quality, Prisma validate, dashboard typecheck, stats 401/403/200, regression read routes và webhook/legacy 403/404.

Không sửa webhook/RAG/bot/tenants/telegram/facebook/notifications/dashboard/schema/package. Phase 21 vẫn **Started**, chưa Done; monolith `dashboard.js` còn route debt nhưng đã giảm thêm 1 GET handler.

---

## Cập nhật 22A - Meta webhook staging readiness

Ngày cập nhật: 2026-07-12

Prompt 22A không move code và không refactor runtime. Phạm vi là audit readiness cho public HTTPS staging của direct Meta webhook:

- Tạo `docs/status/META_WEBHOOK_STAGING_READINESS.md`.
- Xác nhận source route `GET/POST /webhook` sẵn sàng cho callback `https://<domain>/webhook`.
- Xác nhận `/api/settings/webhook` chỉ là dashboard config/read endpoint có auth, không phải callback Meta.
- Local smoke an toàn PASS trên backend hiện có; public HTTPS smoke chưa chạy vì không có `STAGING_BASE_URL`.
- Public HTTPS readiness vẫn **STAGING_URL_MISSING**; Meta verify challenge và Meta POST event thật vẫn **PENDING**.

Không đánh dấu Phase 21 Done. Prompt này không giảm thêm route debt trong `dashboard.js` và không sửa structure source.

---

## Cập nhật 21D - Docs/legacy cleanup completed

Ngày cập nhật: 2026-07-12

Prompt 21D đã PASS ở phạm vi docs/legacy:

- Tạo `docs/index/CURRENT_STATUS_INDEX.md` và `docs/index/HISTORICAL_DOCS_INDEX.md`.
- Gắn stale notice cho root docs `MULTITENANT_PROGRESS.md` và `ROADMAP.md`.
- Xóa 3 thư mục legacy rỗng được phép: `backend/src/chatwoot`, `backend/src/adapters`, `backend/src/infrastructure/integrations/chatwoot`.
- Giữ nguyên historical reports; không archive/move report trong prompt này.
- Không sửa runtime source, dashboard source, schema/migrations/package hoặc start scripts.

Remaining risks sau 21D:

- `backend/src/api/dashboard.js` vẫn còn route debt, dù 21B/21B-2/21B-3 đã rút dần read routes.
- `settings`, `knowledge`, `tenants`, `handoff` vẫn là khu vực rủi ro cao, không tách nếu chưa có prompt riêng.
- `start-all.bat`, `start_all.bat`, `stop-all.bat` còn Chatwoot local legacy; đã phân loại backlog, chưa sửa.
- `docs/architecture/ARCHITECTURE.md` và `docs/architecture/FEATURE_INVENTORY.md` còn đoạn lịch sử Chatwoot; đọc kèm `docs/index/CURRENT_STATUS_INDEX.md`.
- Meta verification/public HTTPS/production rollout vẫn pending.

Phase 21 vẫn **Started**, chưa Done.

---

## Cập nhật 21B-3 - Backend campaigns read consolidation

Ngày cập nhật: 2026-07-12

Prompt 21B-3 đã chạy và PASS: tách `GET /api/campaigns` list/detail sang `backend/src/presentation/http/**` + `backend/src/infrastructure/repositories/campaigns.repository.js`. Chỉ route GET read-only được tách; `POST /campaigns/upload`, `POST /campaigns`, `PUT /campaigns/:id`, `DELETE /campaigns/:id` vẫn ở `dashboard.js`. Public API contract giữ nguyên, `platformAdminOnly` giữ nguyên, không external/mutation/raw SQL/secret cho candidate đã chọn.

Validation/smoke PASS: backend quality, Prisma validate, node syntax checks, runtime smoke source mới cho campaigns 401/403/200/404 và regression route trọng yếu. Không sửa dashboard source, Prisma schema/migrations, package, Docker/script hoặc env thật. Phase 21 vẫn **Started**, chưa Done; monolith `dashboard.js` còn route debt nhưng đã giảm thêm 2 GET handler.

Next: 21B-4 nếu còn route read-only thật sự an toàn, hoặc 21D docs/legacy cleanup, hoặc 21C dashboard content-packages với guard migrate/external.

---

## Cập nhật 21S - Product goal và Facebook webhook readiness

Ngày cập nhật: 2026-07-12

Prompt 21S không move code và không refactor runtime. Mục tiêu là đồng bộ lại mục tiêu sản phẩm/kiến trúc trước khi tiếp tục Phase 21:

- Product goal hiện tại: nhận tin nhắn Facebook Messenger qua Meta Developer Webhook, xử lý trong backend Express custom bằng bot/AI/RAG/handoff, quản trị qua Dashboard Next.js nội bộ, lưu dữ liệu trong PostgreSQL/pgvector.
- Architecture goal hiện tại: **No-Chatwoot target**. Callback Meta thật là `GET/POST /webhook`; `/api/settings/webhook` chỉ là endpoint dashboard config/read có auth.
- Structure goal hiện tại: Clean Architecture tiếp tục đi từng bước nhỏ; Phase 21 vẫn **Started**, chưa Done.
- Production goal hiện tại: local/staging readiness improved, nhưng production rollout thật vẫn **PRODUCTION_PENDING** cho tới khi có backup + `prisma migrate deploy` + smoke production thật.

Facebook Developer Webhook readiness:

| Tầng | Trạng thái | Bằng chứng | Next action |
|---|---|---|---|
| Source route readiness | DONE | `backend/src/index.js` mount `GET/POST /webhook`; `backend/src/webhook/handler.js` verify `hub.challenge` và xử lý POST page event | Giữ nguyên endpoint khi refactor. |
| Local runtime readiness | LOCAL_READY with current warning | Reports trước smoke 403/404 PASS; Prompt 21S không smoke lại được do Docker/DB/backend local không chạy | Bật lại Docker/local DB rồi smoke lại nếu cần runtime proof mới. |
| Dashboard config readiness | LOCAL_READY | `GET /api/settings/webhook` trả mask/null + `webhookUrl`, có auth | Không dùng route này làm Meta callback. |
| Public HTTPS readiness | STAGING_PENDING | Chưa có public URL trong Prompt 21S | Trỏ domain staging tới `/webhook`, smoke HTTPS. |
| Meta verify challenge | META_PENDING | Chưa có callback/challenge thật từ Meta Developer | Verify token thật qua Meta Developer app. |
| Meta POST event | META_PENDING | Chưa có event thật từ Meta | Test event thật từ Meta sau khi staging URL sẵn sàng. |
| Production rollout | PRODUCTION_PENDING | Checklist production yêu cầu backup/migrate/smoke prod chưa chạy | Chạy theo `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`. |

Không đánh dấu Phase 21 Done sau Prompt 21S. Prompt kế tiếp nên là 21B-3 nếu tiếp tục giảm nợ backend route read-only, hoặc 21D nếu muốn dọn stale docs/legacy trước, hoặc 21C nếu quay lại dashboard split có guard rõ.

---

## 1. Current status

- Phase 17 (No-Chatwoot), Phase 18 (RAG/raw SQL), Phase 20 (DevOps/deploy) đã **Done**.
- Phase 19 (Dashboard feature split) đang **Started**: analytics/prompts/staff/appointments đã tách sang `features/**`.
- Phase 21 (Project structure consolidation) trước Prompt 21A là **Planned**; sau Prompt 21A chuyển sang **Started — audit/plan-only** (chưa move code).
- Baseline validation Prompt 21A: **PASS** (chi tiết mục 10).
- Kiến trúc hiện tại vẫn là **mixed-module**: đã tạo đầy đủ shell Clean Architecture nhưng phần lớn runtime vẫn nằm ở module gốc (`backend/src/api/dashboard.js`, các `app/dashboard/*/page.tsx` lớn).

---

## 2. Backend structure map

| Khu vực | Hiện trạng | Vấn đề cấu trúc | Rủi ro nếu move ngay | Đề xuất Phase 21B |
|---|---|---|---|---|
| `src/index.js` (388) | Entry Express + startup seed/telegram/health/daily report | Nhiều concern trong 1 file | Cao (startup timing) | Giữ nguyên |
| `src/db.js` (16) | Re-export Prisma singleton | OK | — | Giữ nguyên |
| `src/api/dashboard.js` (**2363 LOC, 96 route**) | Monolith: auth, CRUD, analytics, settings, tenant, staff, handoff | Rất lớn, đa domain, Prisma scattered | Cao | Tách thêm **route read-only/low-risk** từng nhóm nhỏ |
| `src/presentation/http/**` | Đã tách: `prompts` (GET) + `settings` (handoff/telegram) + `quick-reply-menus` (GET list+detail, 21B) + `channel-configs` (GET list+detail, 21B-2) | Đã rút ~9 route/handler | Thấp | Tiếp tục pattern controller/routes |
| `src/infrastructure/repositories/**` | 3 repo: handoffSettings, promptTemplates, telegramDestinations | Ít, đúng hướng | Thấp | Gom thêm repo cho domain đã có guard |
| `src/infrastructure/persistence/prisma/client.js` | Re-export `db.js` | OK | — | Giữ nguyên |
| `src/infrastructure/services/` | `config.js`, `credentialCrypto.js` | OK | — | Giữ nguyên |
| `src/domain/**`, `src/application/**` | **README-only shell (rỗng)** | Placeholder chưa dùng | — | Chưa cần; điền khi có use-case thật |
| `src/bot/**`, `src/rag/**`, `src/webhook/**`, `src/tenants/**`, `src/telegram/**`, `src/facebook/**`, `src/llm/**`, `src/notifications/**` | Runtime flat modules | Chưa vào `infrastructure/integrations` | **Cao** (webhook timing, handoff state, RAG, notification) | **KHÔNG move** trong 21B |
| `src/chatwoot/`, `src/adapters/`, `src/infrastructure/integrations/chatwoot/` | **Dir rỗng 0 file** (legacy placeholder) | Rác cấu trúc | Thấp | Cleanup ở 21D (không phải 21A) |
| `prisma/schema.prisma` (338), `prisma/migrations/**` (12) | Ổn định sau 08F/20 | — | **Cao** | KHÔNG đụng |
| `prisma/migrations_backup/` | README-only | — | — | Giữ/archive sau |

**Nhận định backend:**
- `api/dashboard.js` vẫn là điểm nợ cấu trúc lớn nhất (96 route, Prisma trực tiếp scattered).
- Clean Architecture shell đầy đủ nhưng `domain`/`application` chưa có code thật → chưa có dependency ngược layer (an toàn).
- Không còn `$queryRawUnsafe`/`$executeRawUnsafe` trong `src`/`scripts` (Phase 18 giữ vững).
- Không có Chatwoot runtime mới trong `src` (chỉ 3 README lịch sử).

---

## 3. Dashboard structure map

| Page/Module | LOC | Side effect | Đã có `features/**`? | Rủi ro | Đề xuất |
|---|---:|---|---|---|---|
| `analytics/page.tsx` | 54 | Read-only | ✅ Split (19A) | Thấp | Xong |
| `prompts/page.tsx` | 52 | Write nhẹ | ✅ Split (19B) | Thấp | Xong |
| `staff/page.tsx` | 51 | Write | ✅ Split (19C) | Thấp | Xong |
| `appointments/page.tsx` | 37 | Write + notification | ✅ Split (19D) | Trung bình | Xong (mutation NOT RUN BY DESIGN) |
| `quick-replies/page.tsx` | 181 | Write nhẹ | Placeholder README | Thấp | Candidate tương lai |
| `conversations/page.tsx` | 193 | Read + handoff view | Placeholder README | Trung bình | Sau |
| `campaigns/page.tsx` | 196 | Write | Placeholder README | Thấp | Candidate tương lai |
| `channel-configs/page.tsx` | 317 | Write | Placeholder README | Trung bình | Sau |
| `knowledge/page.tsx` | 358 | **Upload/reindex/crawl** | Placeholder README | **Cao** | KHÔNG tách trước prod |
| `handoff/page.tsx` | 581 | Handoff realtime | Placeholder README | **Cao** | KHÔNG tách trước prod |
| `content-packages/page.tsx` | 671 | Write (migrate action) | Placeholder README | Trung bình-Cao | Chỉ tách nếu **khóa rõ** action migrate/external |
| `settings/page.tsx` | 725 | **Write + provider/external + direct `fetch()`** | Placeholder README | **Cao** | KHÔNG tách trước khi chuẩn hóa API client |
| `tenants/page.tsx` | 1127 | Write nặng | Placeholder README | **Cao** | KHÔNG tách trước prod |
| `lib/api.ts` (265) | — | Facade axios chính | — | Thấp | Giữ compatibility facade |
| `lib/api/client.ts` | — | Axios entry mới | — | Thấp | Giữ, chưa ép migrate |
| `lib/config/env.ts`, `lib/auth.tsx` (94) | — | Config/auth | — | Thấp | Giữ nguyên |

**Nhận định dashboard:**
- 4 page đã thành orchestrator mỏng (<60 LOC), pattern hook + components + formatter/type/barrel ổn định.
- Các page còn lại phần lớn là **placeholder feature README rỗng** → chưa có circular import qua barrel.
- **`settings/page.tsx` có 6 lời gọi `fetch()` trực tiếp** (webhook, facebook-menu, facebook-pages) bỏ qua `lib/api.ts` → phải chuẩn hóa API client trước khi tách feature.
- Không phát hiện direct fetch mới ngoài settings; `lib/api/client.ts` dùng `axios.create` (hợp lệ); `lib/config/env.ts` chỉ chứa localhost fallback (config, hợp lệ).

---

## 4. Docs/report structure map

| Nhóm tài liệu | Hiện trạng | Có cần giữ? | Có nên archive? | Lý do |
|---|---|---|---|---|
| Current docs (`PROJECT_PROGRESS`, `REFACTOR_PLAN`, `FEATURE_AUDIT_CHECKLIST`, `QUALITY_GATE`, `DEPLOYMENT_POLICY`, `PRODUCTION_ROLLOUT_CHECKLIST`, `ARCHITECTURE`, `ENV_POLICY`, `FEATURE_INVENTORY`, `LOCAL_RUN_GUIDE`, `PHASE_19_*`) | Active, cập nhật đều | Giữ | Không | Nguồn trạng thái hiện tại |
| `docs/NO_CHATWOOT_*` | Plan lịch sử đã thực thi | Giữ | Có thể archive sau | Đã hoàn tất Phase 17 |
| `docs/archive/unclassified/appointment-modify-spec.md` | Spec nhỏ | Giữ | — | Tham chiếu feature |
| `report/PROMPT_*` (44 file) | Bằng chứng lịch sử từng prompt | **Giữ nguyên** | Có thể gom `report/archive/` ở 21D | Không rewrite/xóa historical |
| Root `MULTITENANT_PROGRESS.md` | **STALE**: mô tả `backend/src/chatwoot/api.js`, `tenants/webhookHandler.js`, `/chatwoot-webhook/:slug` — đều đã bị gỡ (08B) | Giữ như lịch sử | **Nên archive/gắn nhãn stale** | Mô tả kiến trúc Chatwoot cũ đã loại |
| Root `ROADMAP.md` | Roadmap cũ | Giữ | Có thể archive | Có thể lệch trạng thái hiện tại |
| Root `webhook-urls-current.txt` | Log local/stale | Không dùng làm nguồn prod | Không commit-source | Đã ghi rõ ở DEPLOYMENT_POLICY |

---

## 5. Active risks

| # | Risk | Loại | Trạng thái |
|---|---|---|---|
| R1 | `start-all.bat` (306 dòng) vẫn còn toàn bộ bootstrap Chatwoot (tunnel/agent-bot/`/chatwoot-webhook`) | Legacy script, **local-only** | Backlog cũ, không phát sinh 21A |
| R2 | `MULTITENANT_PROGRESS.md`, `ROADMAP.md` mô tả file/route Chatwoot đã bị gỡ | Docs stale | Cần gắn nhãn/archive (21D) |
| R3 | `settings/page.tsx` gọi `fetch()` trực tiếp + config Facebook external | Cấu trúc + external | KHÔNG tách settings trước khi chuẩn hóa client |
| R4 | `api/dashboard.js` 2363 LOC/96 route, Prisma scattered | Nợ cấu trúc backend | Tách dần route low-risk (21B) |
| R5 | Dir rỗng legacy `src/chatwoot`, `src/adapters`, `integrations/chatwoot` | Rác cấu trúc | Cleanup 21D |
| R6 | `appointments` PUT có notification side effect | Runtime external | Mutation smoke NOT RUN BY DESIGN |

**Sạch (không phải risk):** raw SQL unsafe = 0; destructive cmd thật = 0 (chỉ `migrate deploy`); Chatwoot runtime trong `src` = 0.

---

## 6. What must not be moved yet

- `backend/src/index.js`, `backend/src/api/dashboard.js` (chỉ rút từng route nhỏ, không move cả file).
- `backend/src/webhook/**`, `backend/src/tenants/**`, `backend/src/rag/**`, `backend/src/telegram/**`, `backend/src/bot/**`, `backend/src/notifications/**`.
- `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`.
- Dashboard: `settings`, `knowledge`, `tenants`, `handoff` page (write/external/realtime nặng).
- `dashboard/src/lib/api.ts` (giữ compatibility facade).
- Package/dependency, Dockerfile, `start-all.bat`, `docker-compose.yml`.

---

> **Cập nhật 21B (2026-07-11):** bước đầu đã chạy — tách `GET /quick-reply-menus` list+detail sang presentation + repository, runtime smoke PASS, behavior giữ nguyên. Phase 21 vẫn **Started**, chưa Done. Bước tiếp: 21B-2 (campaigns/channel-configs read) hoặc 21C/21D.
>
> **Cập nhật 21B-2 (2026-07-11):** tách tiếp `GET /channel-configs` list+detail (dual-model tenant/global, không secret) sang presentation + repository, runtime smoke PASS. Backend read route debt giảm dần; monolith `dashboard.js` vẫn còn phần lớn route. Không move webhook/RAG/handoff/tenants. Bước tiếp: 21B-3 (campaigns/stats) hoặc 21C/21D.

## 7. Phase 21B proposal — Backend structure consolidation (no behavior change)

| Thuộc tính | Nội dung |
|---|---|
| Scope | Tách thêm 1–2 nhóm route **read-only/low-risk** từ `api/dashboard.js` sang `presentation/http/{controllers,routes}` theo pattern prompts/settings; gom repository cho domain đã có tenant guard rõ. |
| Files allowed | `backend/src/api/dashboard.js` (chỉ rút route), `backend/src/presentation/http/**`, `backend/src/infrastructure/repositories/**`, docs/report. |
| Files forbidden | `webhook/**`, `tenants/**`, `rag/**`, `bot/**`, `notifications/**`, `index.js` (core), `schema.prisma`, `migrations/**`, package, Docker/scripts. |
| Validation | `npm run quality` (backend) + `npx prisma validate`. |
| Smoke | Backend read smoke (health/login token tạm/route đã tách 200); mutation NOT RUN nếu có notification. |
| Rollback | Revert commit (thuần code, không DB/dep change). |
| Risk level | Thấp–Trung bình. |

---

## 8. Phase 21C proposal — Dashboard structure consolidation

| Thuộc tính | Nội dung |
|---|---|
| Scope | Chỉ tách `content-packages/page.tsx` **nếu khóa rõ không chạy migrate action**; chuẩn hóa naming index/types cho các feature đã split. |
| Files allowed | `dashboard/src/app/dashboard/content-packages/page.tsx`, `dashboard/src/features/content-packages/**`, docs/report. |
| Files forbidden | `settings`, `knowledge`, `tenants`, `handoff` page; `lib/api.ts` behavior; package; backend. |
| Validation | `npm run quality`, `npm run typecheck`, `npm run build`. |
| Smoke | Clean `.next` + fresh dev server route smoke thật (route vừa tách + route trọng yếu, không 500/chunk error). |
| Rollback | Revert commit (thuần code). |
| Risk level | Trung bình. |

---

## 9. Phase 21D proposal — Docs/report consolidation & legacy cleanup

| Thuộc tính | Nội dung |
|---|---|
| Scope | Tạo docs index; gắn nhãn stale/archive plan cho `MULTITENANT_PROGRESS.md`/`ROADMAP.md`; đề xuất `report/archive/`; đề xuất dọn dir rỗng `src/chatwoot`, `src/adapters`, `integrations/chatwoot`. |
| Files allowed | docs mới/index, report; (cleanup dir rỗng chỉ khi có prompt riêng cho phép). |
| Files forbidden | Không rewrite/xóa nội dung historical report; không move source runtime. |
| Validation | Docs-only diff check. |
| Smoke | Không cần runtime. |
| Rollback | Revert commit docs. |
| Risk level | Thấp. |

---

## 10. Validation/smoke rules (đã chạy ở 21A — read-only)

- Backend: `npm run quality` **PASS**, `npx prisma validate` **PASS**.
- Dashboard: `npm run typecheck` **PASS**, `npm run build` **PASS** (19 route).
- `git diff --check` sạch; không có source/runtime diff sau validation.
- Không chạy: `prisma db push`, `--accept-data-loss`, `migrate reset`, `docker compose up`, `start-all.bat`, seed thật, external provider thật.

---

## 11. Production readiness note

| Nhóm | Trạng thái | Đủ public chưa? | Điều kiện trước production |
|---|---|---|---|
| Auth/login | Hardened (08G) | Local/staging OK | Set env prod mạnh, guard fail-fast |
| No-Chatwoot architecture | Runtime sạch trong `src` | OK | Dọn `start-all.bat` + docs stale |
| DB migration policy | `migrate deploy` release step | OK | Backup + migrate deploy thật |
| RAG/raw SQL | 0 unsafe | OK | — |
| Dashboard route smoke | 19 route build PASS | Local OK | Smoke production thật |
| Feature structure | 4/13 page split | Đủ chạy | Không bắt buộc tách hết trước prod |
| Docs/deploy checklist | Có đủ | OK | — |
| Env/secret policy | gitignored + guard | OK | Secret manager prod |
| Lint/quality | quality gate PASS | OK | ESLint (prompt dependency riêng) |
| Production rollout | **CHƯA chạy** | **CHƯA** | Backup + migrate deploy + smoke prod thật |

> **Kết luận:** chỉ được ghi **"local/staging readiness improved"**. **KHÔNG** ghi "production ready" vì chưa có backup + migrate deploy + smoke production thật.

---

## 12. Recommended next prompt

- **Prompt 21B** — Backend structure consolidation nhỏ (rút route read-only từ `api/dashboard.js`), nếu muốn giảm nợ cấu trúc backend an toàn.
- Ghi chu 2026-07-15: de xuat cu **Prompt 19E content-packages** da duoc thay the; 19E thuc te la Settings API client normalization. Prompt tiep theo nen la **19F Settings feature split**.
- **KHÔNG** chọn `settings`/`knowledge`/`tenants` nếu chưa có external rollback plan riêng.
## Cap nhat 23B - Website Chatwoot contract plan

Ngay cap nhat: 2026-07-15

Prompt 23B da PASS o pham vi docs-only:

- Khuyen nghi generic `TenantIntegration` cho schema additive sau, khong them lai `Tenant.chatwoot*`.
- Khong reuse `ChannelConfig`/`TenantChannelConfig` lam noi luu credential vi cac model nay chi phu hop routing/filter nhe.
- Feature flag de xuat `WEBSITE_CHAT_ENABLED=false`.
- Endpoint contract `POST /integrations/website-chat/events`.
- Khong anh huong truc tiep Phase 21B backend route consolidation.
- Khong move webhook/RAG/handoff/tenants trong refactor thuong.
## Cap nhat 21B-6-FINAL - Backend read route consolidation stop point

Ngay cap nhat: 2026-07-15

Prompt 21B-6-FINAL da ket luan **NO_SAFE_CANDIDATE**:

- Backend read-route consolidation thong thuong da toi diem dung.
- Khong co source patch trong prompt nay.
- `backend/src/api/dashboard.js` van con route debt, nhung phan con lai khong con thuoc nhom read-only low-risk.
- Phase 21 la **STARTED / HIGH_RISK_ONLY_REMAINING**.
- Khong move `webhook/**`, `rag/**`, `bot/**`, `tenants/**`, `facebook/**`, `telegram/**`, `notifications/**`.
- Khong code Website Chatwoot va khong tao endpoint `/integrations/website-chat/events`.

Huong tiep theo:

- Khong mo tiep 21B thuong chi de "tach them route".
- Neu can xu ly vung con lai, lap prompt rieng cho tung domain high-risk: conversations, knowledge/RAG, providers, handoff, Facebook, analytics, tenants hoac auth.
- Moi prompt high-risk phai co smoke/rollback/tenant-safety rieng, khong gop nhieu domain.
