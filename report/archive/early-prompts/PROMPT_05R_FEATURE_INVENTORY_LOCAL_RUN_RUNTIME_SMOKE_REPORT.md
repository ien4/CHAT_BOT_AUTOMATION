# PROMPT 05R — FEATURE INVENTORY + LOCAL RUN + RUNTIME SMOKE REPORT

Ngày thực hiện: 2026-07-08
Kết luận: **BLOCKED — needs local/test env** (docs + readiness + static validation đã hoàn tất; runtime smoke test chưa chạy vì thiếu `.env` local/test và DB local/test).

## 1. Mục tiêu

- Xuất danh sách chức năng đầy đủ theo nhóm FE/BE/Bot/AI/RAG/Multi-tenant/DevOps.
- Kiểm tra trạng thái chạy local: dependency, env, scripts, DB requirement, rủi ro.
- Tạo hướng dẫn chạy local an toàn.
- Nếu đủ điều kiện an toàn → runtime smoke test 3 route đã tách; nếu chưa → không chạy bừa, tạo checklist thủ công.
- Không sửa logic runtime; không migration/db push/Docker/start-all.
- Cập nhật progress/checklist/report.

## 2. File/report đã đọc

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/policies/ENV_POLICY.md`
- `report/archive/early-prompts/PROMPT_05C_BACKEND_API_ROUTE_CONTROLLER_SPLIT_REPORT.md`
- `backend/package.json`, `dashboard/package.json`
- `backend/.env.example`, `dashboard/.env.example`
- `docker-compose.yml`, `start-all.bat`, `stop-all.bat`
- `backend/Dockerfile`, `dashboard/Dockerfile`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
- `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`
- `backend/src/presentation/http/routes/dashboard/prompts.routes.js`

Không đọc/in `.env` thật. File `project-structure-audit.md` không tồn tại trong workspace — không copy stack/route/nghiệp vụ từ dự án khác.

## 3. Preflight result

| Hạng mục | Kết quả |
|---|---|
| `git status --short --branch` | `## master`, working tree sạch trước Prompt 05R |
| `git log --oneline -12` | HEAD `5e51bf7 Split additional dashboard API route group` |
| Commit Prompt 05C `5e51bf7eea53305b4800c1449f4dc60caf885f46` | Tồn tại (`git cat-file -t` → `commit`) |
| Source runtime change lạ | Không có → tiếp tục (không BLOCKED preflight) |

## 4. Feature inventory summary

Đã tạo `docs/architecture/FEATURE_INVENTORY.md` gồm 9 phần: tổng quan sản phẩm, Backend Core, Messaging/Webhook, Bot/AI, RAG/Knowledge, Multi-tenant, Dashboard Frontend, DevOps/Local/Deploy, và bảng runtime verification status. Không mục nào đánh dấu runtime PASS vì chưa smoke test thật. 3 route đã tách được đánh dấu `Static validated — chưa runtime verified`.

## 5. Local run readiness

- **Dependency**: `backend/node_modules` và `dashboard/node_modules` đều EXISTS. Node v22.18.0, npm 11.6.0.
- **Env file status (không in secret)**: `backend/.env` **MISSING**; `dashboard/.env` và `dashboard/.env.local` **MISSING**. Chỉ có `.env.example`. Chỉ kiểm tra tồn tại, không mở nội dung.
- **DB local/test status**: Chưa xác nhận. Không có `DATABASE_URL` (do thiếu `.env`); chưa xác nhận PostgreSQL local/test đang chạy.
- **Scripts risk**: `start-all.bat` có `prisma db push --accept-data-loss`, cloudflared/ngrok, hard-code path, tham chiếu `chatwoot/` không tồn tại → không dùng. `backend/Dockerfile` CMD chạy `prisma migrate deploy` khi start. `docker-compose.yml` nạp `./backend/.env`.
- **Manual steps required**: tạo `backend/.env` + `dashboard/.env(.local)` từ example; cung cấp DB local/test + `DATABASE_URL`; `JWT_SECRET`; `ENCRYPTION_KEY` nếu cần; credential admin local/test; không dùng token production. Chi tiết trong `docs/runbooks/LOCAL_RUN_GUIDE.md` mục 3.

## 6. Static validation result

| Command | Result | Notes |
|---|---|---|
| `node --check src/index.js` | PASS | Không start server |
| `node --check src/db.js` | PASS | Prisma singleton hợp lệ |
| `node --check src/api/dashboard.js` | PASS | Dashboard API hợp lệ |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS | Controller settings hợp lệ |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS | Route settings hợp lệ |
| `node --check src/presentation/http/controllers/dashboard/prompts.controller.js` | PASS | Controller prompts hợp lệ |
| `node --check src/presentation/http/routes/dashboard/prompts.routes.js` | PASS | Route prompts hợp lệ |
| `node --check src/infrastructure/services/config.js` | PASS | Config helper hợp lệ |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Prisma wrapper hợp lệ |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Schema valid; không migrate/db push/connect DB thật |
| `npx --no-install tsc --noEmit` (dashboard) | PASS | Exit 0 |
| `npm run build` (dashboard) | PASS | `next build` thành công, tất cả route prerender |

**Static validation tổng: PASS.**

## 7. Runtime smoke readiness

**BLOCKED — NEEDS MANUAL SETUP.**

Đánh giá theo điều kiện Phase 4:

| Điều kiện | Đạt? |
|---|---|
| Có `.env`/env local/test cấu hình | KHÔNG (`.env` MISSING) |
| Có `DATABASE_URL` local/test | KHÔNG |
| Xác nhận không phải production | Không xác nhận được (không có env/DB) |
| Backend start không cần migration/db push | Một phần — server không tự migrate, nhưng seed defaults sẽ ghi DB; và không có DB để kết nối |
| Có cách lấy auth token test an toàn | KHÔNG (login cần DB + credential local/test) |
| Không cần external API thật cho 3 route | ĐÚNG (3 route không gọi external) |
| Người dùng đồng ý dùng DB local/test | Chưa cung cấp |

→ Thiếu nhiều điều kiện → không start app server, không gọi API.

## 8. Runtime smoke result

Không chạy được — **BLOCKED**.

Lý do blocked:
- `backend/.env` và `dashboard/.env(.local)` không tồn tại → không có `DATABASE_URL`, `JWT_SECRET`.
- Không có DB local/test được xác nhận; 2/3 route cần DB, và login (để lấy token cho cả 3 route) cần DB + credential.
- Không có cách lấy auth token test mà không có env/DB → không thể gọi route đúng auth.

Người dùng cần chuẩn bị (chi tiết `docs/runbooks/LOCAL_RUN_GUIDE.md` mục 3):
- Tạo `backend/.env` từ `backend/.env.example` với `DATABASE_URL` local/test, `JWT_SECRET`, `ADMIN_USERNAME/ADMIN_PASSWORD` local/test, `ENCRYPTION_KEY` nếu cần.
- Tạo `dashboard/.env.local` từ `dashboard/.env.example`.
- Cung cấp/khởi động PostgreSQL local/test (không production), xác nhận rõ là môi trường test.
- Sau đó chạy lại Prompt 05R để thực hiện Phase 5 smoke test.

## 9. Files created/changed

Created:
- `docs/architecture/FEATURE_INVENTORY.md`
- `docs/runbooks/LOCAL_RUN_GUIDE.md`
- `report/archive/early-prompts/PROMPT_05R_FEATURE_INVENTORY_LOCAL_RUN_RUNTIME_SMOKE_REPORT.md`

Changed (chỉ docs):
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`

## 10. Source runtime có thay đổi không

- Không sửa `backend/src` logic (chỉ chạy `node --check`, không chỉnh sửa).
- Không sửa `dashboard/src` UI (chỉ `tsc`/`build`).
- Không sửa Prisma schema/migrations.
- Không sửa webhook/RAG/tenant handoff/bot engine.
- Không sửa DevOps scripts/Dockerfile.

## 11. Remaining risks

- `backend/src/api/dashboard.js` còn lớn: 2.408 dòng, 98 route trực tiếp.
- Runtime chưa verify cho cả 3 route đã tách (BLOCKED — thiếu env/DB).
- DB local/test chưa có; `.env` local/test chưa tạo.
- `$queryRawUnsafe` còn trong dashboard API/RAG/tenant handoff — chưa hardening.
- Tenant scope chưa runtime verified (Prompt 07).
- DevOps script risk: `start-all.bat` (`db push --accept-data-loss`, cloudflared/ngrok, hard-code path, `chatwoot/` thiếu), `backend/Dockerfile` (`prisma migrate deploy` on start), `webhook-urls-current.txt` stale.
- Default credential/fallback: `admin/admin123` trong start-all/login, fallback secret.
- npm audit vulnerabilities: backend 10 (7 moderate, 1 high, 2 critical); dashboard 3 (1 moderate, 2 high) — chưa xử lý (không thêm/nâng package trong prompt này).

## 12. Final verdict

**BLOCKED — needs local/test env.**

- Feature inventory + local run guide + static validation: hoàn tất, PASS.
- Runtime smoke test 3 route: chưa chạy được do thiếu `.env` local/test và DB local/test.
- Không có source runtime thay đổi; chỉ docs/report.

## 13. Next Step & Goal

Vì runtime smoke test đang **BLOCKED**:

- **Người dùng chuẩn bị**: `backend/.env` + `dashboard/.env.local` local/test và một PostgreSQL local/test (không production), rồi **chạy lại Prompt 05R** để thực hiện Phase 5 (runtime smoke test có kiểm soát 3 route).
- Sau khi 3 route runtime PASS:
  - **Prompt 05D**: tiếp tục tách thêm route read-only nhỏ khỏi `dashboard.js`, hoặc
  - **Prompt 06**: bắt đầu repository layer cho prompts/settings khi controller boundary đã đủ.

Mục tiêu: đạt runtime verification thật cho các route đã tách trước khi mở rộng blast radius refactor.
