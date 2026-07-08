# PROMPT 05C — BACKEND API ROUTE/CONTROLLER SPLIT REPORT

Ngày thực hiện: 2026-07-08
Phạm vi: tách route/controller backend phase 3 cho một route read-only nhỏ trong `backend/src/api/dashboard.js`.
Kết luận: **PASS WITH WARNINGS — route split succeeded but runtime verification still needed**

## 1. Mục tiêu

Prompt 05C tiếp tục giảm kích thước `backend/src/api/dashboard.js` theo hướng route/controller đã bắt đầu ở Prompt 05 và 05B.

Mục tiêu cụ thể:

- Đọc lại docs/report bắt buộc và kết quả Prompt 05B.
- Chạy baseline validation trước khi sửa.
- Cập nhật route map cho `backend/src/api/dashboard.js`.
- Chọn một route nhỏ, read-only, không raw SQL, không upload, không external side effect.
- Tạo controller/routes boundary cho domain nhỏ.
- Giữ nguyên public route, method, auth middleware, tenant scope, Prisma query, status code và response shape.
- Không sửa webhook, tenant handoff, RAG, bot engine, Prisma schema/migrations, dashboard frontend hoặc DevOps scripts.
- Chạy validation sau thay đổi.

## 2. File/report đã đọc

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/REFACTOR_PLAN.md`
- `docs/ENV_POLICY.md`
- `report/PROMPT_05B_BACKEND_API_ROUTE_CONTROLLER_SPLIT_REPORT.md`
- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`

Không đọc `.env` thật. File tham khảo `project-structure-audit.md` không tồn tại trong workspace.

## 3. Preflight result

| Hạng mục | Kết quả |
|---|---|
| `git status --short --branch` | PASS, working tree sạch trước Prompt 05C |
| `git log --oneline -12` | HEAD là `29a97a6 Split next dashboard API route group` |
| Commit Prompt 05B | `29a97a6c3950dc73219bcf91b74b373614ff4d28` tồn tại |
| Working tree trước khi sửa | Sạch, không có runtime source change không rõ nguồn |
| Guardrail | Không chạy migration, db push, Docker, start script hoặc đọc `.env` thật |

## 4. Baseline validation trước thay đổi

| Command | Result | Notes |
|---|---|---|
| `node --check src/index.js` | PASS | Không chạy app server |
| `node --check src/db.js` | PASS | Prisma singleton hợp lệ |
| `node --check src/api/dashboard.js` | PASS | Dashboard API baseline hợp lệ |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS | Settings controller hợp lệ |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS | Settings route module hợp lệ |
| `node --check src/infrastructure/services/config.js` | PASS | Config helper hợp lệ |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Prisma wrapper hợp lệ |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Không migrate, không db push, không connect DB thật |

## 5. Route map update

Route scan trước khi tách:

- `backend/src/api/dashboard.js`: 2.422 dòng.
- `backend/src/api/dashboard.js`: 99 route trực tiếp.
- `settings.routes.js`: 2 route đã tách từ Prompt 05/05B.

Candidate đã đánh giá:

| Candidate | Risk | Lý do chọn/không chọn |
|---|---|---|
| `GET /settings/handoff` | Medium | Không chọn vì route read nhưng có thể create singleton nếu thiếu, tức có write DB. |
| `GET /settings/chatwoot-test` | High | Không chọn vì gọi external Chatwoot API. |
| `GET /settings/facebook-menu` | High | Không chọn vì liên quan Facebook menu/external state. |
| `GET /prompts` | Low | Chọn vì read-only, chỉ dùng `getTenantScope(req)` và `prisma.promptTemplate.findMany`, không raw SQL/upload/external side effect. |
| `GET /quick-reply-menus` | Low/Medium | Không chọn ở Prompt 05C vì có thể làm sau; cũng read-only nhưng liên quan menu Facebook hơn. |
| `GET /appointments` | Medium | Không chọn vì business-critical và có pagination/status flow cần smoke test riêng. |
| `GET /staff` | Medium | Không chọn vì staff liên quan handoff vận hành. |
| `GET /providers` | Medium | Không chọn vì liên quan provider/API key masking, nên cần review riêng. |
| `GET /campaigns` | Medium | Không chọn vì campaign legacy/upload cùng domain. |
| `GET /content-packages` | Medium | Không chọn vì domain có migrate/write flow kế bên. |
| `GET /facebook-pages` | Medium | Không chọn vì liên quan page token/masking và Facebook integration. |
| `GET /channel-configs` | High | Không chọn vì tenant/channel config nhạy cảm. |
| `GET /tenants*` | High | Không chọn vì tenant core. |
| `GET /analytics` | High | Không chọn vì có `$queryRawUnsafe`. |
| Handoff routes | High | Không chọn theo guardrail Prompt 05C. |
| Knowledge upload/reindex/scrape | High | Không chọn vì upload/raw SQL/RAG/external cost. |

## 6. Route group selected

Route được tách: `GET /prompts`.

Public URL khi mount dưới `/api` vẫn là:

- `/api/prompts`

Lý do chọn:

- Route `GET`, read-only.
- Không raw SQL.
- Không upload.
- Không gọi external API.
- Không write DB.
- Query Prisma ngắn, response rõ: trả mảng `promptTemplate`.
- Có tenant scope sẵn qua `getTenantScope(req)` và được truyền nguyên vẹn vào controller.
- Domain `prompts` có thể tạo boundary riêng mà không đụng settings, webhook, handoff, RAG hoặc bot engine.

Vì sao không chọn nhóm khác:

- Settings còn lại có write hoặc external side effect.
- Knowledge/analytics/tenants/channel-configs/handoff là nhóm rủi ro cao.
- Staff/appointments/provider có business/integration sensitivity cao hơn `GET /prompts`.
- Các route write/delete không phù hợp khi chưa có runtime smoke test.

## 7. Files created

| File | Mục đích |
|---|---|
| `backend/src/presentation/http/controllers/dashboard/prompts.controller.js` | Controller factory cho `GET /prompts`, giữ nguyên query/response/error behavior cũ. |
| `backend/src/presentation/http/routes/dashboard/prompts.routes.js` | Route factory CommonJS cho domain prompts, nhận `authMiddleware`, `getTenantScope`, `prisma`. |
| `report/PROMPT_05C_BACKEND_API_ROUTE_CONTROLLER_SPLIT_REPORT.md` | Report Prompt 05C. |

## 8. Files changed

| File | Thay đổi |
|---|---|
| `backend/src/api/dashboard.js` | Import `createPromptRoutes`, thay block `router.get('/prompts', ...)` bằng `router.use('/prompts', createPromptRoutes({ authMiddleware, getTenantScope, prisma }))`. |
| `docs/PROJECT_PROGRESS.md` | Cập nhật trạng thái Prompt 05C và next step Prompt 05R. |
| `docs/FEATURE_AUDIT_CHECKLIST.md` | Thêm checklist Prompt 05C. |
| `docs/REFACTOR_PLAN.md` | Ghi Prompt 05C đã hoàn thành phase 3 và khuyến nghị Prompt 05R. |

## 9. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Public route có đổi không | Không. Vẫn là `/api/prompts`. |
| Method có đổi không | Không. Vẫn là `GET`. |
| Auth middleware có đổi không | Không. Vẫn dùng `authMiddleware`. |
| Status code có đổi không | Không có chủ đích đổi. Success vẫn `200`, lỗi vẫn `500`. |
| Response shape có đổi không | Không. Vẫn trả trực tiếp mảng templates qua `res.json(templates)`. |
| DB query có đổi không | Không. Vẫn dùng `prisma.promptTemplate.findMany({ where, orderBy: [{ layer: 'asc' }, { intentType: 'asc' }] })`. |
| Tenant scope có đổi không | Không. Vẫn dùng `getTenantScope(req)` với cùng `tenantScope` query behavior. |
| External side effect có đổi không | Không có external call trong route này. |
| Prisma schema có đổi không | Không. |
| Webhook/tenant/RAG có bị đụng không | Không. |
| Bot engine/tools có bị đụng không | Không. |
| Dashboard frontend có bị đụng không | Không. |
| Route order có an toàn không | Có. Mount `/prompts` nằm đúng vị trí route cũ và trước `GET /prompts/:id`; route module chỉ match `GET /`, các route còn lại tiếp tục rơi xuống handler cũ. |

## 10. Validation after changes

| Command | Result | Notes | Action needed |
|---|---|---|---|
| `node --check src/index.js` | PASS | Backend entrypoint hợp lệ | Không |
| `node --check src/db.js` | PASS | Prisma singleton hợp lệ | Không |
| `node --check src/api/dashboard.js` | PASS | Import/mount prompts route hợp lệ | Không |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS | Settings controller vẫn hợp lệ | Không |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS | Settings route vẫn hợp lệ | Không |
| `node --check src/presentation/http/controllers/dashboard/prompts.controller.js` | PASS | Controller mới hợp lệ | Không |
| `node --check src/presentation/http/routes/dashboard/prompts.routes.js` | PASS | Route module mới hợp lệ | Không |
| `node --check src/infrastructure/services/config.js` | PASS | Config helper hợp lệ | Không |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Prisma wrapper hợp lệ | Không |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Không migrate, không db push | Không |
| `rg "router\\.(get|post|put|delete|patch)" src/api/dashboard.js src/presentation/http` | PASS | Route `GET /prompts` nằm trong `prompts.routes.js` | Không |
| `git diff --name-status` | PASS | Đúng phạm vi backend route/controller + docs/report | Không |
| `git diff --check` | PASS | Không có whitespace error | Không |

Thống kê sau thay đổi:

- `backend/src/api/dashboard.js`: 2.408 dòng.
- `backend/src/api/dashboard.js`: 98 route trực tiếp.
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`: 2 route.
- `backend/src/presentation/http/routes/dashboard/prompts.routes.js`: 1 route.

Dashboard build/typecheck không chạy vì Prompt 05C không sửa dashboard frontend.

## 11. Structure quality notes

- Tài liệu hiện tại đã được cập nhật để khớp code sau Prompt 05C.
- Không có `project-structure-audit.md` trong workspace; không copy nội dung từ dự án khác.
- Có thêm 2 file source mới và cả hai đều có route/controller thực đang được mount, không phải skeleton rỗng.
- Boundary controller/routes rõ hơn: `settings` giữ settings read-only đã tách, `prompts` bắt đầu có boundary riêng cho route list.
- Không tạo code thừa: mỗi export mới đều được import và dùng từ `dashboard.js`.
- Backlog structure nên có Prompt 05R để runtime smoke test trước khi tiếp tục tách thêm hoặc sang repository layer.

## 12. Remaining risks

| Rủi ro | Trạng thái |
|---|---|
| `backend/src/api/dashboard.js` vẫn lớn | Còn 2.408 dòng và 98 route trực tiếp. |
| `$queryRawUnsafe` | Vẫn còn trong dashboard API/RAG/tenant paths, chưa xử lý trong Prompt 05C. |
| Tenant scope | Chưa runtime verified. |
| Runtime verification | Chưa chạy app/API thật. |
| Backend lint/typecheck | Vẫn chưa có script lint/typecheck thật. |
| DevOps script risk | `start-all.bat`, Dockerfile migration policy và stale webhook URL file chưa xử lý. |
| Default credential/fallback | Vẫn mở, cần prompt riêng sau env policy. |
| npm audit vulnerabilities | Vẫn mở, không xử lý trong Prompt 05C. |

## 13. Final verdict

**PASS WITH WARNINGS — route split succeeded but runtime verification still needed**

Lý do:

- `GET /prompts` đã được tách thành controller/routes đúng architecture shell.
- Public route/method/auth/tenant scope/query/response không đổi.
- Backend static validation và Prisma validate pass.
- Không sửa schema/migrations/webhook/tenant handoff/RAG/bot engine/dashboard frontend.
- Chưa runtime verified vì không chạy app server hoặc gọi API thật.

## 14. Next Step & Goal

Đề xuất tiếp theo: **Prompt 05R — Runtime smoke test các route dashboard API đã tách**.

Mục tiêu Prompt 05R:

- Chạy backend trong điều kiện kiểm soát bằng env an toàn, không đọc/in `.env` thật.
- Tạo hoặc dùng token test theo cách không làm lộ secret.
- Gọi và xác minh 3 route đã tách:
  - `GET /api/settings/webhook`
  - `GET /api/settings/telegram-destinations`
  - `GET /api/prompts`
- Xác nhận status code, auth behavior và response shape runtime.
- Không chạy migration/db push/Docker/start-all.

Sau Prompt 05R, nếu smoke test pass có thể chọn Prompt 05D để tách thêm read-only route hoặc Prompt 06 để bắt đầu repository layer cho nhóm đã có controller boundary.
