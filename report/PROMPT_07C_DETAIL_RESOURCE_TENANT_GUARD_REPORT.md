# PROMPT 07C — DETAIL RESOURCE TENANT GUARD REPORT

## 1. Mục tiêu

Harden tenant ownership cho các detail resource routes còn lại trong `backend/src/api/dashboard.js` sau Prompt 07A/07B.

Nguyên tắc đã áp dụng:

- Tenant-scoped request chỉ được đọc/sửa/xóa resource thuộc `req.user.tenantId`.
- Cross-tenant detail/write/delete trả `404` để tránh leak resource tồn tại.
- Platform admin không có tenant scope giữ behavior hiện hữu.
- Không đổi public route, method, success response shape.
- Không sửa Prisma schema/migrations, RAG pipeline, webhook, tenant handoff, bot, dashboard frontend, package hoặc DevOps.

## 2. P1 từ Prompt 07/07A/07B

Đã hoàn tất trước Prompt 07C:

- Prompt 07: audit tenant scope, ghi nhận P0/P1.
- Prompt 07A: harden `/api/tenants/:id/*` bằng `tenantPathAccessOnly`.
- Prompt 07B: harden `GET /api/conversations`, `GET /api/conversations/:id`, `GET /api/conversations/:id/messages`.

P1 còn lại được xử lý trong Prompt 07C:

- Knowledge detail routes.
- Prompts detail/write routes.
- Quick reply menu detail/write routes.
- Content package detail/write routes.
- Content package item child routes.
- Appointment update route.

## 3. Secret/Git safety

- Không mở/in nội dung `backend/.env`.
- Không mở/in nội dung `dashboard/.env.local`.
- Không in `DATABASE_URL` đầy đủ, `JWT_SECRET`, `ENCRYPTION_KEY`, API key hoặc token.
- `.env` không tracked/staged.
- Không dùng `git add .`.
- Không push remote.
- Không chạy migration hoặc `prisma db push`.
- Không chạy `docker compose up` hoặc `start-all.bat`.

## 4. File/report đã đọc

- `report/PROMPT_07B_CONVERSATION_TENANT_GUARD_REPORT.md`
- `report/PROMPT_07A_TENANT_AUTHORIZATION_HARDENING_REPORT.md`
- `report/PROMPT_07_TENANT_SAFETY_AUDIT_REPORT.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/LOCAL_RUN_GUIDE.md`
- `backend/src/api/dashboard.js`
- `backend/prisma/schema.prisma`

## 5. Git preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Không ở `master/main` | PASS |
| `git status --short --branch` trước patch | Clean, chỉ branch |
| `git remote -v` | Không có remote |
| `.env` ignored | `backend/.env`, `dashboard/.env.local` đều ignored |
| `.env` tracked | Không có output từ `git ls-files` env patterns |
| Staged files trước patch | Không có |
| Commit Prompt 07B | `34496c61060561048e645e8dbea8b80894d95a5e` tồn tại |

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

## 7. Detail resource route map trước patch

| Area | Method | Path | Current middleware | Current query | Tenant guard hiện tại | Risk | Patch needed |
|---|---|---|---|---|---|---|---|
| Knowledge | GET | `/knowledge/:id` | `authMiddleware` | `knowledgeBase.findUnique({ id })` | Không có detail guard | Tenant biết id có thể đọc KB tenant khác | Có |
| Knowledge | PUT | `/knowledge/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi `ragPipeline.updateDocument(id)` | Có check tenant nhưng mismatch trả `403` | `403` leak resource tồn tại; phải chặn trước RAG bằng `{ id, tenantId }` | Có |
| Knowledge | DELETE | `/knowledge/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi `ragPipeline.deleteDocument(id)` | Có check tenant nhưng mismatch trả `403` | `403` leak resource tồn tại; phải chặn trước RAG bằng `{ id, tenantId }` | Có |
| Prompts | GET | `/prompts/:id` | `authMiddleware` | `promptTemplate.findUnique({ id })` | Không có detail guard | Tenant đọc prompt tenant khác | Có |
| Prompts | POST | `/prompts` | `authMiddleware` | `promptTemplate.create({ tenantId: getTenantScope(req) ?? null })` | Đã scoped khi tạo | Risk thấp, giữ behavior | Không |
| Prompts | PUT | `/prompts/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi update by id | Mismatch trả `403` | Leak resource tồn tại | Có |
| Prompts | DELETE | `/prompts/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi delete by id | Mismatch trả `403` | Leak resource tồn tại | Có |
| Quick reply | GET | `/quick-reply-menus/:id` | `authMiddleware` | `quickReplyMenu.findUnique({ id })` | Không có detail guard | Tenant đọc menu tenant khác | Có |
| Quick reply | PUT | `/quick-reply-menus/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi update by id | Mismatch trả `403` | Leak resource tồn tại | Có |
| Quick reply | DELETE | `/quick-reply-menus/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi delete by id | Mismatch trả `403` | Leak resource tồn tại | Có |
| Content packages | GET | `/content-packages/:id` | `authMiddleware` | `contentPackage.findUnique({ id, include: items })` | Không có detail guard | Tenant đọc package/items tenant khác | Có |
| Content packages | PUT | `/content-packages/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi update by id | Mismatch trả `403` | Leak resource tồn tại | Có |
| Content packages | DELETE | `/content-packages/:id` | `authMiddleware` | Pre-check `findUnique({ id })`, rồi delete by id | Mismatch trả `403` | Leak resource tồn tại | Có |
| Package items | GET | `/content-packages/:packageId/items` | `authMiddleware` | `contentPackageItem.findMany({ packageId })` | Không có parent guard | Tenant list item package tenant khác | Có |
| Package items | POST | `/content-packages/:packageId/items` | `authMiddleware` | `contentPackageItem.create({ packageId })` | Không có parent guard | Tenant tạo item vào package tenant khác | Có |
| Package items | PUT | `/content-packages/:packageId/items/:itemId` | `authMiddleware` | `contentPackageItem.update({ id: itemId })` | Không có parent guard | Tenant update item tenant khác hoặc item không thuộc package path | Có |
| Package items | DELETE | `/content-packages/:packageId/items/:itemId` | `authMiddleware` | `contentPackageItem.delete({ id: itemId })` | Không có parent guard | Tenant delete item tenant khác | Có |
| Appointments | PUT | `/appointments/:id` | `authMiddleware` | `appointment.findUnique({ id })`, rồi update by id | Không có update guard | Tenant update appointment tenant khác; có notification side effect nếu đổi status/notes | Có |

## 8. Schema ownership map

| Model | Has tenantId? | Ownership relation | Notes |
|---|---|---|---|
| `KnowledgeBase` | Có | Direct `tenantId` | Route `/knowledge/:id`; list đã scoped, detail/write cần `{ id, tenantId }`. |
| `PromptTemplate` | Có | Direct `tenantId` | Route `/prompts/:id`; `POST` đã ghi `tenantId` theo scope. |
| `QuickReplyMenu` | Có | Direct `tenantId` | Route `/quick-reply-menus/:id`; unique hiện tại là `[intentType, pageId]`, không đổi schema. |
| `ContentPackage` | Có | Direct `tenantId` | Route `/content-packages/:id`; owns `items`. |
| `ContentPackageItem` | Không | Parent `ContentPackage.packageId -> ContentPackage.id` | Guard qua parent `ContentPackage.tenantId`. |
| `Appointment` | Có | Direct `tenantId`, đồng thời relation `Conversation` | Prompt 07C dùng direct `tenantId`; không đoán thêm ownership qua conversation. |

## 9. Patch đã áp dụng

### Knowledge

- `GET /knowledge/:id`: dùng scoped lookup khi có `tenantId`.
- `PUT /knowledge/:id`: tenant-scoped request pre-check `{ id, tenantId }`; mismatch trả `404` trước khi gọi RAG update.
- `DELETE /knowledge/:id`: tenant-scoped request pre-check `{ id, tenantId }`; mismatch trả `404` trước khi gọi RAG delete.

### Prompts

- `GET /prompts/:id`: dùng scoped lookup khi có `tenantId`.
- `PUT /prompts/:id`: pre-check `{ id, tenantId }`; mismatch trả `404`.
- `DELETE /prompts/:id`: pre-check `{ id, tenantId }`; mismatch trả `404`.
- `POST /prompts`: audited, giữ logic scoped hiện hữu.

### Quick reply menus

- `GET /quick-reply-menus/:id`: dùng scoped lookup khi có `tenantId`.
- `PUT /quick-reply-menus/:id`: pre-check `{ id, tenantId }`; mismatch trả `404`.
- `DELETE /quick-reply-menus/:id`: pre-check `{ id, tenantId }`; mismatch trả `404`.

### Content packages

- `GET /content-packages/:id`: dùng scoped lookup khi có `tenantId`, giữ include `items`.
- `PUT /content-packages/:id`: pre-check `{ id, tenantId }`; mismatch trả `404`.
- `DELETE /content-packages/:id`: pre-check `{ id, tenantId }`; mismatch trả `404`.

### Content package items

- Thêm parent guard qua `hasContentPackageAccess(packageId, tenantId)`.
- `GET /content-packages/:packageId/items`: tenant phải truy cập được package cha trước khi list item.
- `POST /content-packages/:packageId/items`: tenant phải truy cập được package cha trước khi create item.
- `PUT /content-packages/:packageId/items/:itemId`: tenant phải truy cập được package cha, sau đó update bằng `{ id: itemId, packageId }`.
- `DELETE /content-packages/:packageId/items/:itemId`: tenant phải truy cập được package cha, sau đó delete bằng `{ id: itemId, packageId }`.
- Platform không có tenant scope giữ behavior update/delete item theo `itemId` như cũ.

### Appointments

- `PUT /appointments/:id`: khi có `tenantId`, dùng `appointment.findFirst({ where: { id, tenantId } })`; mismatch trả `404`.
- Platform không có tenant scope vẫn dùng `findUnique({ id })` như cũ.

## 10. Route skipped

Không skip route detail resource nào trong phạm vi Prompt 07C.

Các route không xử lý vì ngoài scope prompt:

| Route/nhóm | Lý do skip | Cần prompt riêng? |
|---|---|---|
| Legacy/global staff routes | Prompt 07C chỉ xử lý detail resource P1 đã liệt kê | Có, Prompt 07D |
| Legacy handoff/analytics routes | Cần phân loại platform-only hay tenant-scoped | Có, Prompt 07D |
| Facebook/global Chatwoot routes | Cần quyết định owner/global behavior riêng | Có, Prompt 07D |
| RAG/raw SQL internals | Prompt 07C không sửa RAG pipeline | Có, Prompt 08 |
| Prisma schema/migrations | Prompt 07C cấm sửa schema/migration | Có nếu xử lý schema mismatch ở Prompt 08 hoặc prompt DB riêng |

## 11. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Platform behavior | Giữ behavior hiện hữu khi không có tenant scope; detail routes vẫn lookup theo id. |
| Tenant own resource behavior | Own detail/update/delete smoke PASS cho các nhóm có route tương ứng. |
| Tenant cross resource behavior | Cross-tenant detail/update/delete trả `404`; không leak data tenant B. |
| Public route/method | Không đổi route public hoặc HTTP method. |
| Success response shape | Không đổi success response shape; chỉ thêm guard trước query/write. |
| Knowledge update own runtime | Không gọi own update trong smoke vì `ragPipeline.updateDocument` tái tạo embedding; cross update đã chứng minh guard chặn trước RAG. Own delete route PASS. |
| Appointment notification | Own/platform appointment update smoke dùng cùng status/notes để không tạo notification delta. |

## 12. Static validation

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
| `git diff --check` | PASS, chỉ có warning CRLF từ Git trên Windows |
| `git diff --stat` | PASS |
| `git diff --name-status` | PASS |

## 13. Runtime smoke result

Runtime smoke dùng Express app tạm mount `dashboardApi`, JWT ký trong memory, DB local `localhost:5433`. Tổng kết: **47/47 PASS**, cleanup PASS.

| Token type | Route | Expected | Actual | Result |
|---|---|---:|---:|---|
| No token | `GET /api/prompts/:id` | 401 | 401 | PASS |
| Tenant A | `GET /api/knowledge/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/knowledge/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `PUT /api/knowledge/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `DELETE /api/knowledge/:id` tenant B | 404 | 404 | PASS |
| Platform | `GET /api/knowledge/:id` tenant B | 200 | 200 | PASS |
| Tenant A | `DELETE /api/knowledge/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/prompts/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/prompts/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `PUT /api/prompts/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `DELETE /api/prompts/:id` tenant B | 404 | 404 | PASS |
| Platform | `GET /api/prompts/:id` tenant B | 200 | 200 | PASS |
| Tenant A | `PUT /api/prompts/:id` own | 200 | 200 | PASS |
| Tenant A | `DELETE /api/prompts/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/quick-reply-menus/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/quick-reply-menus/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `PUT /api/quick-reply-menus/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `DELETE /api/quick-reply-menus/:id` tenant B | 404 | 404 | PASS |
| Platform | `GET /api/quick-reply-menus/:id` tenant B | 200 | 200 | PASS |
| Tenant A | `PUT /api/quick-reply-menus/:id` own | 200 | 200 | PASS |
| Tenant A | `DELETE /api/quick-reply-menus/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/content-packages/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/content-packages/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `PUT /api/content-packages/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `DELETE /api/content-packages/:id` tenant B | 404 | 404 | PASS |
| Platform | `GET /api/content-packages/:id` tenant B | 200 | 200 | PASS |
| Tenant A | `PUT /api/content-packages/:id` own | 200 | 200 | PASS |
| Tenant A | `GET /api/content-packages/:packageId/items` own | 200 | 200 | PASS |
| Tenant A | `GET /api/content-packages/:packageId/items` tenant B | 404 | 404 | PASS |
| Tenant A | `POST /api/content-packages/:packageId/items` tenant B | 404 | 404 | PASS |
| Tenant A | `PUT /api/content-packages/:packageId/items/:itemId` tenant B | 404 | 404 | PASS |
| Tenant A | `DELETE /api/content-packages/:packageId/items/:itemId` tenant B | 404 | 404 | PASS |
| Platform | `GET /api/content-packages/:packageId/items` tenant B | 200 | 200 | PASS |
| Tenant A | `PUT /api/content-packages/:packageId/items/:itemId` own | 200 | 200 | PASS |
| Tenant A | `DELETE /api/content-packages/:packageId/items/:itemId` own | 200 | 200 | PASS |
| Tenant A | `DELETE /api/content-packages/:id` own | 200 | 200 | PASS |
| Tenant A | `PUT /api/appointments/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `PUT /api/appointments/:id` own | 200 | 200 | PASS |
| Platform | `PUT /api/appointments/:id` tenant B | 200 | 200 | PASS |
| Tenant A | `GET /api/prompts` | 200 | 200 | PASS |
| Tenant A | `GET /api/prompts?layer=intent` | 200 | 200 | PASS |
| Platform | `GET /api/settings/telegram-destinations` | 200 | 200 | PASS |
| Platform | `GET /api/settings/handoff` | 200 | 200 | PASS |
| Platform | `PUT /api/settings/handoff` same payload | 200 | 200 | PASS |
| Tenant A | `GET /api/tenants/tenant-b-test/staff` | 403 | 403 | PASS |
| Tenant A | `GET /api/conversations/:id` tenant B | 404 | 404 | PASS |
| Tenant A | `GET /api/conversations/:id/messages` tenant B | 404 | 404 | PASS |

## 14. Test data handling

| Hạng mục | Kết quả |
|---|---|
| Có tạo sample local không | Có |
| DB target | Local `localhost:5433` |
| Sample groups | `KnowledgeBase`, `PromptTemplate`, `QuickReplyMenu`, `ContentPackage`, `ContentPackageItem`, `Conversation`, `Message`, `Appointment` |
| Prefix | `test_07c_*`, tenant ids `tenant-a-test`, `tenant-b-test` |
| Knowledge sample | Tạo bằng raw SQL parameterized với vector zero 768 chiều vì DB local hiện có `knowledge_base.embedding NOT NULL`; không sửa schema/RAG |
| Cleanup | PASS |
| Leftover check | `knowledge=0 prompts=0 quick=0 packages=0 items=0 conversations=0 messages=0 appointments=0` |
| Có chạm production không | KHÔNG |

## 15. Source scope

Source runtime đã sửa:

- `backend/src/api/dashboard.js`

Docs/report đã sửa hoặc tạo:

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `report/PROMPT_07C_DETAIL_RESOURCE_TENANT_GUARD_REPORT.md`

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

## 16. Remaining P1/P2

| Nhóm | Trạng thái | Ghi chú |
|---|---|---|
| Legacy/global routes | OPEN | Staff/handoff/analytics/facebook/global Chatwoot cần phân loại platform-only hay tenant-scoped. |
| RAG/raw SQL | OPEN | `ragPipeline.addDocument/updateDocument` còn raw SQL; Prompt 08 nên xử lý. |
| Knowledge schema/runtime mismatch | OPEN | Prisma model nullable nhưng migration local có `embedding vector(768) NOT NULL`; cần xử lý trong Prompt 08 hoặc prompt DB riêng. |
| DevOps script risk | OPEN | Không xử lý trong Prompt 07C. |
| Repository/detail/write split còn lại | OPEN | Prompt 06D chỉ nên làm sau khi ownership guard đã rõ. |

## 17. Final verdict

**PASS — detail resource tenant guard fixed and cross-tenant smoke verified.**

Lý do:

- Tất cả route detail resource trong scope Prompt 07C đã được harden.
- Cross-tenant smoke verified cho knowledge, prompts, quick replies, content packages, package items và appointments.
- Runtime regression PASS.
- Cleanup PASS.
- Không stage/commit `.env`.
- Không sửa ngoài phạm vi nguồn đã cho phép.

## 18. Next Step & Goal

Đề xuất tiếp theo:

1. **Prompt 08 — RAG/raw SQL hardening**: thay raw SQL unsafe trong RAG, xử lý vector insert/update an toàn, làm rõ mismatch `knowledge_base.embedding`.
2. **Prompt 07D — legacy/global route classification**: phân loại staff/handoff/analytics/facebook/global Chatwoot là platform-only hay tenant-scoped.
3. **Prompt 06D — prompt detail/write repository**: chỉ làm sau khi ownership guard hiện tại được giữ nguyên trong repository/use-case split.
