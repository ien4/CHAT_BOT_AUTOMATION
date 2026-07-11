# PROMPT 21B-2 — BACKEND ROUTE CONSOLIDATION REPORT

Ngày thực hiện: 2026-07-11
Trạng thái: **PASS**

## 1. Mục tiêu

Tách tiếp tối đa 1 nhóm route read-only/low-risk từ `backend/src/api/dashboard.js` sang `presentation/http/**` (candidate-gated), giữ nguyên public API contract, runtime smoke thật, không đổi behavior. Không sửa dashboard/schema/migrations/package.

## 2. Preflight/baseline validation

- Branch `chore/prompt-05r-docs-local-run` (không master/main); commit 21B `e05b5c0` tồn tại; không remote.
- `.env`/`.env.local`/`.next` gitignored; chỉ `backend/.env.example` tracked; working tree sạch.
- Baseline backend `npm run quality` + `npx prisma validate` PASS.

## 3. Route map (candidate GET còn lại)

| Route | Method | Domain | Auth | Loại | Candidate? |
|---|---|---|---|---|---|
| `/channel-configs` + `/:id` | GET | channel-configs | authMiddleware + tenantScope | READ_ONLY_LOW_RISK | ✅ CHỌN (A) |
| `/campaigns` + `/:id` | GET | campaigns | platformAdminOnly | READ_ONLY_LOW_RISK (domain có upload) | Sau (B) |
| `/stats` | GET | dashboard | platformAdminOnly | READ_ONLY_LOW_RISK (không raw SQL) | Sau (C) |
| `/content-packages*` | GET | content-packages | authMiddleware | READ_ONLY_WITH_EXTERNAL_RISK (migrate) | Không |
| `/conversations/:id` | GET | conversations | authMiddleware | DO_NOT_TOUCH (contextManager/bot) | Không |
| `/appointments` | GET | appointments | authMiddleware | DO_NOT_TOUCH (PUT+notification) | Không |
| `/providers*`, `/facebook-*`, `/fb-subscription` | GET | providers/facebook | platformAdminOnly | EXTERNAL_INTEGRATION / SECRET_RISK | Không |
| `/handoff/*` | GET | handoff | platformAdminOnly | REALTIME_HANDOFF | Không |
| `/analytics` | GET | analytics | platformAdminOnly | READ_ONLY_WITH_RAW_SQL | Không |
| `/admin-users`, `/auth/me`, `/tenants*` | GET | auth/tenant | platform/tenant | AUTH_CORE / TENANT_CORE | Không |

## 4. Candidate safety evaluation (A/B/C)

- **A. channel-configs:** GET list + detail. Dual-model (`tenantChannelConfig` cho tenant admin, `channelConfig` global cho platform). Read-only, không external/upload/test. Schema `ChannelConfig` (inboxId, channelType, name, knowledgeFilter, botPersonaOverride, isActive) và `TenantChannelConfig` (tenantId, inboxId, channelType, name, knowledgeFilter, isActive) — **không có field token/secret/credential**. Smoke xác nhận `secretFields=NONE`. → READ_ONLY_LOW_RISK, **chọn**.
- **B. campaigns:** GET list/detail platformAdminOnly, read-only thuần Prisma, không secret; nhưng domain có `/campaigns/upload`. An toàn nhưng ưu tiên thấp hơn A. → để 21B-3.
- **C. stats:** GET platformAdminOnly, aggregation Prisma (count/groupBy/findMany), **không raw SQL**, không external; logic lớn hơn. → để sau.

## 5. Candidate selection

| Tiêu chí | Kết quả |
|---|---|
| Route được chọn | `GET /api/channel-configs` (list) + `GET /api/channel-configs/:id` (detail) |
| Vì sao an toàn | Chỉ GET read-only; không external/upload/mutation/raw SQL; không secret (schema) |
| Vì sao không chọn khác | B/C cũng low-risk nhưng A ưu tiên cao hơn; chỉ tách 1 nhóm/lần; các domain còn lại external/secret/bot/handoff/raw SQL/auth/tenant |
| Auth/tenant/platform | `authMiddleware` + `getTenantScope`; tenant → tenantChannelConfig theo tenantId; platform → channelConfig global; detail 404 khi null hoặc tenant mismatch |
| Response shape | list: mảng config; detail: object hoặc 404 `{error:'Not found'}` |
| Secret exposure | Không (`secretFields=NONE`) |
| External/mutation | Không |
| Smoke | 401 no-token, 200 list, 404 detail id ảo, POST fall-through 400 |
| Rollback | Revert commit |

## 6. Split design

- Repository `infrastructure/repositories/channelConfigs.repository.js`: `findManyForScope({tenantId})` (tenant → `tenantChannelConfig.findMany({where:{tenantId},orderBy:{channelType:'asc'}})`, else `channelConfig.findMany({orderBy:{channelType:'asc'}})`) và `findByIdForScope({id,tenantId})` (tenant → `tenantChannelConfig.findUnique` + kiểm `tenantId` mismatch → null; else `channelConfig.findUnique`). Không import Express/env.
- Controller `channelConfigs.controller.js`: `createListChannelConfigs`, `createGetChannelConfig` (404 khi repository trả null — giữ đúng behavior 404 hai nhánh cũ).
- Routes `channelConfigs.routes.js`: factory `createChannelConfigRoutes({authMiddleware,getTenantScope,prisma})` → `GET /` + `GET /:id`.
- `dashboard.js`: thêm require; `router.use('/channel-configs', ...)` tại vị trí GET cũ; POST/PUT/DELETE giữ nguyên bên dưới (fall-through như 21B). Route `/tenants/:id/channel-configs` là path khác, không đụng.

## 7. Files changed

Source:
- `backend/src/api/dashboard.js` (modified)
- `backend/src/infrastructure/repositories/channelConfigs.repository.js` (mới)
- `backend/src/presentation/http/controllers/dashboard/channelConfigs.controller.js` (mới)
- `backend/src/presentation/http/routes/dashboard/channelConfigs.routes.js` (mới)

Docs/report:
- `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`, `docs/REFACTOR_PLAN.md`, `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/PROMPT_21B_2_BACKEND_ROUTE_CONSOLIDATION_REPORT.md` (mới)

## 8. API behavior preservation

- Public path `/api/channel-configs` + `/api/channel-configs/:id` giữ nguyên.
- Method GET, `authMiddleware` + `getTenantScope` giữ nguyên.
- Dual-model tenant/global, orderBy `channelType asc`, 404 logic (null hoặc tenant mismatch), 500 handling giữ nguyên.
- Không đổi response JSON; POST/PUT/DELETE + `tenantRegistry.invalidate` không thay đổi.

## 9. Static validation

- `node --check` PASS: `dashboard.js`, `index.js`, toàn bộ controllers/routes/repositories mới.
- `npm run quality` + `npx prisma validate` PASS.
- `git diff --check` sạch (chỉ warning LF/CRLF).

## 10. Runtime smoke

Backend local port 3001 (tự start `node src/index.js`, DB `bbotech-pgvector-local` Up; đã dừng đúng process sau smoke; không in token/secret):

Regression:
- `GET /health` 200; `GET /api/prompts` 200; `GET /api/settings/handoff` 200; `GET /api/settings/telegram-destinations` 200; `GET /api/analytics?days=7` 200; `GET /api/quick-reply-menus` (21B) 200; `GET /webhook` 403; `POST /chatwoot-webhook` 404.

Route đã tách:
- `GET /api/channel-configs` no-token → **401**; `GET /:id` no-token → **401**.
- `GET /api/channel-configs` token → **200**, `isArray=true` (count=0, DB local chưa có config — behavior hợp lệ), **`secretFields=NONE`**.
- `GET /api/channel-configs/<uuid-không-tồn-tại>` token → **404** `Not found`.
- Fall-through: `POST /api/channel-configs` body rỗng → **400** `inboxId, channelType và name là bắt buộc` (không mutation).

## 11. Safety scans

- Duplicate route: `dashboard.js` chỉ còn mount + POST/PUT/DELETE cho channel-configs, **không còn GET trùng**; `/tenants/:id/channel-configs` là path riêng.
- `$queryRawUnsafe`/`$executeRawUnsafe` (backend/src+scripts): **0**.
- Chatwoot trong `backend/src`: chỉ 3 README lịch sử (không đổi).
- Destructive trong `backend/src`: **0**. `start-all.bat` Chatwoot backlog vẫn tồn tại (không sửa trong 21B-2).

## 12. Không thay đổi

- Không sửa `dashboard/src/**`, webhook/RAG/tenants/telegram/bot/notifications/facebook.
- Không sửa `schema.prisma`, `migrations/**`, package.json/lock, Dockerfile/start-all/docker-compose.
- Không sửa `.env`/`.env.local`/`.next`/backup/temp/log; không `git add .`; không push remote.
- Không xóa legacy dirs; không archive docs; không làm 21C/21D.

## 13. Remaining risks

- `dashboard.js` vẫn còn phần lớn route monolith (backlog tiếp tục ở 21B-3…).
- DB local chưa có channel-config data nên list smoke là mảng rỗng (đúng behavior).
- `start-all.bat` Chatwoot backlog + docs stale (`MULTITENANT_PROGRESS.md`, `ROADMAP.md`) — ngoài phạm vi 21B-2.

## 14. Final verdict

**PASS** — tách 2 route read-only channel-configs, static + runtime smoke PASS, API contract giữ nguyên, không secret/external/mutation/raw SQL, không đụng forbidden area.

## 15. Next step

Prompt 21B-3 tiếp tục route read-only kế (campaigns hoặc stats) theo cùng pattern; hoặc 21C (dashboard content-packages locked) / 21D (docs + legacy cleanup). Không chọn webhook/RAG/handoff/tenants/appointments/settings-external.
