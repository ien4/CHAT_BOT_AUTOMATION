# PROMPT 07 — TENANT SAFETY AUDIT + LOCAL DB PREFLIGHT REPORT

Ngày thực hiện: 2026-07-09
Kết luận: **NEEDS FIX**
Phạm vi: audit tenant scope, local DB preflight, static validation, runtime smoke default/local. Không sửa source runtime.

## 1. Tóm tắt điều hành

Prompt 07 đã hoàn tất audit và xác nhận backend local có thể chạy smoke test trên DB pgvector local. Lỗi P1001 trước đó không còn tái hiện ở preflight vì container `bbotech-pgvector-local` đang chạy ở port `5433`.

Tuy nhiên audit phát hiện các khoảng trống authorization tenant ở `backend/src/api/dashboard.js`, đặc biệt cụm route nested `/api/tenants/:id/*` chỉ có `authMiddleware` nhưng lại đọc/ghi/xóa theo `req.params.id`. Đây là rủi ro cross-tenant rõ ràng nếu tenant admin gọi API trực tiếp với tenant id khác. Vì phạm vi sửa trải rộng nhiều route và cần regression test riêng, Prompt 07 không vá source trong phase này.

Verdict: **NEEDS FIX — cần Prompt 07A tenant authorization hardening trước Prompt 06D/08/09.**

## 2. Guardrail đã tuân thủ

- Không sửa Prisma schema/migrations.
- Không chạy `prisma db push`, không chạy migration mới, không dùng `--accept-data-loss`.
- Không chạy `start-all.bat`, không chạy `docker compose up`.
- Không đọc/in nội dung secret từ `.env`.
- Không sửa webhook logic, tenant handoff, RAG pipeline, bot engine, dashboard frontend, package hoặc DevOps scripts.
- Không sửa source runtime; chỉ cập nhật docs/report.
- Không stop backend process vì process đó đã chạy trước prompt.

## 3. Preflight Git và secret

| Hạng mục | Kết quả |
|---|---|
| Branch hiện tại | `chore/prompt-05r-docs-local-run` |
| Commit nền Prompt 06C | `5b3fae6 Add prompt templates repository layer` |
| Working tree trước docs edit | Sạch |
| Remote | Không có remote configured |
| `backend/.env` | Gitignored |
| `dashboard/.env.local` | Gitignored |
| Env tracked | Không phát hiện `.env`, `.env.local`, `.env.production`, `.env.development` tracked |

## 4. Local DB preflight

| Hạng mục | Kết quả |
|---|---|
| Container | `bbotech-pgvector-local` |
| Trạng thái | Running |
| Port | `0.0.0.0:5433->5432/tcp`, `:5433` listening |
| Log DB | PostgreSQL ready to accept connections |
| P1001 | Không còn blocking ở preflight vì DB local đang reachable |

Không cần chạy `docker start` vì container đã chạy sẵn. Không chạy migration hoặc `db push`.

## 5. Static validation

| Kiểm tra | Kết quả |
|---|---|
| `node --check backend/src/index.js` | PASS |
| `node --check backend/src/db.js` | PASS |
| `node --check backend/src/api/dashboard.js` | PASS |
| `node --check` settings/prompts controllers/routes/repositories | PASS |
| `node --check` tenant registry/webhook/handoff | PASS |
| `node --check` owner webhook/chatwoot handler | PASS |
| `node --check backend/src/rag/pipeline.js` | PASS |
| `node --check backend/src/bot/context.js` | PASS |
| Prisma validate local backend CLI | PASS |

Ghi chú toolchain:

- Lệnh đúng đã dùng: chạy Prisma CLI local `5.22.0` từ thư mục `backend`: `.\\node_modules\\.bin\\prisma.cmd validate --schema prisma/schema.prisma`.
- `npx prisma validate --schema backend/prisma/schema.prisma` từ root đã lấy Prisma CLI `7.8.0` và fail vì Prisma 7 không còn hỗ trợ `url = env("DATABASE_URL")` trong schema. Đây là lệch CLI/toolchain, không phải lỗi schema mới của Prompt 07.

## 6. Runtime smoke

Backend port `3001` đã có process chạy trước prompt. Prompt 07 dùng process hiện có và không dừng process này.

JWT local được ký trong memory từ admin user local + `JWT_SECRET` local. Không in token, credential hoặc secret.

| Smoke case | Kết quả |
|---|---|
| No-token `GET /api/prompts` | `401`, object `{error}` |
| Authorized `GET /api/prompts` | `200`, array len `7` |
| Authorized `GET /api/prompts?layer=intent` | `200`, array len `6` |
| Authorized `GET /api/settings/telegram-destinations` | `200`, object `{destinations, envFallback}` |
| Authorized `GET /api/settings/handoff` | `200`, settings object |
| Authorized `PUT /api/settings/handoff` với payload tương đương current settings | `200`, settings object |

Dữ liệu tenant local:

| Count | Giá trị |
|---|---:|
| `tenants` | `0` |
| `tenantPrompts` | `0` |
| `conversations` | `0` |
| `tenantConversations` | `0` |

Vì local DB không có tenant sample, Prompt 07 chỉ kết luận tenant isolation bằng audit tĩnh, chưa có runtime cross-tenant test.

## 7. Điểm tốt đã xác nhận

| Khu vực | Kết luận |
|---|---|
| `getTenantScope(req)` | Tenant admin bị lock vào `req.user.tenantId`; query `tenantScope` chỉ có tác dụng với platform admin. |
| `GET /api/prompts` list | Controller vẫn gọi `getTenantScope(req)` và repository dùng `tenantId: tenantId ?? null`; filter `layer` giữ nguyên. |
| Tenant registry | Resolve tenant bằng slug, reject inactive tenant, chỉ lấy active channel config/staff. |
| Tenant webhook | Conversation lookup/create có `tenantId`; message processing truyền `tenantId` vào bot/handoff. |
| Tenant handoff claim/takeover | Có transaction guard so sánh `conv.tenantId` và `staff.tenantId`. |
| RAG search | Search dùng tenant-specific + global fallback khi có tenant; default/global chỉ lấy `tenantId IS NULL`. |

## 8. Critical issues

### P0 — Nested `/api/tenants/:id/*` thiếu ownership/platform guard

File: `backend/src/api/dashboard.js`

Các route chính:

- `GET /tenants/:id/staff` khoảng line 2204
- `POST /tenants/:id/staff` khoảng line 2216
- `PUT /tenants/:id/staff/:sid` khoảng line 2232
- `DELETE /tenants/:id/staff/:sid` khoảng line 2249
- `GET /tenants/:id/channel-configs` khoảng line 2260
- `POST /tenants/:id/channel-configs` khoảng line 2272
- `DELETE /tenants/:id/channel-configs/:cid` khoảng line 2297
- `GET /tenants/:id/knowledge` khoảng line 2310
- `POST /tenants/:id/knowledge` khoảng line 2323
- `PUT /tenants/:id/knowledge/:kid` khoảng line 2334
- `DELETE /tenants/:id/knowledge/:kid` khoảng line 2347
- `GET /tenants/:id/webhook-info` khoảng line 2362

Vấn đề:

- Các route trên chỉ dùng `authMiddleware`.
- Không có `platformAdminOnly`.
- Không có guard `req.user.tenantId === req.params.id`.
- Handler dùng trực tiếp `req.params.id` để đọc/ghi/xóa dữ liệu tenant.

Tác động:

- Tenant admin có token hợp lệ có thể gọi API trực tiếp với tenant id khác nếu biết/đoán được id.
- Rủi ro đọc/sửa/xóa staff, channel config, knowledge và webhook-info của tenant khác.

Khuyến nghị:

- Prompt 07A phải thêm guard dùng chung trước khi xử lý route:

```js
function tenantPathAccessOnly(req, res, next) {
  if (!req.user?.tenantId) return next();
  if (req.user.tenantId !== req.params.id) {
    return res.status(403).json({ error: 'Không có quyền truy cập tenant này' });
  }
  return next();
}
```

- Áp guard này vào toàn bộ `/tenants/:id/*`.
- Với route chỉ dành cho platform admin, dùng `platformAdminOnly` thay vì cho tenant tự gọi.
- Với write/delete nested route, vẫn cần where guard theo `tenantId: req.params.id` như hiện tại, nhưng chưa đủ nếu path id không được authorize.

## 9. Medium/High issues

### P1 — Conversation routes chưa tenant-scoped

File: `backend/src/api/dashboard.js`

Route:

- `GET /conversations` khoảng line 210
- `GET /conversations/:id` khoảng line 243
- `GET /conversations/:id/messages` khoảng line 256

Vấn đề:

- Các route dùng `authMiddleware` nhưng chưa gọi `getTenantScope(req)`.
- Detail/messages dùng `id` trực tiếp, không guard `conversation.tenantId`.
- `Message` model không có `tenantId`, nên tenant isolation phải đi qua `Conversation.tenantId`.

Khuyến nghị Prompt 07A:

- List conversations filter theo `tenantId: getTenantScope(req) ?? null` cho tenant/global scope hiện tại.
- Detail/messages phải lookup conversation với `{ id, tenantId }` khi user có tenant scope.
- Platform admin nếu muốn xem tenant khác phải dùng `tenantScope` có kiểm soát.

### P1 — Detail routes của resource tenant còn thiếu guard

File: `backend/src/api/dashboard.js`

Route tiêu biểu:

- `GET /knowledge/:id` khoảng line 315
- `GET /prompts/:id` khoảng line 551
- `GET /quick-reply-menus/:id` khoảng line 766
- `GET /content-packages/:id` khoảng line 974
- `/content-packages/:packageId/items` khoảng line 1040 trở đi
- `PUT /appointments/:id` khoảng line 1205

Vấn đề:

- Một số list/write route đã có tenant scope hoặc guard sau khi fetch.
- Nhưng detail/read hoặc item route vẫn dùng id trực tiếp, có thể bypass list scope.

Khuyến nghị Prompt 07A:

- Tạo helper `assertResourceTenantAccess(model, id, tenantId)` hoặc repository-level helper nhỏ.
- Với tenant user, mọi detail/update/delete phải kiểm tra `resource.tenantId === req.user.tenantId`.
- Với platform admin, giữ quyền hiện hữu nhưng nên hỗ trợ `tenantScope` rõ ràng cho list/detail nếu UI cần.

### P1/P2 — Legacy/global routes cần khóa rõ quyền

File: `backend/src/api/dashboard.js`

Nhóm route:

- Legacy `/staff`
- Legacy `/handoff/*`
- `/analytics`
- `/facebook-pages`
- Owner/global `channelConfig` khi `tenantId` null

Vấn đề:

- Các route này hiện phần lớn chỉ có `authMiddleware`.
- Nếu đây là owner/platform-only surface, cần `platformAdminOnly`.
- Nếu tenant admin được dùng, cần tenant scope rõ.

Khuyến nghị:

- Prompt 07A phân loại route: `platform-only`, `tenant-scoped`, hoặc `legacy-owner`.
- Thêm guard trước khi tiếp tục tách route/controller.

### P2 — Owner Chatwoot webhook là global/legacy, cần route boundary rõ

File: `backend/src/webhook/chatwootHandler.js`

Vấn đề:

- Handler legacy lookup conversation bằng `chatwootConversationId` hoặc `fbUserId` không tenant scoped.
- Có truyền `tenantId: conversation.tenantId || null` về bot engine, nhưng route này không tự resolve tenant như `tenants/webhookHandler.js`.

Khuyến nghị:

- Nếu route này chỉ dành cho owner/global, document và khóa cấu hình để tenant traffic không đi vào đây.
- Tenant Chatwoot traffic nên đi qua `backend/src/tenants/webhookHandler.js`.

### P2 — RAG còn raw SQL unsafe và một số update/delete theo id

File: `backend/src/rag/pipeline.js`

Vấn đề:

- `search` tenant/global fallback khá ổn.
- `addDocument`/vector insert/update còn `$queryRawUnsafe`.
- `delete(id)` và `update(id, updates)` dùng id trực tiếp trong pipeline; caller phải tự guard tenant.

Khuyến nghị:

- Prompt 08 xử lý raw SQL bằng `Prisma.sql`/parameter binding.
- Sau Prompt 07A, đưa tenant ownership xuống repository/pipeline boundary nếu route caller vẫn có nguy cơ bypass.

## 10. Patch cụ thể đề xuất cho Prompt 07A

Không áp dụng trong Prompt 07. Đây là hướng triển khai cho prompt sau.

```js
function tenantPathAccessOnly(req, res, next) {
  if (!req.user?.tenantId) return next();
  if (req.user.tenantId !== req.params.id) {
    return res.status(403).json({ error: 'Không có quyền truy cập tenant này' });
  }
  return next();
}

function requireTenantScopedResource(getTenantId) {
  return async function tenantScopedResource(req, res, next) {
    const tenantId = getTenantScope(req);
    if (!tenantId) return next();
    const resourceTenantId = await getTenantId(req);
    if (resourceTenantId !== tenantId) {
      return res.status(404).json({ error: 'Not found' });
    }
    return next();
  };
}
```

Áp dụng tối thiểu:

- `/tenants/:id/*`: `authMiddleware, tenantPathAccessOnly`.
- `/conversations/:id` và `/conversations/:id/messages`: lookup conversation theo `id + tenantId`.
- Detail routes tenant resource: guard trước khi trả dữ liệu.
- Legacy global routes: thêm `platformAdminOnly` nếu không thiết kế cho tenant admin.

Smoke cần có sau patch:

- Token tenant A gọi `/tenants/:tenantB/staff` → 403.
- Token tenant A gọi `/tenants/:tenantA/staff` → 200 hoặc behavior hiện hữu.
- Token tenant A gọi conversation/detail resource tenant B → 404/403.
- Platform admin vẫn dùng được route quản trị tenant.
- Regression default/local hiện tại vẫn PASS.

## 11. Files đã thay đổi

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `report/PROMPT_07_TENANT_SAFETY_AUDIT_REPORT.md`

Không có source runtime changed.

## 12. Gợi ý tiếp theo

1. Chạy **Prompt 07A — Tenant authorization hardening**.
2. Sau khi Prompt 07A PASS, tạo tenant sample local tối thiểu để runtime verify cross-tenant.
3. Sau đó mới tiếp tục **Prompt 08 — RAG/raw SQL hardening**.
4. Prompt 06D chỉ nên làm sau khi route detail/write đã có ownership guard rõ.

## 13. Điểm cần tu sửa

- Bổ sung guard ownership/platform cho `/tenants/:id/*`.
- Tenant-scope conversation list/detail/messages.
- Tenant-scope detail route của knowledge/prompts/quick-reply/content-package/package-items/appointments.
- Phân loại và khóa quyền legacy/global routes.
- Hardening `$queryRawUnsafe` trong RAG ở Prompt 08.

## 14. Verdict

**NEEDS FIX**

Audit, DB preflight, static validation và runtime smoke default/local đã hoàn tất. Không có regression runtime ở route đã smoke. Nhưng P0/P1 tenant authorization gaps đủ nghiêm trọng để dừng các refactor tiếp theo cho tới khi có Prompt 07A.

Commit Prompt 07: `Audit tenant scope safety` (xem `git log -1` để lấy hash HEAD sau amend).
