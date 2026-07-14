# PROMPT 05 — BACKEND API ROUTE/CONTROLLER SPLIT REPORT

Ngày thực hiện: 2026-07-08
Phạm vi: tách route/controller backend phase 1 cho một nhóm route nhỏ trong `backend/src/api/dashboard.js`.
Kết luận: **PASS WITH WARNINGS — route split succeeded but runtime verification still needed**

## 1. Mục tiêu

Prompt 05 là bước đầu tiên tách `backend/src/api/dashboard.js` theo route/controller trong architecture shell đã tạo ở Prompt 03.

Mục tiêu cụ thể:

- Lập route map hiện tại của `backend/src/api/dashboard.js`.
- Chọn một nhóm route nhỏ, ít rủi ro.
- Tạo route/controller wrapper trong `backend/src/presentation/http`.
- Giữ nguyên public route, method, auth middleware và response shape.
- Không đổi behavior có chủ đích.
- Không đụng webhook, tenant handoff, RAG, Prisma schema/migrations hoặc dashboard frontend.
- Chạy validation sau thay đổi.

## 2. File/report đã đọc

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/policies/ENV_POLICY.md`
- `report/archive/early-prompts/PROMPT_04A_PROJECT_PROGRESS_REWRITE_REPORT.md`
- `report/archive/early-prompts/PROMPT_04_CONFIG_HARDENING_LOCALHOST_ENV_POLICY_REPORT.md`
- `report/archive/early-prompts/PROMPT_03_ARCHITECTURE_SHELL_REFACTOR_REPORT.md`
- `backend/src/api/dashboard.js`

Không đọc `.env` thật.

## 3. Preflight result

| Hạng mục | Kết quả |
|---|---|
| `git status --short --branch` | PASS, working tree sạch trước Prompt 05 |
| `git log --oneline -8` | Có commit Prompt 04A mới nhất |
| Commit Prompt 04A | `cea82b1993abf46a7f732991c24e7d532dd2f347` tồn tại |
| Working tree trước khi sửa | Sạch, không có source runtime change không rõ nguồn |

## 4. Baseline validation trước thay đổi

| Command | Result | Notes |
|---|---|---|
| `node --check src/index.js` | PASS | Không chạy app server |
| `node --check src/db.js` | PASS | Prisma singleton hợp lệ |
| `node --check src/api/dashboard.js` | PASS | File dashboard API baseline hợp lệ |
| `node --check src/infrastructure/services/config.js` | PASS | Config helper hợp lệ |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Prisma wrapper hợp lệ |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Không migrate, không db push, không connect DB thật |

## 5. Route map summary

Route scan trước khi tách cho thấy `backend/src/api/dashboard.js` có khoảng 101 route trực tiếp. Sau Prompt 05, còn khoảng 100 route trực tiếp trong file này và 1 route đã chuyển sang module mới.

| Nhóm route | Số route | Middleware/auth | DB read/write | Raw SQL | Tenant scope | Rủi ro |
|---|---:|---|---|---|---|---|
| `auth` | 2 | `none`, `authMiddleware` | Read `adminUser` | Không | User tenant in token | Medium |
| `admin-users` | 3 | `authMiddleware`, `platformAdminOnly` | Read/write admin users | Không | Platform only | Medium |
| `stats` | 1 | `authMiddleware` | Read nhiều bảng | Không | Chưa scoped | Medium |
| `conversations` | 3 | `authMiddleware` | Read conversation/message | Không | Chưa rõ | Medium |
| `knowledge` | 8 | `authMiddleware`, upload/platform admin ở một số route | Read/write knowledge, upload, reindex | Có | Có tenant scope | High |
| `prompts` | 5 | `authMiddleware` | Read/write prompt | Không | Có tenant scope | Medium |
| `providers` | 5 | `authMiddleware`, platform admin ở một số route | Read/write provider, test external LLM | Không | Global | Medium |
| `quick-reply-menus` | 5 | `authMiddleware` | Read/write quick reply | Không | Có tenant scope | Medium |
| `campaigns` | 6 | `authMiddleware`, upload | Read/write campaign/upload | Không | Chưa scoped | Medium |
| `content-packages` | 10 | `authMiddleware` | Read/write package/items/migrate | Không | Có tenant scope | Medium/High |
| `appointments` | 2 | `authMiddleware` | Read/write appointment | Không | Có tenant scope | Medium |
| `staff` | 4 | `authMiddleware` | Read/write legacy staff | Không | Legacy/global | Medium |
| `settings` | 11 trước tách | `authMiddleware` | Mixed: handoff/telegram DB, webhook no DB | Không | Mixed | Low/Medium |
| `handoff` | 5 | `authMiddleware` | Read/write conversation/staff | Không | Handoff-sensitive | High |
| `facebook-pages` | 5 | `authMiddleware` | Read/write Facebook page | Không | Page-sensitive | Medium |
| `test-message` | 1 | `authMiddleware` | External/send side effect | Không | Không rõ | High |
| `fb-subscription` | 1 | `authMiddleware` | External Facebook call | Không | Không rõ | Medium |
| `analytics` | 1 | `authMiddleware` | Read analytics | Có | Chưa rõ | High |
| `channel-configs` | 6 | `authMiddleware` | Read/write global/tenant channel config | Không | Có tenant scope | High |
| `tenants` | 17 | `authMiddleware`, platform admin ở một số route | Read/write tenant/staff/channel/knowledge | Có qua RAG path | Tenant core | High |

Route được tách chi tiết:

| Method | Path cũ | Path mới sau mount | Middleware | DB read/write | Raw SQL | Tenant scope | Risk |
|---|---|---|---|---|---|---|---|
| GET | `/settings/webhook` | `/settings/webhook` | `authMiddleware` | Không | Không | Không | Low |

Public URL khi mount dưới `/api` vẫn là `/api/settings/webhook`.

## 6. Route group selected

Nhóm đã chọn: `settings/webhook`.

Lý do chọn:

- Chỉ có một route.
- Route read-only.
- Không gọi Prisma.
- Không có raw SQL.
- Không có tenant scope phức tạp.
- Không gọi external API.
- Response shape rõ và nhỏ.
- Auth middleware đơn giản: vẫn dùng `authMiddleware` hiện có.

Vì sao không chọn nhóm khác:

- `analytics`, `knowledge`, `tenants`, `handoff` có raw SQL, tenant scope hoặc behavior nhạy cảm.
- `channel-configs` liên quan tenant/global config và invalidate cache.
- `providers` có route test external LLM.
- `facebook-pages`, `fb-subscription`, `test-message` có integration side effect.
- `stats` tuy read-only nhưng đọc nhiều bảng và chưa tenant-scoped rõ.
- `auth` liên quan login/JWT, nên không chọn làm bước đầu tiên.

## 7. Files created

| File | Mục đích |
|---|---|
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | Controller cho `GET /settings/webhook`, giữ nguyên response JSON cũ. |
| `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Route factory CommonJS, nhận `authMiddleware` từ `dashboard.js`. |
| `report/archive/early-prompts/PROMPT_05_BACKEND_API_ROUTE_CONTROLLER_SPLIT_REPORT.md` | Report Prompt 05. |

## 8. Files changed

| File | Thay đổi |
|---|---|
| `backend/src/api/dashboard.js` | Import `createSettingsRoutes`, thay block `router.get('/settings/webhook', ...)` bằng `router.use('/settings', createSettingsRoutes({ authMiddleware }))`. |
| `docs/status/PROJECT_PROGRESS.md` | Cập nhật trạng thái Prompt 05 và next step Prompt 05B. |
| `docs/status/FEATURE_AUDIT_CHECKLIST.md` | Thêm Prompt 05 update. |
| `docs/roadmap/REFACTOR_PLAN.md` | Ghi Prompt 05 phase 1 đã hoàn thành. |

## 9. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Public route có đổi không | Không. Vẫn là `/api/settings/webhook`. |
| Method có đổi không | Không. Vẫn là `GET`. |
| Auth middleware có đổi không | Không. Vẫn dùng `authMiddleware`. |
| Response shape có đổi không | Không. Controller giữ nguyên các field `verifyToken`, `pageAccessToken`, `appSecret`, `webhookUrl`. |
| Status code có đổi không | Không có chủ đích đổi. Route cũ trả `200` qua `res.json`, route mới cũng vậy. |
| DB query có đổi không | Không. Route này không dùng DB. |
| Prisma schema có đổi không | Không. |
| Migrations có đổi không | Không. |
| Webhook handlers có bị đụng không | Không. |
| Tenant handoff có bị đụng không | Không. |
| RAG có bị đụng không | Không. |
| Dashboard frontend có bị đụng không | Không. |

## 10. Validation after changes

| Command | Result | Notes | Action needed |
|---|---|---|---|
| `node --check src/index.js` | PASS | Backend entrypoint hợp lệ | Chạy lại nếu Prompt sau chạm startup |
| `node --check src/api/dashboard.js` | PASS | Import route module mới hợp lệ | Chạy lại sau mỗi route split |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS | Controller mới hợp lệ | Không |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS | Route module mới hợp lệ | Không |
| `node --check src/infrastructure/services/config.js` | PASS | Config helper vẫn hợp lệ | Không |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Prisma wrapper vẫn hợp lệ | Không |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Không migrate, không db push | Không |
| `rg "router\\.(get|post|put|delete|patch)" src/api/dashboard.js src/presentation/http` | PASS | Route mới xuất hiện trong `src/presentation/http` | Dùng làm route map cho Prompt 05B |

Dashboard build/typecheck không chạy vì Prompt 05 không sửa dashboard frontend.

## 11. Remaining risks

| Rủi ro | Trạng thái |
|---|---|
| `backend/src/api/dashboard.js` vẫn lớn | Còn khoảng 2.439 dòng và khoảng 100 route trực tiếp. |
| `$queryRawUnsafe` | Vẫn còn trong dashboard API/RAG/tenant paths, chưa xử lý trong Prompt 05. |
| Tenant scope | Chưa runtime verified. |
| Runtime verification | Chưa chạy app/API thật. |
| Backend lint/typecheck | Vẫn chưa có script lint/typecheck thật. |
| Dashboard lint | Vẫn chưa cấu hình không tương tác. |
| DevOps script risk | `start-all.bat`, Dockerfile migration policy và stale webhook URL file chưa xử lý. |
| Default credential/fallback | Vẫn mở, cần prompt riêng sau env policy. |

## 12. Final verdict

**PASS WITH WARNINGS — route split succeeded but runtime verification still needed**

Lý do:

- Route group đầu tiên đã được tách thành controller/routes đúng architecture shell.
- Public route/method/auth/response không đổi.
- Validation backend pass.
- Không sửa schema/migrations/webhook/tenant/RAG/dashboard.
- Chưa runtime verified vì không chạy app server hoặc gọi API thật.

## 13. Next Step & Goal

Đề xuất tiếp theo: **Prompt 05B — Backend API route/controller split next group**.

Mục tiêu Prompt 05B:

- Tiếp tục tách một nhóm route nhỏ, ít rủi ro khỏi `backend/src/api/dashboard.js`.
- Ưu tiên route read-only không raw SQL, không upload, không handoff, không RAG, không tenant write phức tạp.
- Giữ nguyên public route/response contract.
- Chạy cùng bộ validation backend.

Nếu muốn chuyển sang Prompt 06 repository layer, nên cân nhắc sau khi đã tách thêm vài nhóm route nhỏ để giảm kích thước `dashboard.js` và rõ boundary controller hơn.
