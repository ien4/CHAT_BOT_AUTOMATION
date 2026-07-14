# PROMPT 06B - TELEGRAM DESTINATIONS REPOSITORY REPORT

Ngày thực hiện: 2026-07-08
Trạng thái: **PASS - repository layer 06B and runtime verified**

## 1. Mục tiêu

Prompt 06B tạo repository layer cho route read-only:

- `GET /api/settings/telegram-destinations`

Mục tiêu chính:

- Di chuyển Prisma query `telegramDestination.findMany` khỏi settings controller.
- Tạo repository infrastructure riêng cho Telegram destinations read.
- Giữ nguyên public API contract: route, method, auth middleware, response shape, status code và query order.
- Không sửa route write/test Telegram destinations.
- Không sửa schema/migrations/webhook/tenant handoff/RAG/bot/dashboard frontend/package/DevOps.
- Runtime smoke test sau refactor.

## 2. Secret/Git safety

- `.env` và `.env.local` vẫn nằm trong gitignore.
- Không đọc/in nội dung secret thực tế.
- Không stage/commit `.env`, `.env.local`, token, credential hoặc log chứa secret.
- `git remote -v` không có remote, nên không push.
- Không dùng `git add .`; chỉ stage file cụ thể đúng phạm vi.
- Không chạy `prisma db push`, migration mới, Docker compose, start-all script hoặc thao tác destructive.

## 3. AI Quality Control

- Chọn phạm vi nhỏ, read-only, đã có route/controller tách từ Prompt 05B.
- Không tạo abstraction domain/use-case mới vì chưa cần; giữ bước trung gian repository infrastructure để giảm Prisma access khỏi controller.
- Repository nhận Prisma dependency từ route factory để không tạo PrismaClient thứ hai.
- Controller vẫn giữ `envFallback.statusGroupIdConfigured` vì đây là response/config concern hiện hữu, không phải DB operation.
- Runtime smoke được chạy sau static validation để xác nhận không đổi behavior.

## 4. File/report đã đọc

- `report/archive/early-prompts/PROMPT_06_REPOSITORY_LAYER_SETTINGS_PROMPTS_REPORT.md`
- `report/archive/early-prompts/PROMPT_05E_PUT_HANDOFF_SETTINGS_ROUTE_SPLIT_REPORT.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/runbooks/LOCAL_RUN_GUIDE.md`
- `docs/architecture/ARCHITECTURE.md`
- `backend/prisma/schema.prisma`
- `backend/src/infrastructure/persistence/prisma/client.js`
- `backend/src/infrastructure/repositories/handoffSettings.repository.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
- `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`
- `backend/src/presentation/http/routes/dashboard/prompts.routes.js`
- `backend/src/api/dashboard.js`

## 5. Git preflight

- Branch: `chore/prompt-05r-docs-local-run`
- Working tree trước khi sửa: clean.
- Commit Prompt 06 tồn tại: `5b26b25`.
- Remote: không có remote configured.
- Env safety:
  - `backend/.env` ignored.
  - `dashboard/.env.local` ignored.
  - Không có `.env` hoặc `.env.local` tracked.

## 6. Baseline validation

Trước khi sửa:

- `node --check` PASS cho các file backend liên quan.
- `npx prisma validate` PASS.

Sau khi sửa:

- `node --check` PASS cho 11 file backend, gồm repository mới.
- `npx prisma validate` PASS.
- `git diff --check` PASS.

## 7. Repository candidate confirmation

Candidate được xác nhận:

- `GET /settings/webhook`: không cần repository vì không đọc DB.
- `GET/PUT /settings/handoff`: đã đi qua `handoffSettingsRepository` từ Prompt 06.
- `GET /settings/telegram-destinations`: phù hợp Prompt 06B vì là read-only DB query, response contract rõ, không có external side effect.
- `GET /prompts`: để Prompt 06C vì có tenant scope cần kiểm tra kỹ.

Các route không thuộc phạm vi:

- `POST /settings/telegram-destinations`
- `PUT /settings/telegram-destinations/:id`
- `DELETE /settings/telegram-destinations/:id`
- `POST /settings/telegram-destinations/:id/test`

## 8. Repository selected

Repository được tạo:

- `backend/src/infrastructure/repositories/telegramDestinations.repository.js`

API repository:

- `findAll()`

Query giữ nguyên:

- `prisma.telegramDestination.findMany({ orderBy: [{ purpose: 'asc' }, { name: 'asc' }] })`

## 9. Files created

- `backend/src/infrastructure/repositories/telegramDestinations.repository.js`
- `report/archive/early-prompts/PROMPT_06B_TELEGRAM_DESTINATIONS_REPOSITORY_REPORT.md`

## 10. Files changed

- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
  - `createGetTelegramDestinations` nhận `telegramDestinationsRepository`.
  - Controller gọi `telegramDestinationsRepository.findAll()` thay vì gọi Prisma trực tiếp.
  - Response `{ destinations, envFallback }` giữ nguyên.

- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
  - Import `createTelegramDestinationsRepository`.
  - Tạo repository từ Prisma singleton được inject.
  - Inject repository vào `createGetTelegramDestinations`.

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/architecture/ARCHITECTURE.md`

## 11. Dependency rule check

Kết quả: **PASS**

- Repository không import Express.
- Repository không đọc `process.env`.
- Repository không import domain/application.
- Repository không tạo PrismaClient mới.
- Route factory nhận Prisma singleton từ `dashboard.js` và tạo repository.
- Controller nhận repository qua dependency injection.
- Domain layer không bị sửa và không phụ thuộc Prisma/Express.

## 12. Behavior safety

Giữ nguyên:

- Public path: `/api/settings/telegram-destinations`
- Method: `GET`
- Auth middleware: giữ nguyên `authMiddleware`
- Success status: `200`
- Error status khi list lỗi: `500`
- Response shape:
  - `destinations`
  - `envFallback.statusGroupIdConfigured`
- Query order:
  - `purpose asc`
  - `name asc`

Không thay đổi:

- Prisma schema/migrations.
- Telegram destination write/test routes.
- Webhook handlers.
- Tenant handoff.
- RAG pipeline/raw SQL.
- Bot engine/tools.
- Dashboard frontend.
- Package/dependency.
- DevOps scripts.

## 13. Static validation

Kết quả: **PASS**

- `node --check` PASS:
  - `backend/src/index.js`
  - `backend/src/db.js`
  - `backend/src/api/dashboard.js`
  - `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
  - `backend/src/presentation/http/routes/dashboard/settings.routes.js`
  - `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`
  - `backend/src/presentation/http/routes/dashboard/prompts.routes.js`
  - `backend/src/infrastructure/services/config.js`
  - `backend/src/infrastructure/persistence/prisma/client.js`
  - `backend/src/infrastructure/repositories/handoffSettings.repository.js`
  - `backend/src/infrastructure/repositories/telegramDestinations.repository.js`
- `npx prisma validate` PASS.
- `git diff --check` PASS.

## 14. Runtime smoke result table

Backend chạy bằng `npm run dev` trên port 3001, DB local/test `bbotech-pgvector-local`.

Authorized smoke dùng JWT local ký trong memory từ admin user hiện có bằng `JWT_SECRET` local. Không in token, credential, username hoặc password. Lý do: không giả định password login local.

| Test | Kết quả | Ghi chú |
|---|---|---|
| `GET /api/settings/telegram-destinations` không token | PASS | `401` |
| `GET /api/settings/handoff` không token | PASS | `401` |
| Local JWT cho admin user hiện có | PASS | Tạo trong memory, không in ra |
| `GET /api/settings/telegram-destinations` có token | PASS | `200`, `destinations=0`, có `envFallback.statusGroupIdConfigured` boolean |
| `GET /api/settings/webhook` có token | PASS | `200`, có `webhookUrl` |
| `GET /api/settings/handoff` có token | PASS | `200`, đủ field settings |
| `PUT /api/settings/handoff` với payload tương đương current settings | PASS | `200`, giữ field schema hợp lệ |
| `GET /api/prompts` có token | PASS | `200`, array `items=7` |

Backend đã được dừng sau smoke test. Port 3001 đã free.

## 15. Source runtime scope

Trong Prompt 06B chỉ sửa:

- Repository read Telegram destinations.
- Settings controller dependency.
- Settings route dependency wiring.
- Tài liệu/report.

Không sửa source runtime ngoài phạm vi:

- `backend/src/api/dashboard.js`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/webhook/*`
- `backend/src/tenants/*`
- `backend/src/rag/*`
- `backend/src/bot/*`
- `dashboard/src/*`
- `package.json`
- Dockerfile/scripts.

Lưu ý runtime: khi backend khởi động, log cho thấy Telegram bot polling được start vì local env có token. Đây là startup behavior hiện hữu, không phải do route `GET /settings/telegram-destinations`. Smoke test không gọi route test Telegram và không gửi external message.

## 16. Remaining risks

- `backend/src/api/dashboard.js` vẫn lớn, còn nhiều route direct chưa được tách.
- Telegram destination write/test routes vẫn ở `dashboard.js` và cần test cô lập trước khi refactor vì có write/external side effect.
- `GET /prompts` chưa có repository và có tenant scope cần giữ chính xác.
- Tenant scope toàn hệ thống chưa được audit sâu.
- `$queryRawUnsafe`/RAG/raw SQL vẫn cần Prompt riêng.
- DevOps script/migration policy vẫn còn rủi ro và cần Prompt riêng.
- Backend chưa có lint/typecheck thật.

## 17. Final verdict

**PASS - repository layer 06B and runtime verified**

Prompt 06B đạt mục tiêu:

- Đã tạo `telegramDestinationsRepository`.
- `GET /api/settings/telegram-destinations` không còn gọi Prisma trực tiếp trong controller.
- Public API contract giữ nguyên.
- Runtime smoke PASS.
- Secret/env không bị stage/commit.
- Không sửa các khu vực ngoài phạm vi.

## 18. Gợi ý tiếp theo

Mục tiêu tiếp theo nên là một trong hai hướng:

- **Prompt 06C - Prompts repository with tenant scope checklist**: đưa `GET /prompts` vào repository nhưng phải giữ tenant scope chính xác và có smoke regression.
- **Prompt 07 - Tenant safety audit**: audit permission/scope trước khi đưa thêm query có tenant vào repository.

## 19. Điểm cần tu sửa

- Bổ sung repository cho `GET /prompts` sau khi có checklist tenant scope rõ.
- Tạo test cô lập trước khi refactor Telegram destination write/test routes.
- Giảm dần `backend/src/api/dashboard.js` theo route nhỏ, không gom refactor lớn.
- Bổ sung quality gate backend lint/typecheck khi có prompt riêng.
