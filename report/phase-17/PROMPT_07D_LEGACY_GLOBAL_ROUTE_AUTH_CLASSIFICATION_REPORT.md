# PROMPT 07D — LEGACY/GLOBAL ROUTE AUTH CLASSIFICATION REPORT

## 1. Mục tiêu

Audit, phân loại và harden nhỏ các legacy/global routes trong `backend/src/api/dashboard.js` sau khi các P0/P1 tenant ownership chính đã được xử lý ở Prompt 07A/07B/07C.

Phạm vi:

- Phân loại legacy/global routes theo authorization boundary.
- Thêm `platformAdminOnly` cho route rõ ràng là platform-only.
- Không refactor handler, không đổi route path/method, không đổi success response shape cho platform admin.
- Không sửa RAG/raw SQL, Prisma schema/migrations, webhook, tenant handoff module, bot engine, dashboard frontend, package hoặc DevOps.

## 2. Vì sao cần Prompt 07D sau 07C

Prompt 07C đã harden detail resource tenant guard, nhưng vẫn còn nhóm route global/legacy trong dashboard API:

- Global staff.
- Global handoff monitor/actions.
- Analytics.
- Facebook/global menu/page routes.
- Global Chatwoot test route.
- Legacy campaigns.
- Provider/settings write/test routes.

Các route này không phải detail resource tenant trực tiếp. Một số là owner/global integration, một số là legacy surface không có `tenantId`, nên cần phân loại riêng trước Prompt 08 RAG/raw SQL.

## 3. Secret/Git safety

- Không mở/in `backend/.env`.
- Không mở/in `dashboard/.env.local`.
- Không in `DATABASE_URL` đầy đủ, `JWT_SECRET`, `ENCRYPTION_KEY`, API key hoặc token.
- `.env` không tracked/staged.
- Không dùng `git add .`.
- Không push remote.
- Không chạy migration, `prisma db push`, `docker compose up`, `start-all.bat`.

## 4. File/report đã đọc

- `report/phase-17/PROMPT_07C_DETAIL_RESOURCE_TENANT_GUARD_REPORT.md`
- `report/phase-17/PROMPT_07B_CONVERSATION_TENANT_GUARD_REPORT.md`
- `report/phase-17/PROMPT_07A_TENANT_AUTHORIZATION_HARDENING_REPORT.md`
- `report/phase-17/PROMPT_07_TENANT_SAFETY_AUDIT_REPORT.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/runbooks/LOCAL_RUN_GUIDE.md`
- `backend/src/api/dashboard.js`
- `backend/prisma/schema.prisma`
- `dashboard/src/lib/api.ts` để đối chiếu dashboard client route usage, chỉ đọc.

## 5. Git preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Không ở `master/main` | PASS |
| Working tree trước patch | Clean, chỉ ignored env/node_modules/.next/tmp |
| Remote | Không có remote configured |
| `backend/.env` | Gitignored |
| `dashboard/.env.local` | Gitignored |
| Env tracked | Không phát hiện `.env`, `.env.local`, `.env.production`, `.env.development` tracked |
| Commit Prompt 07C | `7ad04f6` tồn tại |

## 6. Baseline validation

Baseline trước patch: PASS.

| Command | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/prompts.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/prompts.routes.js` | PASS |
| `node --check src/infrastructure/repositories/handoffSettings.repository.js` | PASS |
| `node --check src/infrastructure/repositories/telegramDestinations.repository.js` | PASS |
| `node --check src/infrastructure/repositories/promptTemplates.repository.js` | PASS |
| `npx prisma validate` | PASS |

## 7. Legacy/global route map

| Area | Method | Path | Middleware trước patch | Query/action | Current scope | Classification | Risk | Action |
|---|---|---|---|---|---|---|---|---|
| Stats | GET | `/stats` | `authMiddleware` | Global counts conversations/messages/appointments/knowledge | Global | `PLATFORM_ONLY` | Tenant có thể xem thống kê toàn hệ thống | Thêm `platformAdminOnly` |
| Providers | GET | `/providers` | `authMiddleware` | List global LLM providers, masked key | Global | `PLATFORM_ONLY` | Tenant xem cấu hình provider global | Thêm `platformAdminOnly` |
| Providers | POST | `/providers` | `authMiddleware, platformAdminOnly` | Create global LLM provider | Global | `ALREADY_GUARDED` | Đã guard | Không đổi |
| Providers | PUT | `/providers/:id` | `authMiddleware` | Update global LLM provider/cache | Global | `PLATFORM_ONLY` | Tenant sửa provider global | Thêm `platformAdminOnly` |
| Providers | DELETE | `/providers/:id` | `authMiddleware, platformAdminOnly` | Delete global LLM provider | Global | `ALREADY_GUARDED` | Đã guard | Không đổi |
| Providers | POST | `/providers/:id/test` | `authMiddleware` | Test provider, có thể gọi external LLM | Global integration | `PLATFORM_ONLY` | Tenant gọi test provider/API | Thêm `platformAdminOnly` |
| Campaigns | POST | `/campaigns/upload` | `authMiddleware` | Upload/parse file cho legacy campaign | Legacy global | `LEGACY_DEPRECATE_OR_REVIEW` + `PLATFORM_ONLY` | Tenant ghi file/legacy global | Thêm `platformAdminOnly` |
| Campaigns | GET | `/campaigns` | `authMiddleware` | List `Campaign`, model không có `tenantId` | Legacy global | `LEGACY_DEPRECATE_OR_REVIEW` + `PLATFORM_ONLY` | Tenant đọc campaign global | Thêm `platformAdminOnly` |
| Campaigns | GET | `/campaigns/:id` | `authMiddleware` | Detail `Campaign` by id | Legacy global | `LEGACY_DEPRECATE_OR_REVIEW` + `PLATFORM_ONLY` | Tenant đọc campaign global | Thêm `platformAdminOnly` |
| Campaigns | POST | `/campaigns` | `authMiddleware` | Create `Campaign` global | Legacy global | `LEGACY_DEPRECATE_OR_REVIEW` + `PLATFORM_ONLY` | Tenant tạo campaign global | Thêm `platformAdminOnly` |
| Campaigns | PUT | `/campaigns/:id` | `authMiddleware` | Update `Campaign` global | Legacy global | `LEGACY_DEPRECATE_OR_REVIEW` + `PLATFORM_ONLY` | Tenant sửa campaign global | Thêm `platformAdminOnly` |
| Campaigns | DELETE | `/campaigns/:id` | `authMiddleware` | Delete `Campaign` global | Legacy global | `LEGACY_DEPRECATE_OR_REVIEW` + `PLATFORM_ONLY` | Tenant xóa campaign global | Thêm `platformAdminOnly` |
| Migration | POST | `/content-packages/migrate-from-campaigns` | `authMiddleware` | Migrate global campaigns sang content packages | Legacy migration | `PLATFORM_ONLY` | Tenant kích hoạt migration dữ liệu global | Thêm `platformAdminOnly`; không platform-call trong smoke để tránh side effect |
| Global staff | GET | `/staff` | `authMiddleware` | List `Staff`, model không có `tenantId` | Global | `PLATFORM_ONLY` | Tenant đọc staff global | Thêm `platformAdminOnly` |
| Global staff | POST | `/staff` | `authMiddleware` | Create global staff | Global | `PLATFORM_ONLY` | Tenant tạo staff global | Thêm `platformAdminOnly` |
| Global staff | PUT | `/staff/:id` | `authMiddleware` | Update global staff | Global | `PLATFORM_ONLY` | Tenant sửa staff global | Thêm `platformAdminOnly` |
| Global staff | DELETE | `/staff/:id` | `authMiddleware` | Delete global staff | Global | `PLATFORM_ONLY` | Tenant xóa staff global | Thêm `platformAdminOnly` |
| Telegram destinations | GET | `/settings/telegram-destinations` | Split route, `authMiddleware` | Read global destinations | Global settings read | `LEGACY_DEPRECATE_OR_REVIEW` | Ngoài `dashboard.js`; Prompt 07D không sửa split route | Follow-up nếu muốn platform-only toàn diện |
| Telegram destinations | POST | `/settings/telegram-destinations` | `authMiddleware` | Create global destination | Global | `PLATFORM_ONLY` | Tenant sửa global alert destination | Thêm `platformAdminOnly` |
| Telegram destinations | PUT | `/settings/telegram-destinations/:id` | `authMiddleware` | Update global destination | Global | `PLATFORM_ONLY` | Tenant sửa global alert destination | Thêm `platformAdminOnly` |
| Telegram destinations | DELETE | `/settings/telegram-destinations/:id` | `authMiddleware` | Delete global destination | Global | `PLATFORM_ONLY` | Tenant xóa global alert destination | Thêm `platformAdminOnly` |
| Telegram destinations | POST | `/settings/telegram-destinations/:id/test` | `authMiddleware` | Sends Telegram test | Global integration | `PLATFORM_ONLY` | Tenant kích hoạt Telegram send | Thêm `platformAdminOnly` |
| Handoff settings | GET/PUT | `/settings/handoff` | Split route, `authMiddleware` | Global singleton setting | Global settings | `LEGACY_DEPRECATE_OR_REVIEW` | Ngoài `dashboard.js`; cần policy riêng | Follow-up |
| Handoff | GET | `/handoff/active` | `authMiddleware` | Global conversations handoff status | Global | `PLATFORM_ONLY` | Tenant thấy handoff toàn hệ thống | Thêm `platformAdminOnly` |
| Handoff | POST | `/handoff/:conversationId/force-end` | `authMiddleware` | Force-end global conversation handoff | Global action | `PLATFORM_ONLY` | Tenant kết thúc session tenant khác | Thêm `platformAdminOnly` |
| Handoff | GET | `/handoff/staff-status` | `authMiddleware` | Global staff + handoff count | Global | `PLATFORM_ONLY` | Tenant xem global staff/handoff | Thêm `platformAdminOnly` |
| Handoff | GET | `/handoff/bot-queue` | `authMiddleware` | Global bot queue | Global | `PLATFORM_ONLY` | Tenant xem queue tenant khác | Thêm `platformAdminOnly` |
| Handoff | POST | `/handoff/:conversationId/assign` | `authMiddleware` | Assign global `Staff` to conversation | Global action | `PLATFORM_ONLY` | Tenant assign conversation tenant khác | Thêm `platformAdminOnly` |
| Tenant handoff | N/A | `/tenants/:id/handoff/*` | Frontend client khai báo, backend chưa có | Intended tenant handoff | Tenant scoped missing | `TENANT_SCOPED` follow-up | Tenant dashboard handoff chưa có backend route | Prompt 07E |
| Chatwoot | GET | `/settings/chatwoot-test` | `authMiddleware` | Test global Chatwoot env | Owner/global integration | `OWNER_GLOBAL_INTEGRATION` + `PLATFORM_ONLY` | Tenant gọi global integration test | Thêm `platformAdminOnly` |
| Facebook pages | GET/POST/PUT/DELETE | `/facebook-pages...` | `authMiddleware` | Global page/token config, tokens masked | Owner/global integration | `OWNER_GLOBAL_INTEGRATION` + `PLATFORM_ONLY` | Tenant quản lý global FB page config | Thêm `platformAdminOnly` |
| Facebook menu | GET/POST | `/settings/facebook-menu` | `authMiddleware` | Calls Facebook menu setup/profile | Owner/global integration | `OWNER_GLOBAL_INTEGRATION` + `PLATFORM_ONLY` | Tenant gọi Facebook Graph setup | Thêm `platformAdminOnly` |
| Test endpoint | POST | `/test-message` | `authMiddleware` | Simulate bot message | Owner test tool | `OWNER_GLOBAL_INTEGRATION` + `PLATFORM_ONLY` | Tenant kích hoạt bot test global | Thêm `platformAdminOnly` |
| Facebook subscription | GET | `/fb-subscription` | `authMiddleware` | Checks hard-coded FB pages with env token | Owner/global integration | `OWNER_GLOBAL_INTEGRATION` + `PLATFORM_ONLY` | Tenant gọi external FB subscription check | Thêm `platformAdminOnly` |
| Analytics | GET | `/analytics` | `authMiddleware` | Global analytics + raw SQL | Global + raw SQL | `PLATFORM_ONLY` | Tenant đọc analytics toàn hệ thống; raw SQL còn cần Prompt 08 | Thêm `platformAdminOnly` |
| Channel configs | GET/POST/PUT/DELETE | `/channel-configs...` | `authMiddleware` | Uses `getTenantScope`; tenant uses `TenantChannelConfig`, platform uses global `ChannelConfig` | Scoped | `TENANT_SCOPED` | Guard hiện hữu hợp lý, external lookup cần token policy | Không đổi |
| Conversations | GET | `/conversations...` | `authMiddleware` | Uses `getTenantScope`; detail/messages pre-check tenant | Scoped | `ALREADY_GUARDED` | Đã fixed 07B | Không đổi |
| Detail resources | Multiple | knowledge/prompts/quick/content/appointments | `authMiddleware` | Uses `getTenantScope`/ownership guard | Scoped | `ALREADY_GUARDED` | Đã fixed 07C | Không đổi |
| Knowledge upload/scrape | POST | `/knowledge/upload`, `/knowledge/scrape` | `authMiddleware` | RAG/docParser side effect, currently no tenantId passed to `ragPipeline.addDocument` | RAG side effect unclear | `TENANT_SCOPED` follow-up | Tenant upload/scrape có thể ghi global KB; sửa cần RAG changes | Không patch trong 07D; Prompt 08/07E |
| Knowledge reindex | POST | `/knowledge/reindex` | `authMiddleware, platformAdminOnly` | Raw SQL + embeddings | Global RAG maintenance | `ALREADY_GUARDED` | Raw SQL/RAG risk còn lại | Prompt 08 |
| Tenants parent | Multiple | `/tenants...` | `authMiddleware, platformAdminOnly` | Tenant admin management | Platform admin | `ALREADY_GUARDED` | Đã guarded | Không đổi |
| Tenants nested | Multiple | `/tenants/:id/*` | `authMiddleware, tenantPathAccessOnly` | Tenant staff/channel/knowledge/webhook-info | Tenant path scoped | `ALREADY_GUARDED` | Đã fixed 07A | Không đổi |

## 8. Classification summary

### PLATFORM_ONLY

Đã thêm hoặc xác nhận `platformAdminOnly` cho:

- Stats: `/stats`.
- LLM providers: `/providers`, `/providers/:id`, `/providers/:id/test`; create/delete đã guarded từ trước.
- Legacy campaigns và migration.
- Global staff.
- Telegram destinations write/test.
- Global handoff monitor/actions.
- Owner/global Chatwoot/Facebook/test endpoints.
- Analytics.
- Parent tenants/admin-users/knowledge reindex đã guarded từ trước.

### TENANT_SCOPED

- Conversations.
- Knowledge main CRUD, trừ upload/scrape cần follow-up vì RAG side effect.
- Prompts.
- Quick reply menus.
- Content packages/items.
- Appointments.
- Channel configs.
- Nested `/tenants/:id/*`.

### OWNER_GLOBAL_INTEGRATION

- `/settings/chatwoot-test`
- `/facebook-pages...`
- `/settings/facebook-menu`
- `/fb-subscription`
- `/test-message`

Các route này đã bị khóa platform-only trong Prompt 07D.

### LEGACY_DEPRECATE_OR_REVIEW

- `/campaigns...`
- `/content-packages/migrate-from-campaigns`
- Global `/staff...` và `/handoff...` nếu tenant dashboard cần handoff riêng.
- Split settings routes ngoài `dashboard.js`: `GET /settings/telegram-destinations`, `GET/PUT /settings/handoff`.

### ALREADY_GUARDED

- `/admin-users...`
- `/tenants...`
- `/tenants/:id/*`
- `/conversations...`
- Detail resources fixed 07C.
- `/knowledge/reindex`.

## 9. Patch applied

Đã thêm `platformAdminOnly` trong `backend/src/api/dashboard.js` cho các route:

- `GET /stats`
- `GET /providers`
- `PUT /providers/:id`
- `POST /providers/:id/test`
- `POST /campaigns/upload`
- `GET/POST /campaigns`
- `GET/PUT/DELETE /campaigns/:id`
- `POST /content-packages/migrate-from-campaigns`
- `GET/POST /staff`
- `PUT/DELETE /staff/:id`
- `POST /settings/telegram-destinations`
- `PUT/DELETE /settings/telegram-destinations/:id`
- `POST /settings/telegram-destinations/:id/test`
- `GET /handoff/active`
- `POST /handoff/:conversationId/force-end`
- `GET /handoff/staff-status`
- `GET /handoff/bot-queue`
- `POST /handoff/:conversationId/assign`
- `GET /settings/chatwoot-test`
- `GET/POST /facebook-pages`
- `GET/PUT/DELETE /facebook-pages/:id`
- `GET/POST /settings/facebook-menu`
- `POST /test-message`
- `GET /fb-subscription`
- `GET /analytics`

Không đổi handler logic.

## 10. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Public route/method đổi không | Không |
| Success response shape đổi không | Không đổi cho platform admin; chỉ thêm authorization middleware trước handler |
| Tenant user behavior ở route patched | Đổi có chủ đích: tenant token nhận `403` trước khi đọc/ghi global resource hoặc gọi integration |
| Platform behavior | Không bị guard `403`; smoke ghi actual status. Một số fake-id platform call trả `404/400/500` như behavior handler cũ |
| External API thật | Không gọi trong smoke; Chatwoot/Facebook/test-message được mock in-memory |
| DB mutation side effect | Không gọi platform migration route `/content-packages/migrate-from-campaigns`; smoke chỉ verify tenant denied cho route đó |

## 11. Static validation

Static validation sau patch: PASS.

| Command | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/prompts.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/prompts.routes.js` | PASS |
| `node --check src/infrastructure/repositories/handoffSettings.repository.js` | PASS |
| `node --check src/infrastructure/repositories/telegramDestinations.repository.js` | PASS |
| `node --check src/infrastructure/repositories/promptTemplates.repository.js` | PASS |
| `npx prisma validate` | PASS |
| `git diff --check` | PASS, chỉ có warning CRLF của Git trên Windows |

## 12. Runtime smoke result

Runtime smoke dùng Express app tạm mount `dashboardApi`, JWT ký trong memory, DB local `localhost:5433`. Tổng kết: **79/79 PASS**, cleanup PASS.

| Nhóm | Expected | Actual | Result |
|---|---|---|---|
| No-token route patched | `401` | `GET /api/stats` trả `401` | PASS |
| Tenant token trên platform-only routes | `403` | 35 route patched trả `403` | PASS |
| Platform token trên route patched | Không bị guard `403` | 34 route platform-called trả `200/400/404/500` tùy handler cũ, không route nào `403` | PASS |
| Platform migration call | Không gọi để tránh DB migration side effect | Skipped có chủ đích; tenant denied `403` đã verify | PASS |
| Regression prompts | `200` | `/api/prompts`, `/api/prompts?layer=intent` trả `200` | PASS |
| Regression settings | `200` | `/api/settings/telegram-destinations`, `GET/PUT /api/settings/handoff` trả `200` | PASS |
| Regression P0 | `403` | Tenant A gọi `/api/tenants/tenant-b-test/staff` trả `403` | PASS |
| Regression 07B | `404` | Tenant A gọi conversation B detail/messages trả `404` | PASS |
| Regression 07C | `404` | Tenant A gọi prompt tenant B trả `404` | PASS |
| Cleanup | PASS | leftover `test_07d_*`: prompts=0, conversations=0, messages=0 | PASS |

Ghi chú: một số platform fake-id calls trả `500` do behavior cũ của handler khi Prisma record không tồn tại. Prompt 07D không sửa handler error mapping; mục tiêu smoke là xác nhận platform không bị chặn bởi middleware mới và tenant bị chặn trước handler.

## 13. Source scope

Source runtime đã sửa:

- `backend/src/api/dashboard.js`

Docs/report đã sửa hoặc tạo:

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `report/phase-17/PROMPT_07D_LEGACY_GLOBAL_ROUTE_AUTH_CLASSIFICATION_REPORT.md`

Không sửa:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/**`
- `backend/src/rag/**`
- `backend/src/webhook/**`
- `backend/src/tenants/handoff.js`
- `dashboard/src/**`
- package files
- Dockerfile/scripts
- `.env` files

## 14. Remaining risks

| Risk | Trạng thái | Đề xuất |
|---|---|---|
| RAG/raw SQL | OPEN | Prompt 08 xử lý `$queryRawUnsafe`, vector insert/update/search. |
| `knowledge_base.embedding` mismatch | OPEN | Prompt 08 hoặc DB-specific prompt làm rõ Prisma nullable vs migration `NOT NULL`. |
| `POST /knowledge/upload` và `/knowledge/scrape` | OPEN | Hiện chưa truyền `tenantId` vào `ragPipeline.addDocument`; cần Prompt 08/07E vì có RAG side effect. |
| Tenant handoff dashboard routes | OPEN | Frontend khai báo `/tenants/:id/handoff/*`, backend chưa có route; cần Prompt 07E nếu tenant dashboard cần chức năng này. |
| Split settings route policy | OPEN | `GET /settings/telegram-destinations`, `GET/PUT /settings/handoff` nằm ngoài direct dashboard route block; cần quyết định platform-only hay tenant-visible. |
| DevOps script risk | OPEN | `start-all.bat`, docker compose/db push risk vẫn để Prompt 10. |
| Repository/detail/write split | OPEN | Chỉ làm sau khi Prompt 08/07E không còn blocker authorization/raw SQL lớn. |

## 15. Final verdict

**PASS WITH WARNINGS — classification completed, safe platform-only patches applied, follow-up routes remain.**

Lý do:

- Legacy/global route classification hoàn tất.
- Route platform-only rõ ràng đã thêm `platformAdminOnly`.
- Static validation PASS.
- Runtime smoke PASS 79/79.
- Không stage/commit `.env`.
- Không sửa ngoài phạm vi cho phép.

Warnings còn lại không được vá trong Prompt 07D vì cần prompt riêng:

- RAG upload/scrape ownership + raw SQL.
- Tenant handoff routes.
- Split settings route policy.

## 16. Next Step & Goal

Đề xuất:

1. **Prompt 08 — RAG/raw SQL hardening**: xử lý raw SQL/RAG/vector, bao gồm upload/scrape tenantId và `knowledge_base.embedding`.
2. **Prompt 07E — tenant handoff + remaining route follow-up**: nếu tenant dashboard cần handoff monitor/actions, triển khai hoặc khóa rõ `/tenants/:id/handoff/*` và quyết định policy cho split settings routes.
3. **Không làm project structure consolidation** trước Prompt 08/10 nếu raw SQL/DevOps risks vẫn mở.
