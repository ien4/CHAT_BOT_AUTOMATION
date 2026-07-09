# PROMPT 07A — TENANT AUTHORIZATION HARDENING P0 REPORT

Ngày thực hiện: 2026-07-09
Kết luận: **PASS WITH FIXES**
Phạm vi: fix P0 authorization gap cho nhóm `/api/tenants/:id/*` trong `backend/src/api/dashboard.js`.

## 1. Tóm tắt

Prompt 07A đã xử lý P0 từ Prompt 07: tenant user không còn gọi được nested tenant route với `req.params.id` của tenant khác. Platform admin vẫn giữ quyền truy cập như trước.

Thay đổi source runtime duy nhất nằm trong `backend/src/api/dashboard.js`:

- Thêm `tenantPathAccessOnly(req, res, next)`.
- Gắn middleware này vào đúng 12 route nested `/tenants/:id/*`.
- Ràng buộc thêm `tenantId: req.params.id` cho `TenantStaff` update/delete và `TenantChannelConfig` delete để tránh bypass bằng child id không thuộc path tenant.

Không xử lý P1/P2 trong prompt này.

## 2. Guardrail

- Không sửa Prisma schema/migrations.
- Không chạy migration mới, không chạy `prisma db push`.
- Không chạy `start-all.bat`, không chạy `docker compose up`.
- Không mở/in nội dung `.env` hoặc `.env.local`.
- Không in JWT token, `JWT_SECRET`, `DATABASE_URL`, API key hoặc secret.
- Không sửa webhook, tenant handoff, RAG, bot engine, dashboard frontend, package hoặc DevOps scripts.
- Không thêm package mới.
- Không push remote.

## 3. Preflight

| Hạng mục | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Working tree trước sửa | Sạch, chỉ có ignored artifacts/env |
| Remote | Không có remote configured |
| Commit Prompt 07 | `5ec08c7e32c3173ac0fdc0c276fdf90d1835cef6` tồn tại |
| `backend/.env` | Gitignored |
| `dashboard/.env.local` | Gitignored |
| Env tracked/staged | Không có |

## 4. Route map P0 trước patch

| Method | Path | Middleware trước patch | Handler action | Current risk | Patch |
|---|---|---|---|---|---|
| GET | `/tenants/:id/staff` | `authMiddleware` | List staff theo `req.params.id` | Tenant khác đọc được staff nếu biết id | Thêm `tenantPathAccessOnly` |
| POST | `/tenants/:id/staff` | `authMiddleware` | Create staff theo `req.params.id` | Tenant khác tạo staff vào tenant khác | Thêm `tenantPathAccessOnly` |
| PUT | `/tenants/:id/staff/:sid` | `authMiddleware` | Update staff theo `sid` | Path tenant không được authorize; `sid` có thể không thuộc tenant path | Thêm `tenantPathAccessOnly` + update theo `id + tenantId` |
| DELETE | `/tenants/:id/staff/:sid` | `authMiddleware` | Delete staff theo `sid` | Path tenant không được authorize; `sid` có thể không thuộc tenant path | Thêm `tenantPathAccessOnly` + delete theo `id + tenantId` |
| GET | `/tenants/:id/channel-configs` | `authMiddleware` | List config theo `req.params.id` | Tenant khác đọc config | Thêm `tenantPathAccessOnly` |
| POST | `/tenants/:id/channel-configs` | `authMiddleware` | Create config theo `req.params.id` | Tenant khác tạo config | Thêm `tenantPathAccessOnly` |
| DELETE | `/tenants/:id/channel-configs/:cid` | `authMiddleware` | Delete config theo `cid` | Path tenant không được authorize; `cid` có thể không thuộc tenant path | Thêm `tenantPathAccessOnly` + delete theo `id + tenantId` |
| GET | `/tenants/:id/knowledge` | `authMiddleware` | List KB theo `req.params.id` | Tenant khác đọc KB | Thêm `tenantPathAccessOnly` |
| POST | `/tenants/:id/knowledge` | `authMiddleware` | Add KB theo `req.params.id` | Tenant khác tạo KB | Thêm `tenantPathAccessOnly` |
| PUT | `/tenants/:id/knowledge/:kid` | `authMiddleware` | Existing guard `id + tenantId`, rồi RAG update | Path tenant chưa authorize | Thêm `tenantPathAccessOnly` |
| DELETE | `/tenants/:id/knowledge/:kid` | `authMiddleware` | Existing guard `id + tenantId`, rồi RAG delete | Path tenant chưa authorize | Thêm `tenantPathAccessOnly` |
| GET | `/tenants/:id/webhook-info` | `authMiddleware` | Read tenant slug và build webhook info | Tenant khác đọc webhook URL/instructions | Thêm `tenantPathAccessOnly` |

Các route parent `/tenants`, `/tenants/:id`, `POST/PUT/DELETE /tenants/:id` đã có `platformAdminOnly` và không đổi.

## 5. Patch đã áp dụng

Middleware mới:

```js
function tenantPathAccessOnly(req, res, next) {
  if (!req.user?.tenantId) return next();

  if (req.user.tenantId !== req.params.id) {
    return res.status(403).json({ error: 'Không có quyền truy cập tenant này' });
  }

  return next();
}
```

Route wiring sau patch:

- 12 nested route P0 đều có `authMiddleware, tenantPathAccessOnly`.
- `TenantStaff.updateMany/deleteMany` dùng `where: { id, tenantId: req.params.id }`.
- `TenantChannelConfig.deleteMany` dùng `where: { id, tenantId: req.params.id }`.
- Khi child resource không thuộc tenant path, route trả `404 Not found`.

## 6. Validation

Baseline trước patch:

| Lệnh | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `node --check` settings/prompts controllers/routes/repositories | PASS |
| `npx prisma validate` từ `backend` | PASS |

Sau patch:

| Lệnh | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `node --check` settings/prompts controllers/routes/repositories | PASS |
| `npx prisma validate` từ `backend` | PASS |

Không chạy migration hoặc `db push`.

## 7. Runtime smoke

Smoke test dùng Express app tạm trong Node script, chỉ mount `dashboardApi` dưới `/api`. Không start `src/index.js`, nên không kích hoạt Telegram polling, Facebook menu setup, notification scheduler hoặc webhook startup side effect.

JWT local được ký trong memory bằng `JWT_SECRET` local. Không in token hoặc secret.

| Case | Kết quả |
|---|---|
| No-token `GET /api/tenants/:id/staff` | `401` |
| Tenant token gọi đúng tenant path `GET /api/tenants/:id/staff` | `200`, array rỗng |
| Tenant token gọi tenant khác `GET /api/tenants/:id/staff` | `403` |
| Tenant token gọi tenant khác `GET /api/tenants/:id/webhook-info` | `403` |
| Tenant token gọi tenant khác `PUT /api/tenants/:id/staff/:sid` | `403` trước handler/resource |
| Platform token gọi tenant path `GET /api/tenants/:id/staff` | `200`, array rỗng |
| Regression `GET /api/prompts` | `200`, array len `7` |
| Regression `GET /api/prompts?layer=intent` | `200`, array len `6` |
| Regression `GET /api/settings/telegram-destinations` | `200` |
| Regression `GET /api/settings/handoff` | `200` |
| Regression `PUT /api/settings/handoff` current-equivalent payload | `200` |

Local DB counts trong smoke:

| Count | Giá trị |
|---|---:|
| `tenants` | `0` |
| `tenantStaff` | `0` |
| `tenantChannelConfigs` | `0` |

Không tạo tenant fake trong DB. Denied test dùng synthetic tenant id trong JWT/path để kiểm middleware trước DB.

## 8. Files thay đổi

- `backend/src/api/dashboard.js`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`
- `report/PROMPT_07A_TENANT_AUTHORIZATION_HARDENING_REPORT.md`

## 9. Residual risk

P0 nested tenant path gap đã được xử lý. Các việc chưa xử lý và phải để prompt sau:

- **P1:** `/api/conversations`, `/api/conversations/:id`, `/api/conversations/:id/messages` chưa tenant-scoped.
- **P1:** detail routes như `/api/knowledge/:id`, `/api/prompts/:id`, `/api/quick-reply-menus/:id`, `/api/content-packages/:id`, package items, appointments còn cần ownership guard.
- **P1/P2:** legacy global routes như staff/handoff/analytics/facebook cần phân loại platform-only hoặc tenant-scoped.
- **P2:** RAG raw SQL và update/delete boundary để Prompt 08 xử lý.

## 10. Gợi ý tiếp theo

1. Chạy **Prompt 07B — Tenant authorization hardening P1**.
2. Sau Prompt 07B, nếu route ownership đã rõ, chạy **Prompt 08 — RAG/raw SQL hardening**.
3. Chỉ mở rộng route/controller split sau khi P1 detail/message routes đã có guard.

## 11. Verdict

**PASS WITH FIXES**

P0 `/api/tenants/:id/*` đã có tenant path guard và runtime denied smoke PASS. Không có regression trên prompts/settings/handoff smoke.

Commit Prompt 07A: `Harden tenant path authorization` (xem `git log -1` để lấy hash HEAD).
