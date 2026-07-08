# REFACTOR PLAN - BBOTECH BOT AUTOMATION

## Prompt 05C đã hoàn thành phase 3

Ngày cập nhật: 2026-07-08

Prompt 05C đã tiếp tục tách route nhỏ trong phạm vi an toàn:

- Tách `GET /prompts` khỏi `backend/src/api/dashboard.js`.
- Tạo `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/prompts.routes.js`.
- Mount prompts route bằng `router.use('/prompts', createPromptRoutes({ authMiddleware, getTenantScope, prisma }))`.
- Giữ nguyên public route `/api/prompts`, method `GET`, auth middleware, tenant scope, Prisma query, status code và response shape.
- Không tách các route `GET /prompts/:id`, `POST /prompts`, `PUT /prompts/:id`, `DELETE /prompts/:id` vì các route này có detail/write behavior và nên xử lý riêng.
- Không sửa webhook handlers, tenant handoff, RAG pipeline, bot engine, Prisma schema/migrations hoặc dashboard frontend.
- Static validation pass — chưa runtime verified.

Prompt tiếp theo nên là Prompt 05R: chạy runtime smoke test có kiểm soát cho 3 route đã tách (`GET /settings/webhook`, `GET /settings/telegram-destinations`, `GET /prompts`) trước khi tiếp tục Prompt 05D hoặc sang Prompt 06 repository layer.

## Prompt 05B đã hoàn thành phase 2

Ngày cập nhật: 2026-07-08

Prompt 05B đã tiếp tục tách route nhỏ trong phạm vi an toàn:

- Tách `GET /settings/telegram-destinations` khỏi `backend/src/api/dashboard.js`.
- Mở rộng `backend/src/presentation/http/controllers/dashboard/settings.controller.js`.
- Mở rộng `backend/src/presentation/http/routes/dashboard/settings.routes.js`.
- Mount settings route bằng `router.use('/settings', createSettingsRoutes({ authMiddleware, prisma }))`.
- Giữ nguyên public route `/api/settings/telegram-destinations`, method `GET`, auth middleware, Prisma query, status code và response shape.
- Không tách các route `POST/PUT/DELETE /settings/telegram-destinations` hoặc route test Telegram vì có write/external side effect.
- Không sửa webhook handlers, tenant handoff, RAG pipeline, Prisma schema/migrations hoặc dashboard frontend.
- Static validation pass — chưa runtime verified.

Prompt tiếp theo nên là Prompt 05C: tiếp tục tách thêm một route/nhóm route nhỏ, ưu tiên read-only, không raw SQL, không upload, không external side effect. Chưa nên chuyển sang repository layer nếu `backend/src/api/dashboard.js` vẫn còn nhiều route trực tiếp và controller boundary chưa đủ rõ.

## Prompt 05 đã hoàn thành phase 1

Ngày cập nhật: 2026-07-08

Prompt 05 đã tách nhóm route đầu tiên trong phạm vi an toàn:

- Tách `GET /settings/webhook` khỏi `backend/src/api/dashboard.js`.
- Tạo `backend/src/presentation/http/controllers/dashboard/settings.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/settings.routes.js`.
- Mount lại bằng `router.use('/settings', createSettingsRoutes({ authMiddleware }))`.
- Giữ nguyên public route `/api/settings/webhook`, method `GET`, auth middleware và response shape.
- Không sửa webhook handlers, tenant handoff, RAG pipeline, Prisma schema/migrations hoặc dashboard frontend.
- Static validation pass — chưa runtime verified.

Prompt tiếp theo nên là Prompt 05B: tiếp tục tách thêm một nhóm route nhỏ, ít rủi ro khỏi `backend/src/api/dashboard.js` trước khi chuyển sang repository layer.

## Prompt 04 đã hoàn thành

Ngày cập nhật: 2026-07-08

Prompt 04 đã xử lý phần config/env trong phạm vi an toàn:

- Mở rộng backend config helper, chưa migrate runtime call site lớn.
- Chuẩn hóa dashboard env helper và gom Chatwoot fallback trong settings về helper.
- Bổ sung `backend/.env.example`, tạo `dashboard/.env.example`.
- Tạo `docs/ENV_POLICY.md`.
- Scan read-only các rủi ro DevOps/local URL nhưng chưa sửa `start-all.bat`, `backend/Dockerfile`, `webhook-urls-current.txt`.

Prompt tiếp theo nên là Prompt 05: tách `backend/src/api/dashboard.js` theo route/controller domain nhỏ, giữ nguyên public route và response contract.

Ngày cập nhật: 2026-07-08  
Trạng thái: Prompt 03 đã tạo architecture shell và wrapper tối thiểu, chưa đổi behavior có chủ đích.

## 1. Prompt 03 đã làm gì

Prompt 03 tạo nền tổ chức cho các bước refactor sau:

- Tạo backend Clean Architecture shell: `domain`, `application`, `infrastructure`, `presentation`.
- Thêm README trong các layer/folder chính để ghi rõ vai trò và dependency rule.
- Thêm Prisma wrapper tại `backend/src/infrastructure/persistence/prisma/client.js`.
- Thêm backend config helper tại `backend/src/infrastructure/services/config.js`.
- Tạo dashboard shell: `components`, `features`, `lib/config`, `lib/api`, `lib/auth`, `lib/utils`, `styles`.
- Thêm dashboard env helper tại `dashboard/src/lib/config/env.ts`.
- Thêm dashboard API client factory tại `dashboard/src/lib/api/client.ts`.
- Giữ `dashboard/src/lib/api.ts` làm compatibility facade.
- Chuẩn hóa một số hard-code `http://localhost:3001` trong dashboard sang `API_BASE_URL`, fallback local vẫn giữ như cũ.
- Không move page lớn, webhook, tenant handoff, RAG pipeline hoặc Prisma schema.

## 2. Thứ tự refactor tiếp theo

| Prompt | Tên | Mục tiêu |
|---|---|---|
| Prompt 04 | Config hardening + localhost cleanup | Gom cấu hình backend/dashboard, loại hard-code URL còn lại, viết env policy. |
| Prompt 05 | Backend API route/controller split | Tách `backend/src/api/dashboard.js` theo domain nhỏ, giữ route/response. |
| Prompt 06 | Repository layer cho Prisma | Đưa Prisma access dần vào repositories, không đổi schema. |
| Prompt 07 | Tenant safety audit | Trace tenant scope trên webhook, conversations, staff, knowledge, handoff. |
| Prompt 08 | RAG/raw SQL hardening | Audit `$queryRawUnsafe`, pgvector query và input source. |
| Prompt 09 | Dashboard feature split | Tách page lớn thành feature components, giữ route/UI behavior. |
| Prompt 10 | DevOps/deploy hardening | Tách local scripts khỏi production, xử lý migration policy và deploy env. |

## 3. Prompt 04 - Config hardening + localhost cleanup

Mục tiêu:

- Chuẩn hóa config backend/dashboard.
- Loại hard-code `localhost`, `127.0.0.1`, URL local trong source runtime nếu không đổi behavior.
- Viết env policy: biến bắt buộc, biến optional, fallback chỉ local dev.

File được phép sửa:

- `backend/src/infrastructure/services/config.js`
- `dashboard/src/lib/config/env.ts`
- `dashboard/src/lib/api.ts`
- Dashboard pages còn fetch/base URL hard-code
- `docs/ARCHITECTURE.md`, `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`

File không được sửa:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/**`
- `backend/src/tenants/handoff.js`
- `backend/src/rag/pipeline.js`
- `backend/src/webhook/*`

Validation bắt buộc:

- Backend `node --check` cho config wrapper và file trọng yếu.
- Prisma validate với `DATABASE_URL` dummy.
- Dashboard `tsc --noEmit`.
- Dashboard build.
- `rg "localhost|127\\.0\\.0\\.1" backend/src dashboard/src`.

Risk rollback:

- Nếu URL behavior đổi sai, revert các thay đổi page/client về helper trước đó.
- Không sửa production deploy script trong cùng prompt nếu chưa có env policy.

## 4. Prompt 05 - Backend API route/controller split

Mục tiêu:

- Tách `backend/src/api/dashboard.js` thành route/controller theo domain nhỏ.
- Giữ public route và response contract.
- Ưu tiên auth/stats hoặc một domain ít rủi ro trước.

File được phép sửa:

- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/controllers/**`
- `backend/src/presentation/http/routes/**`
- `backend/src/application/dtos/**` nếu cần type/shape tài liệu hóa

File không được sửa:

- Webhook handlers
- Tenant handoff
- RAG pipeline
- Prisma schema/migrations

Validation bắt buộc:

- `node --check` cho toàn bộ file mới và `src/index.js`.
- Prisma validate với URL dummy.
- Route map trước/sau bằng `rg "router\\.(get|post|put|delete)"`.

Risk rollback:

- Nếu route import/registration vỡ, revert domain vừa tách, không revert toàn bộ repo.

## 5. Prompt 06 - Repository layer cho Prisma

Mục tiêu:

- Tạo repository implementation đầu tiên dùng `backend/src/infrastructure/persistence/prisma/client.js`.
- Không tạo PrismaClient thứ hai.
- Tách query ít rủi ro trước.

File được phép sửa:

- `backend/src/infrastructure/repositories/**`
- Một phần nhỏ của `backend/src/api/dashboard.js` hoặc use case đã tách
- `backend/src/domain/interfaces/**`

File không được sửa:

- Prisma schema/migrations
- RAG raw SQL phức tạp nếu chưa tới Prompt 08
- Tenant handoff nếu chưa có Prompt 07 audit

Validation bắt buộc:

- `node --check`.
- Prisma validate với URL dummy.
- So sánh query route trước/sau bằng review diff.

Risk rollback:

- Mỗi repository chỉ migrate một nhóm query nhỏ; nếu fail, revert nhóm đó.

## 6. Prompt 07 - Tenant safety audit

Mục tiêu:

- Trace tenant scope từ webhook payload tới conversation/message/staff/knowledge query.
- Lập bảng query có tenantId, pageId, channel config và fallback.
- Không sửa logic lớn nếu chưa rõ.

File được phép sửa:

- Docs/report audit.
- Chỉ sửa source nếu bug scope đơn giản và có validation rõ.

File không được sửa:

- Không rewrite tenant handoff.
- Không đổi webhook URL.
- Không đổi Prisma schema.

Validation bắt buộc:

- Read-only scan query tenantId.
- `node --check`.
- Prompt-specific regression checklist.

Risk rollback:

- Nếu phát hiện bug scope lớn, tạo report và tách prompt fix riêng.

## 7. Prompt 08 - RAG/raw SQL hardening

Mục tiêu:

- Audit toàn bộ `$queryRawUnsafe`.
- Phân loại query có input người dùng, vector formatting, schema-dependent query.
- Chuyển sang query an toàn từng điểm nếu chắc chắn.

File được phép sửa:

- `backend/src/rag/pipeline.js`
- Repository/helper liên quan RAG nếu đã có
- Report/docs

File không được sửa:

- Prisma schema/migrations nếu chưa có migration plan.
- Bot agent/tools ngoài phần gọi RAG cần thiết.

Validation bắt buộc:

- `node --check`.
- Prisma validate dummy.
- Test bằng sample nhỏ chỉ khi có DB an toàn.

Risk rollback:

- Nếu vector query đổi kết quả hoặc syntax DB không chắc, giữ nguyên và chỉ document risk.

## 8. Prompt 09 - Dashboard feature split

Mục tiêu:

- Tách một page lớn thành feature component/hook nhỏ.
- Giữ route URL, UI text, API calls và auth/tenantScope.

File được phép sửa:

- Một page trong `dashboard/src/app/dashboard/*/page.tsx`
- Folder tương ứng trong `dashboard/src/features/*`
- Shared component nếu thực sự dùng ngay

File không được sửa:

- Không redesign toàn dashboard.
- Không đổi auth provider.
- Không đổi API response contract.

Validation bắt buộc:

- `npx --no-install tsc --noEmit`.
- `npm run --if-present build`.
- Browser/manual verification nếu app server được phép trong prompt đó.

Risk rollback:

- Nếu build fail và nguyên nhân không rõ, revert page vừa tách.

## 9. Prompt 10 - DevOps/deploy hardening

Mục tiêu:

- Tách local bootstrap khỏi production deploy.
- Xử lý `db push --accept-data-loss`, container migration policy, env file policy và stale webhook URLs.

File được phép sửa:

- `start-all.bat`, `stop-all.bat`
- Dockerfile/compose nếu prompt cho phép
- docs deploy/env

File không được sửa:

- Không đổi application behavior cùng lúc với deploy script.
- Không chạy migration/db push trên dữ liệu thật.

Validation bắt buộc:

- `docker compose config` nếu được phép.
- Không chạy `docker compose up` nếu chưa có yêu cầu rõ.
- Script dry-run hoặc read-only validation trước khi chạy thật.

Risk rollback:

- Giữ backup script cũ hoặc commit nhỏ để revert từng script.
