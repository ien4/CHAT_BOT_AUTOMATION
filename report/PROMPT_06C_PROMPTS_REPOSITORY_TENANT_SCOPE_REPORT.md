# PROMPT 06C - PROMPTS REPOSITORY TENANT SCOPE REPORT

Ngày thực hiện: 2026-07-08
Trạng thái: **PASS WITH WARNINGS - prompts repository done, default/local scope runtime verified; full tenant isolation needs Prompt 07**

## 1. Mục tiêu

Prompt 06C tạo repository layer cho route:

- `GET /api/prompts`

Mục tiêu chính:

- Đưa Prisma query `promptTemplate.findMany` khỏi prompts controller.
- Giữ nguyên public route `/api/prompts`.
- Giữ nguyên method GET, `authMiddleware`, tenant scope, status code, response shape, query filter, order và error handling.
- Không tách `GET /prompts/:id`, `POST /prompts`, `PUT /prompts/:id`, `DELETE /prompts/:id`.
- Không sửa schema/migrations/webhook/tenant handoff/RAG/bot/dashboard frontend/package/DevOps.
- Static validation và runtime smoke sau refactor.

## 2. Secret/Git safety

| Kiểm tra | Kết quả |
|---|---|
| `.env` có bị tracked không | Không. `git ls-files` không có `.env`/`.env.local`. |
| `.env` có bị staged không | Không. |
| `backend/.env` có ignored không | Có. |
| `dashboard/.env.local` có ignored không | Có. |
| Remote hiện có không | Không có remote configured. |
| Có push không | Không push. |

Không mở/in nội dung `.env`, không in token/JWT secret/DATABASE_URL/API key, không stage secret.

## 3. AI Quality Control Criteria đã áp dụng

- Scope nhỏ: chỉ `GET /prompts`.
- Không tối ưu tenant scope, chỉ di chuyển query nguyên behavior sang repository.
- Không tạo PrismaClient thứ hai.
- Không thêm package, không sửa schema/migrations.
- Không refactor prompt detail/write routes vì có tenant ownership/write behavior cần audit riêng.
- Static validation và runtime smoke đều chạy sau thay đổi.
- Runtime tenant isolation chỉ kết luận đúng phạm vi dữ liệu có sẵn; không tạo dữ liệu giả để pass.

## 4. File/report đã đọc

- `report/PROMPT_06B_TELEGRAM_DESTINATIONS_REPOSITORY_REPORT.md`
- `report/PROMPT_06_REPOSITORY_LAYER_SETTINGS_PROMPTS_REPORT.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/LOCAL_RUN_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `backend/prisma/schema.prisma`
- `backend/src/infrastructure/persistence/prisma/client.js`
- `backend/src/infrastructure/repositories/handoffSettings.repository.js`
- `backend/src/infrastructure/repositories/telegramDestinations.repository.js`
- `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`
- `backend/src/presentation/http/routes/dashboard/prompts.routes.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
- `backend/src/api/dashboard.js`

## 5. Git preflight

| Kiểm tra | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Không ở `master/main` | PASS |
| Working tree trước khi sửa | Clean, ngoài ignored files |
| Commit Prompt 06B `5ac922d` tồn tại | PASS |
| Remote | Không có remote configured |
| `.env` ignored | PASS |
| `.env` tracked/staged | Không |

## 6. Baseline validation

Trước khi sửa:

- `node --check` PASS cho các file backend liên quan:
  - `src/index.js`
  - `src/db.js`
  - `src/api/dashboard.js`
  - `src/presentation/http/controllers/dashboard/settings.controller.js`
  - `src/presentation/http/routes/dashboard/settings.routes.js`
  - `src/presentation/http/controllers/dashboard/prompts.controller.js`
  - `src/presentation/http/routes/dashboard/prompts.routes.js`
  - `src/infrastructure/services/config.js`
  - `src/infrastructure/persistence/prisma/client.js`
  - `src/infrastructure/repositories/handoffSettings.repository.js`
  - `src/infrastructure/repositories/telegramDestinations.repository.js`
- `npx prisma validate` PASS.

Không chạy migration, không chạy `db push`.

## 7. Prompts query + tenant scope map

| Nội dung | Kết quả |
|---|---|
| Source controller cũ | `backend/src/presentation/http/controllers/dashboard/prompts.controller.js` |
| Route mount | `router.use('/prompts', createPromptRoutes({ authMiddleware, getTenantScope, prisma }))` trong `dashboard.js` |
| Controller nhận `getTenantScope` thế nào | `createListPromptTemplates({ getTenantScope, ... })` |
| Logic scope cũ | `const tenantId = getTenantScope(req)` |
| `where` cũ | `const where = { tenantId: tenantId ?? null }; if (layer) where.layer = layer;` |
| `orderBy` cũ | `[{ layer: 'asc' }, { intentType: 'asc' }]` |
| `select/include` cũ | Không có select/include, trả full Prisma model object như cũ. |
| `where` mới | Giữ nguyên trong repository: `{ tenantId: tenantId ?? null }`, thêm `layer` nếu có. |
| `orderBy` mới | Giữ nguyên: `[{ layer: 'asc' }, { intentType: 'asc' }]`. |
| `select/include` mới | Không thêm select/include. |
| Default/global prompt behavior | Platform admin không truyền `tenantScope` vẫn lấy `tenantId: null`. |
| Tenant-specific behavior | `getTenantScope(req)` giữ nguyên; nếu tenant admin có `req.user.tenantId` thì scope bị lock vào tenant đó; nếu platform admin truyền `?tenantScope=...` thì dùng tenant đó. |
| Có raw SQL không | Không. |
| Có external API không | Không. |
| Risk tenant scope | Medium: query có tenant scope; Prompt 06C chỉ giữ nguyên behavior và verify default/local scope, chưa audit full isolation. |

## 8. Repository selected

Chọn prompts repository vì:

- `GET /prompts` là read-only DB query đã được tách route/controller từ Prompt 05C.
- Query hiện tại rõ và có thể move nguyên behavior.
- Đây là bước tiếp theo tự nhiên sau handoff settings và telegram destinations repositories.

Rủi ro tenant scope:

- Route phụ thuộc `getTenantScope(req)`.
- Local DB không có tenant sample nên không thể chứng minh isolation giữa tenant.
- Không được tự sửa logic scope trong Prompt 06C.

Không chọn prompt detail/write routes vì:

- `GET /prompts/:id`, `POST`, `PUT`, `DELETE` còn trong `dashboard.js`.
- Các route này có detail/write behavior và tenant ownership/permission riêng.
- Cần Prompt 07 hoặc test cô lập trước khi tách.

## 9. Files created

- `backend/src/infrastructure/repositories/promptTemplates.repository.js`
- `report/PROMPT_06C_PROMPTS_REPOSITORY_TENANT_SCOPE_REPORT.md`

## 10. Files changed

- `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`
  - `createListPromptTemplates` nhận `promptTemplatesRepository`.
  - Controller vẫn lấy `layer` từ query và gọi `getTenantScope(req)`.
  - Controller gọi `promptTemplatesRepository.findManyForScope({ tenantId, layer })`.

- `backend/src/presentation/http/routes/dashboard/prompts.routes.js`
  - Import `createPromptTemplatesRepository`.
  - Tạo repository từ Prisma singleton được inject.
  - Inject repository vào `createListPromptTemplates`.

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`

## 11. Dependency rule check

| Kiểm tra | Kết quả |
|---|---|
| Có tạo PrismaClient mới không | Không. Repository nhận `{ prisma }`. |
| Repository có import Express không | Không. |
| Repository có đọc `process.env` không | Không. |
| Repository có đọc `req`/`res` không | Không. |
| Controller có giữ HTTP concern không | Có. Controller vẫn xử lý `req`, `res`, `layer`, `getTenantScope(req)`, status/error JSON. |
| Domain có phụ thuộc Prisma không | Không. Domain không sửa. |

## 12. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Public route đổi không | Không. Vẫn `/api/prompts`. |
| Method đổi không | Không. Vẫn GET. |
| Auth đổi không | Không. Vẫn `authMiddleware`. |
| Status code đổi không | Không. Thành công 200, lỗi 500 giữ nguyên. |
| Response shape đổi không | Không. Vẫn array full prompt template objects. |
| Tenant filter đổi không | Không. `tenantId: tenantId ?? null` giữ nguyên. |
| Query/filter `layer` đổi không | Không. |
| Query/order behavior đổi không | Không. |
| Schema/migration đổi không | Không. |
| External API call có không | Không. |

## 13. Static validation

Sau thay đổi:

- `node --check` PASS cho 12 file backend, gồm `promptTemplates.repository.js`.
- `npx prisma validate` PASS.
- `git diff --check` PASS.
- `git diff --stat` và `git diff --name-status` đã được review.

## 14. Runtime smoke result

Môi trường:

- DB local/test: `bbotech-pgvector-local`, port 5433.
- Backend: `npm run dev`, port 3001.
- Auth: JWT local ký trong memory từ admin user hiện có bằng `JWT_SECRET` local. Không in token/credential/username/password.
- Backend startup có log Telegram bot polling vì local env có token; smoke không gọi route test Telegram và không gửi external message.

| Route/test | Status/shape | Result |
|---|---|---|
| `GET /api/prompts` không token | `401` | PASS |
| `GET /api/settings/telegram-destinations` không token | `401` | PASS |
| Local JWT cho admin user hiện có | Tạo trong memory, không in ra | PASS |
| `GET /api/prompts` có token | `200`, array len=7, có field prompt template | PASS |
| `GET /api/prompts?layer=intent` có token | `200`, array len=6, tất cả item có `layer=intent` | PASS |
| Tenant sample data availability | `tenant_count=0`, `tenant_prompt_count=0` | PASS, nhưng không đủ để verify isolation |
| `GET /api/settings/webhook` có token | `200`, có `webhookUrl` | PASS |
| `GET /api/settings/telegram-destinations` có token | `200`, `{destinations, envFallback}` | PASS |
| `GET /api/settings/handoff` có token | `200`, đủ field settings | PASS |
| `PUT /api/settings/handoff` current-equivalent payload | `200`, chỉ gửi field schema hợp lệ | PASS |

Backend process do prompt khởi động đã được dừng sau smoke. Port 3001 đã free.

## 15. Tenant scope verification

| Kiểm tra | Kết quả |
|---|---|
| Default/local scope runtime result | PASS: `/api/prompts` trả 200 array len=7 với token local. |
| Layer filter trong default/local scope | PASS: `/api/prompts?layer=intent` trả 200 array len=6. |
| Có tenant test data không | Không. `tenant_count=0`, `tenant_prompt_count=0`. |
| Có verify tenant isolation đầy đủ không | Chưa. Không có tenant sample để test cách ly nhiều tenant. |
| Kết luận | Prompt 07 vẫn cần để audit tenant scope toàn hệ thống. |

Không đánh dấu tenant safety toàn hệ thống PASS.

## 16. Source runtime scope

Trong Prompt 06C chỉ sửa:

- Prompts repository read.
- Prompts controller dependency.
- Prompts route dependency wiring.
- Tài liệu/report.

Không sửa:

- `backend/src/api/dashboard.js`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/webhook/*`
- `backend/src/tenants/*`
- `backend/src/rag/*`
- `backend/src/bot/*`
- `dashboard/src/*`
- package files
- Dockerfile/scripts
- `.env`/`.env.local`

## 17. Remaining risks

- `backend/src/api/dashboard.js` vẫn lớn, còn nhiều route direct.
- Prompt detail/write routes còn trong `dashboard.js`.
- Tenant safety audit chưa làm; Prompt 06C chỉ verify default/local scope.
- Settings write/external routes còn lại cần test cô lập trước khi refactor.
- `$queryRawUnsafe`/RAG/raw SQL vẫn cần Prompt riêng.
- DevOps script risk vẫn mở.
- npm audit vulnerabilities chưa xử lý.
- API keys trong env local/test cần tiếp tục bảo vệ; không commit/push.

## 18. Final verdict

**PASS WITH WARNINGS - prompts repository done but tenant isolation needs Prompt 07**

Prompt 06C đạt mục tiêu repository và runtime smoke cho default/local scope. Warning còn lại là local DB không có tenant sample, nên chưa thể kết luận full tenant isolation.

## 19. Next Step & Goal

Khuyến nghị tiếp theo:

- **Prompt 07 - Tenant safety audit**: audit `getTenantScope(req)`, prompt/knowledge/channel config/tenant routes và permission boundaries.
- **Prompt 06D - Prompt detail/write repository**: chỉ làm sau Prompt 07, khi tenant ownership/permission đã rõ.

Không nên sang RAG/raw SQL hardening trước khi tenant scope audit nếu query tiếp theo còn phụ thuộc tenant.
