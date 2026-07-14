# PROMPT 21B — BACKEND ROUTE CONSOLIDATION REPORT

Ngày thực hiện: 2026-07-11
Trạng thái: **PASS**

## 1. Mục tiêu

Tách tối đa 1 nhóm route read-only/low-risk từ `backend/src/api/dashboard.js` sang `presentation/http/**` theo pattern hiện có, giữ nguyên public API contract (path/method/auth/response shape), có runtime smoke thật, không đổi behavior. Không sửa dashboard/schema/migrations/package.

## 2. Resume state

Prompt 21B trước bị dừng trước khi patch. Phase R0 xác nhận **RESUME CLEAN**: working tree sạch hoàn toàn (`git diff` rỗng, không staged, không untracked source), HEAD = `9e0eaa8` (21A). Không có patch dang dở → tiếp tục từ Phase 3.

## 3. Preflight/baseline validation

- Branch `chore/prompt-05r-docs-local-run` (không master/main); commit 21A `9e0eaa8` tồn tại; không remote.
- `.env`/`.env.local`/`.next` gitignored; chỉ `backend/.env.example` tracked.
- Baseline backend `npm run quality` + `npx prisma validate` PASS.

## 4. Route map (dashboard.js còn lại)

Phân loại các route GET còn trong `dashboard.js`:

| Route | Method | Domain | Loại | Candidate? |
|---|---|---|---|---|
| `/quick-reply-menus` + `/:id` | GET | quick-replies | READ_ONLY_LOW_RISK | ✅ CHỌN |
| `/stats` | GET | dashboard | READ_ONLY_LOW_RISK | Sau |
| `/campaigns` + `/:id` | GET | campaigns | READ_ONLY_LOW_RISK (domain có upload) | Sau |
| `/channel-configs` + `/:id` | GET | channel-configs | READ_ONLY_LOW_RISK | Sau |
| `/content-packages*` | GET | content-packages | READ_ONLY_WITH_EXTERNAL_RISK (migrate) | Không |
| `/conversations/:id` | GET | conversations | DO_NOT_TOUCH (dùng `contextManager`/bot) | Không |
| `/appointments` | GET | appointments | DO_NOT_TOUCH (domain PUT+notification) | Không |
| `/providers*` | GET | providers | EXTERNAL_INTEGRATION | Không |
| `/facebook-pages*`, `/fb-subscription`, `/settings/facebook-menu` | GET | facebook | EXTERNAL_INTEGRATION | Không |
| `/handoff/*` | GET | handoff | REALTIME_HANDOFF | Không |
| `/analytics` | GET | analytics | RAW_SQL ($queryRaw) | Không |
| `/admin-users`, `/auth/me` | GET | auth | AUTH_CORE | Không |
| `/tenants*` | GET | tenants | TENANT_CORE | Không |

## 5. Candidate selection

| Tiêu chí | Kết quả |
|---|---|
| Route được chọn | `GET /api/quick-reply-menus` (list) + `GET /api/quick-reply-menus/:id` (detail) |
| Vì sao an toàn | Chỉ GET, read-only Prisma; không external/upload/raw SQL/mutation/notification/handoff; tenant guard sẵn (07C) |
| Vì sao không chọn khác | conversations/:id phụ thuộc `contextManager` (bot); appointments/facebook/providers/handoff/analytics bị loại theo prompt; campaigns/channel-configs để bước sau |
| Auth/tenant hiện tại | `authMiddleware` + `getTenantScope`; platform admin `tenantId=null`, tenant admin lock tenant mình |
| Response shape | list: mảng menu; detail: object menu hoặc 404 `{error:'Not found'}` |
| Smoke sẽ chạy | 401 no-token; 200 list; 404 detail id ảo; POST fall-through 400 |
| Rollback | Revert commit (thuần code) |

## 6. Split design

Theo đúng pattern `prompts`/`settings`:

- Repository `infrastructure/repositories/quickReplyMenus.repository.js`: `findManyForScope({tenantId,intentType,pageId})` (where `{tenantId: tenantId ?? null}` + optional filters, orderBy `[{intentType:'asc'},{createdAt:'desc'}]`) và `findByIdForScope({id,tenantId})` (tenantId → `findFirst({id,tenantId})`, else `findUnique({id})` — thay `findScopedById`). Không import Express/env.
- Controller `presentation/http/controllers/dashboard/quickReplyMenus.controller.js`: `createListQuickReplyMenus`, `createGetQuickReplyMenu` (giữ HTTP concern + 404/500 như cũ).
- Routes `presentation/http/routes/dashboard/quickReplyMenus.routes.js`: factory `createQuickReplyMenuRoutes({authMiddleware,getTenantScope,prisma})` → `GET /` + `GET /:id`.
- `dashboard.js`: thêm require; `router.use('/quick-reply-menus', ...)` tại vị trí GET cũ; POST/PUT/DELETE giữ nguyên bên dưới (Express fall-through khi method không khớp, giống `/prompts`).

## 7. Files changed

Source:
- `backend/src/api/dashboard.js` (modified)
- `backend/src/infrastructure/repositories/quickReplyMenus.repository.js` (mới)
- `backend/src/presentation/http/controllers/dashboard/quickReplyMenus.controller.js` (mới)
- `backend/src/presentation/http/routes/dashboard/quickReplyMenus.routes.js` (mới)

Docs/report:
- `docs/status/PROJECT_PROGRESS.md`, `docs/status/FEATURE_AUDIT_CHECKLIST.md`, `docs/roadmap/REFACTOR_PLAN.md`, `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/phase-21/PROMPT_21B_BACKEND_ROUTE_CONSOLIDATION_REPORT.md` (mới)

## 8. API behavior preservation

- Public path `/api/quick-reply-menus` và `/api/quick-reply-menus/:id` giữ nguyên.
- Method GET, `authMiddleware` + `getTenantScope` giữ nguyên.
- Query `intentType`/`pageId`, where/orderBy, tenant scope, 404/500 handling giữ nguyên.
- Không đổi response JSON; POST/PUT/DELETE không thay đổi.

## 9. Static validation

- `node --check` PASS: `dashboard.js`, `index.js`, `db.js`, toàn bộ controllers/routes/repositories mới.
- `npm run quality` (syntax + prisma validate) PASS; `npx prisma validate` schema valid.
- `git diff --check` sạch (chỉ warning LF/CRLF).

## 10. Runtime smoke

Backend local port 3001 (tự start `node src/index.js`, DB `bbotech-pgvector-local` Up; đã dừng đúng process sau smoke, không in token/secret):

Regression:
- `GET /health` 200; `GET /api/prompts` 200; `GET /api/settings/handoff` 200; `GET /api/settings/telegram-destinations` 200; `GET /api/analytics?days=7` 200; `GET /webhook` 403; `POST /chatwoot-webhook` 404.

Route đã tách:
- `GET /api/quick-reply-menus` no-token → **401**; `GET /:id` no-token → **401**.
- `GET /api/quick-reply-menus` token → **200**, `isArray=true` (count=0, DB local chưa có menu — behavior hợp lệ).
- `GET /api/quick-reply-menus/<uuid-không-tồn-tại>` token → **404** `Not found`.
- Fall-through: `POST /api/quick-reply-menus` body rỗng → **400** `intentType là bắt buộc` (không mutation); `PUT /:id` reachable (500 là behavior gốc platform-admin update id ảo, không đổi).

Ghi chú: login smoke ban đầu bị nhiễu do dotenv v17 in banner vào stdout của script (đã khắc phục bằng `config({quiet:true})`); không phải lỗi app.

## 11. Safety scans

- Duplicate route: `dashboard.js` chỉ còn mount + POST/PUT/DELETE cho quick-reply-menus, **không còn GET trùng**.
- `$queryRawUnsafe`/`$executeRawUnsafe` trong `backend/src`+`backend/scripts`: **0**.
- Destructive trong `backend/src`: **0**.
- Không tạo Chatwoot runtime mới. `start-all.bat` vẫn còn Chatwoot bootstrap (backlog cũ, không sửa trong 21B).

## 12. Không thay đổi

- Không sửa `dashboard/src/**`, webhook/RAG/tenants/telegram/bot/notifications/facebook.
- Không sửa `schema.prisma`, `migrations/**`, package.json/lock, Dockerfile/start-all/docker-compose.
- Không sửa `.env`/`.env.local`/`.next`/backup/temp/log; không `git add .`; không push remote.
- Không xóa legacy dirs; không archive docs; không làm 21C/21D.

## 13. Remaining risks

- `dashboard.js` vẫn còn phần lớn route monolith (backlog tiếp tục ở 21B-2…).
- DB local chưa có quick-reply data nên list smoke là mảng rỗng (đúng behavior, không phải lỗi).
- `start-all.bat` Chatwoot backlog + docs stale (`MULTITENANT_PROGRESS.md`, `ROADMAP.md`) — ngoài phạm vi 21B.

## 14. Final verdict

**PASS** — tách 2 route read-only, static + runtime smoke PASS, API contract giữ nguyên, không đổi behavior, không đụng forbidden area.

## 15. Next step

Prompt 21B-2 tiếp tục route read-only/low-risk kế tiếp (campaigns hoặc channel-configs list/detail) theo cùng pattern; hoặc 21C (dashboard content-packages locked) / 21D (docs + legacy cleanup). Không chọn webhook/RAG/handoff/tenants/appointments/settings-external.
