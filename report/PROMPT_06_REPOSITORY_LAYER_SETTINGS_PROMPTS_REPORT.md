# PROMPT 06 — REPOSITORY LAYER SETTINGS/PROMPTS REPORT

Ngày thực hiện: 2026-07-08

## 1. Mục tiêu

Bắt đầu repository layer cho nhóm `settings`/`prompts` bằng một lát nhỏ, an toàn và runtime verified:

- Đưa Prisma access của handoff settings ra khỏi controller.
- Không đổi public API contract.
- Không tạo PrismaClient thứ hai.
- Không sửa Prisma schema/migrations, webhook, tenant handoff, RAG, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.
- Runtime verify lại các route baseline.

## 2. AI Quality Control Criteria đã áp dụng

- **PRD rõ:** Prompt xác định rõ phạm vi repository layer phase 1 cho `settings`/`prompts`, ưu tiên handoff settings.
- **Last mile validation:** Đã chạy static validation và runtime smoke test sau khi sửa.
- **Debug bounded:** Không mở rộng sang Telegram/prompts khi chưa cần; Docker chỉ được khởi động để chạy DB local/test đã có.
- **Architecture control:** Repository nằm trong `infrastructure/repositories`, controller nhận dependency qua factory.
- **Security/no secret:** Không mở/in `.env`, token, JWT secret, encryption key hoặc DATABASE_URL.
- **Code chạy được chưa đủ:** Có smoke test route thật trên backend local và DB local/test.
- **Không tạo nợ kỹ thuật mới:** Không tạo PrismaClient mới, không thêm package, không hard-code secret, không đổi schema.

## 3. File/report đã đọc

- `report/PROMPT_05E_PUT_HANDOFF_SETTINGS_ROUTE_SPLIT_REPORT.md`
- `report/PROMPT_05D_FIX_HANDOFF_SETTINGS_ACCESSOR_REPORT.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/LOCAL_RUN_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `backend/prisma/schema.prisma`
- `backend/src/infrastructure/persistence/prisma/client.js`
- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
- `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`
- `backend/src/presentation/http/routes/dashboard/prompts.routes.js`

Không mở/in `.env` thật.

## 4. Git preflight

| Kiểm tra | Kết quả |
|---|---|
| Branch hiện tại | `chore/prompt-05r-docs-local-run` |
| Không ở `master/main` | PASS |
| Working tree trước khi sửa | Clean |
| Commit Prompt 05E `9eb536a` tồn tại | PASS |
| Remote | Không có remote configured |
| Guardrail | Không dùng `git add .`, không push remote, không switch branch |

## 5. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/prompts.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/prompts.routes.js` | PASS |
| `node --check src/infrastructure/services/config.js` | PASS |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS |
| `npx prisma validate` | PASS |

Không chạy migration, không chạy `db push`, không chạy Docker compose hoặc `start-all.bat`.

## 6. Repository candidate map

| Route | Current Prisma/env access | Repository candidate | Risk | Chọn trong Prompt 06 | Lý do |
|---|---|---|---|---|---|
| `GET /settings/webhook` | Đọc `process.env` để mask config | Không cần DB repository | Low | Không | Không có DB access; đưa vào repository sẽ ép abstraction không cần thiết. |
| `GET /settings/telegram-destinations` | `prisma.telegramDestination.findMany` | Có | Low-Medium | Không | Candidate tốt, nhưng để Prompt 06B nhằm giữ Prompt 06 thật nhỏ. |
| `GET /settings/handoff` | `prisma.handoffSetting.findUnique/create` | Có | Low | **Có** | Đã runtime verified, singleton rõ, không tenant scope, không external API. |
| `PUT /settings/handoff` | `prisma.handoffSetting.upsert` | Có | Low-Medium | **Có** | Cùng domain với GET handoff, đã runtime verified, behavior nhỏ. |
| `GET /prompts` | `prisma.promptTemplate.findMany`, tenant scope từ `getTenantScope(req)` | Có | Medium | Không | Có tenant scope; nên tách ở Prompt 06B với checklist scope riêng. |

## 7. Repository selected

Đã chọn **handoff settings repository** vì:

- Đã runtime verified GET/PUT ở Prompt 05D-FIX và 05E.
- Không raw SQL.
- Không external API.
- Không tenant scope.
- Singleton behavior rõ (`id = 'singleton'`).
- Nằm trong phần Settings/Cài Đặt mấu chốt.
- Có thể test GET/PUT ngay sau khi đổi.

Chưa chọn route khác:

- `settings/webhook`: không có DB access.
- `telegram-destinations`: read-only và đơn giản, nhưng để 06B để không gom quá nhiều.
- `prompts`: có tenant scope, cần giữ chính xác ở prompt riêng.
- Settings external/write còn trong `dashboard.js`: cần test cô lập trước khi tách.

## 8. Files created

- `backend/src/infrastructure/repositories/handoffSettings.repository.js`
- `report/PROMPT_06_REPOSITORY_LAYER_SETTINGS_PROMPTS_REPORT.md`

## 9. Files changed

| File | Thay đổi |
|---|---|
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | `createGetHandoffSettings` và `createPutHandoffSettings` dùng `handoffSettingsRepository` thay vì Prisma trực tiếp. |
| `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Tạo `handoffSettingsRepository` từ `prisma` được truyền vào route factory và inject vào controller. |
| `docs/PROJECT_PROGRESS.md` | Cập nhật Prompt 06, validation history, risks, next step. |
| `docs/FEATURE_AUDIT_CHECKLIST.md` | Thêm bảng Prompt 06. |
| `docs/REFACTOR_PLAN.md` | Thêm kế hoạch sau repository phase 1. |
| `docs/ARCHITECTURE.md` | Ghi rõ repository layer phase 1 và dependency rule sau Prompt 06. |

`backend/src/api/dashboard.js` không đổi trong Prompt 06: vẫn 2382 dòng, khoảng 96 route direct.

## 10. Dependency rule check

| Kiểm tra | Kết quả |
|---|---|
| Repository có tạo PrismaClient mới không | Không. Repository nhận `prisma` dependency từ route factory. |
| Có dùng Prisma wrapper hiện có không | Route vẫn nhận Prisma singleton hiện tại; wrapper `infrastructure/persistence/prisma/client.js` tiếp tục là re-export an toàn, không bị nhân bản client. |
| Controller có giữ HTTP concern không | Có. Controller vẫn xử lý `req`, `res`, status/error JSON. |
| Repository có import Express không | Không. |
| Repository có đọc `process.env` không | Không. |
| Domain có bị phụ thuộc Prisma không | Không. |
| Có tạo application use case/domain interface chưa | Chưa; đây là bước trung gian an toàn trong infrastructure repository. |

## 11. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Public route đổi không | Không. Vẫn `/api/settings/handoff`. |
| Method đổi không | Không. Vẫn GET/PUT. |
| Auth đổi không | Không. Vẫn `authMiddleware`. |
| Status code đổi không | Không. Thành công 200, lỗi giữ như cũ. |
| Response shape đổi không | Không. Vẫn object `HandoffSetting`. |
| Prisma query behavior đổi không | Không có chủ đích. Vẫn find/create/upsert singleton. |
| Schema/migration đổi không | Không. |
| External API call có thêm không | Không. |

## 12. Static validation

| Lệnh | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/prompts.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/prompts.routes.js` | PASS |
| `node --check src/infrastructure/services/config.js` | PASS |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS |
| `node --check src/infrastructure/repositories/handoffSettings.repository.js` | PASS |
| `npx prisma validate` | PASS |
| `git diff --check` | PASS, chỉ có cảnh báo CRLF của Git |

## 13. Runtime smoke result

Môi trường:

- Docker Desktop service ban đầu chưa sẵn sàng; đã khởi động Docker Desktop để dùng DB local/test.
- DB: container `bbotech-pgvector-local` được start bằng `docker start bbotech-pgvector-local`.
- Backend: `npm run dev`, port 3001.
- Auth token: lấy qua `POST /api/auth/login` bằng credential local/test từ env; không in credential/token.
- Sau test: đã dừng backend process do prompt khởi động; giữ DB container/volume/env local.

| Route | Auth behavior | Status | Response shape | DB read/write | External API call | Server crash | Result |
|---|---|---:|---|---|---|---|---|
| `GET /api/settings/handoff` | Không token | 401 | `{error}` | Không | Không | Không | PASS |
| `PUT /api/settings/handoff` | Không token | 401 | `{error}` | Không | Không | Không | PASS |
| `GET /api/settings/handoff` | Token hợp lệ | 200 | `{id,offHoursPendingTimeout,pendingTimeoutSeconds,sessionTimeoutSeconds,updatedAt,workHoursEnd,workHoursStart}` | Read | Không | Không | PASS |
| `PUT /api/settings/handoff` | Token hợp lệ | 200 | Cùng object settings | Upsert current-equivalent payload | Không | Không | PASS |
| `GET /api/settings/handoff` sau PUT | Token hợp lệ | 200 | Cùng object settings | Read | Không | Không | PASS |
| `GET /api/settings/webhook` | Token hợp lệ | 200 | `{appSecret,pageAccessToken,verifyToken,webhookUrl}` | Không | Không | Không | PASS |
| `GET /api/settings/telegram-destinations` | Token hợp lệ | 200 | `{destinations,envFallback}` | Read | Không | Không | PASS |
| `GET /api/prompts` | Token hợp lệ | 200 | Array, length 7 | Read | Không | Không | PASS |

PUT payload chỉ gồm field schema hợp lệ: `pendingTimeoutSeconds`, `sessionTimeoutSeconds`, `offHoursPendingTimeout`, `workHoursStart`, `workHoursEnd`. Không gửi `id`, `updatedAt`, `botGracePeriodSeconds`.

## 14. Source runtime scope

Chỉ sửa:

- Handoff settings repository.
- Settings controller handoff GET/PUT.
- Settings route dependency injection.
- Docs/report.

Không sửa:

- `backend/src/api/dashboard.js`.
- Prisma schema/migrations.
- Webhook handlers.
- Tenant handoff.
- RAG pipeline.
- Bot engine/tools.
- Dashboard frontend.
- DevOps scripts.
- Package/dependency.
- Env files thật.

## 15. Remaining risks

- `backend/src/api/dashboard.js` vẫn lớn: 2382 dòng, khoảng 96 route direct.
- Settings external/write còn lại chưa tách: Telegram destination write/test, Chatwoot test, Facebook menu.
- Tenant scope sâu chưa runtime verified toàn diện.
- `$queryRawUnsafe` vẫn cần audit riêng.
- DevOps scripts vẫn có rủi ro migration/db push/start-all và cần hardening riêng.
- npm audit vulnerabilities vẫn chưa xử lý trong prompt này.
- Repository coverage còn ít: mới có handoff settings.
- Prompts repository cần giữ tenant scope chính xác nếu làm ở Prompt 06B.

## 16. Final verdict

**PASS — repository layer phase 1 and runtime verified.**

Điều kiện pass đã đạt:

- Static validation PASS.
- Runtime smoke PASS.
- Dependency rule giữ đúng ở mức phase 1.
- Không tạo PrismaClient mới.
- Không đổi public API contract.
- Backend process do prompt khởi động đã dừng.

## 17. Next Step & Goal

Đề xuất tiếp theo:

- **Prompt 06B**: repository cho `telegram-destinations` read hoặc `prompts`. Nếu chọn prompts, mục tiêu chính là giữ tenant scope chính xác.
- **Prompt 07**: tenant safety audit nếu cần ưu tiên scope/permission trước khi mở rộng repository.

Không nên sang RAG/raw SQL hardening trước khi tenant scope được hiểu rõ nếu query đó phụ thuộc tenant.
