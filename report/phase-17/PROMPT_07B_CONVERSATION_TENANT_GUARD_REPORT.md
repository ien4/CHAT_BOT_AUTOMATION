# PROMPT 07B — CONVERSATION TENANT GUARD REPORT

Ngày thực hiện: 2026-07-09
Kết luận: **PASS**

## 1. Mục tiêu

Fix P1 authorization gap cho ba route conversations:

- `GET /api/conversations`
- `GET /api/conversations/:id`
- `GET /api/conversations/:id/messages`

Tenant user chỉ được thấy conversation/messages thuộc `req.user.tenantId`. Platform admin giữ behavior hiện tại khi không có tenant scope.

## 2. P1 từ Prompt 07/07A

Prompt 07 phát hiện:

- Conversation routes dùng `authMiddleware` nhưng chưa tenant-scoped đầy đủ.
- Detail/messages dùng conversation id trực tiếp.
- `Message` model không có `tenantId`, nên tenant isolation phải đi qua `Conversation.tenantId`.

Prompt 07A đã fix P0 `/api/tenants/:id/*` nhưng chưa xử lý conversations. Prompt 07B chỉ xử lý P1 conversations, không sửa detail resource route khác.

## 3. Secret/Git safety

- Không mở/in nội dung `backend/.env`.
- Không mở/in nội dung `dashboard/.env.local`.
- Không in `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, API key hoặc token.
- `.env` và `.env.local` vẫn gitignored.
- Không có env tracked/staged.
- Không push remote.
- Không dùng `git add .`.

## 4. File/report đã đọc

- `report/phase-17/PROMPT_07A_TENANT_AUTHORIZATION_HARDENING_REPORT.md`
- `report/phase-17/PROMPT_07_TENANT_SAFETY_AUDIT_REPORT.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/runbooks/LOCAL_RUN_GUIDE.md`
- `backend/src/api/dashboard.js`
- `backend/prisma/schema.prisma`

## 5. Git preflight

| Hạng mục | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Working tree trước sửa | Sạch, chỉ có ignored artifacts/env |
| Remote | Không có remote configured |
| Commit Prompt 07A | `706ef9249c14a289b7c118eeecaa5cabc6086dc0` tồn tại |
| `backend/.env` | Gitignored |
| `dashboard/.env.local` | Gitignored |
| Env tracked/staged | Không có |

## 6. Baseline validation

Trước patch:

| Lệnh | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `node --check` settings/prompts controllers/routes/repositories | PASS |
| `npx prisma validate` từ `backend` | PASS |

Không chạy migration, không chạy `db push`.

## 7. Conversation route map trước patch

| Method | Path | Current middleware | Current query | Tenant filter hiện tại | Risk | Patch needed |
|---|---|---|---|---|---|---|
| GET | `/conversations` | `authMiddleware` | `where = status ? { status } : {}`; `findMany`, `count`, order `updatedAt desc`, pagination | Không có | Tenant thấy toàn bộ conversation nếu có token | Thêm `tenantId` vào `where` khi có scope |
| GET | `/conversations/:id` | `authMiddleware` | `contextManager.getConversationSummary(req.params.id)` | Không có | Tenant biết id có thể đọc detail/messages included của tenant khác | Pre-check conversation `{ id, tenantId }` trước khi trả summary |
| GET | `/conversations/:id/messages` | `authMiddleware` | `message.findMany({ conversationId: req.params.id })` | Không có | `Message` không có `tenantId`, có thể leak message tenant khác | Pre-check conversation `{ id, tenantId }` trước khi query messages |

Schema:

- `Conversation` có field `tenantId`.
- `Message` không có field `tenantId`; message isolation phải qua relation `Conversation`.
- Platform behavior cũ: không filter tenant nếu admin không có tenant scope.

## 8. Patch đã áp dụng

### List conversations

- Lấy `tenantId = getTenantScope(req)`.
- Nếu có `tenantId`, thêm `where.tenantId = tenantId`.
- Giữ nguyên `status`, pagination, `orderBy`, `_count`, response shape `{ data, pagination }`.

### Detail conversation

- Lấy `tenantId = getTenantScope(req)`.
- Nếu có `tenantId`, lookup `prisma.conversation.findFirst({ where: { id, tenantId }, select: { id: true } })`.
- Nếu không có conversation trong scope: trả `404 { error: 'Conversation not found' }`.
- Nếu pass scope hoặc platform không có scope: giữ `contextManager.getConversationSummary(id)` để response success shape không đổi.

### Messages

- Lấy `tenantId = getTenantScope(req)`.
- Nếu có `tenantId`, pre-check conversation `{ id, tenantId }`.
- Nếu không có: trả `404 { error: 'Conversation not found' }`.
- Chỉ sau đó mới query `message.findMany({ conversationId })`.

## 9. Behavior safety

| Behavior | Kết luận |
|---|---|
| Platform behavior | Giữ nguyên khi không có tenant scope; platform detail A/B đều 200 trong smoke. |
| Tenant list behavior | Tenant A list có conversation A, không có conversation B. |
| Tenant own detail/messages | Tenant A xem detail/messages conversation A được 200. |
| Tenant cross detail/messages | Tenant A xem conversation/messages tenant B bị `404`, không leak message B. |
| Public route/method có đổi không | Không. |
| Success response shape có đổi không | Không; list vẫn `{data,pagination}`, detail vẫn dùng `contextManager`, messages vẫn array. |

## 10. Static validation

Sau patch:

| Lệnh | Kết quả |
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
| `git diff --check` | PASS |

`git diff --stat`: chỉ `backend/src/api/dashboard.js` trước docs/report, 24 insertions cho patch conversation.

## 11. Runtime smoke result

Runtime smoke dùng Express app tạm chỉ mount `dashboardApi`, không start `src/index.js`, không kích hoạt Telegram/Facebook startup side effect.

DB safety:

- `DATABASE_URL` được kiểm tra bằng code, host là `localhost`, port `5433`.
- Không in full URL, user/password hoặc secret.

| Token type | Route | Expected | Actual | Result |
|---|---|---|---|---|
| none | `GET /api/conversations` | 401 | 401 | PASS |
| none | `GET /api/conversations/:id` | 401 | 401 | PASS |
| none | `GET /api/conversations/:id/messages` | 401 | 401 | PASS |
| tenant A | `GET /api/conversations` | Có conv A, không có conv B | 200, contains A=true, contains B=false | PASS |
| tenant A | `GET /api/conversations/:convA` | 200 | 200 | PASS |
| tenant A | `GET /api/conversations/:convA/messages` | 200, có message A | 200, message A present | PASS |
| tenant A | `GET /api/conversations/:convB` | 404 | 404 | PASS |
| tenant A | `GET /api/conversations/:convB/messages` | 404, không leak message B | 404, no leak | PASS |
| platform | `GET /api/conversations/:convA` | Không bị tenant guard chặn | 200 | PASS |
| platform | `GET /api/conversations/:convB` | Không bị tenant guard chặn | 200 | PASS |
| platform | `GET /api/prompts` | 200 | 200, array len 7 | PASS |
| platform | `GET /api/prompts?layer=intent` | 200 | 200, array len 6 | PASS |
| platform | `GET /api/settings/telegram-destinations` | 200 | 200 | PASS |
| platform | `GET /api/settings/handoff` | 200 | 200 | PASS |
| platform | `PUT /api/settings/handoff` current-equivalent | 200 | 200 | PASS |
| tenant A | `GET /api/tenants/tenant-b-test/staff` | 403 | 403 | PASS |

## 12. Test data handling

| Hạng mục | Kết quả |
|---|---|
| Có tạo sample local không | Có, 2 conversations + 2 messages với prefix `test_07b_...` |
| Có cleanup không | Có |
| Cleanup result | PASS: xóa 2 messages và 2 conversations |
| Có tạo tenant fake không | Không |
| Có chạm production không | KHÔNG; DB host đã xác nhận `localhost:5433` |

## 13. Source scope

Source runtime thay đổi:

- `backend/src/api/dashboard.js`

Docs/report thay đổi:

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `report/phase-17/PROMPT_07B_CONVERSATION_TENANT_GUARD_REPORT.md`

Không sửa `backend/prisma/schema.prisma`, migrations, webhook, tenants handoff, RAG, bot engine, dashboard frontend, package hoặc DevOps scripts.

## 14. Remaining P1/P2

- Detail routes còn cần guard: `knowledge`, `prompts`, `quick-reply-menus`, `content-packages`, `content-package-items`, `appointments`.
- Legacy/global routes cần phân loại: staff/handoff/analytics/facebook/global Chatwoot.
- RAG/raw SQL còn để Prompt 08.

## 15. Final verdict

**PASS — conversation tenant guard fixed and cross-tenant smoke verified.**

## 16. Next Step & Goal

Tiếp theo nên chạy **Prompt 07C: detail resource tenant guard**.

Mục tiêu Prompt 07C:

- Tenant-scope detail/read/update/delete cho knowledge/prompts/quick-reply/content-package/package-items/appointments.
- Sau 07C mới cân nhắc Prompt 06D hoặc Prompt 08.

Commit Prompt 07B: `Harden conversation tenant authorization` (xem `git log -1` để lấy hash HEAD).
