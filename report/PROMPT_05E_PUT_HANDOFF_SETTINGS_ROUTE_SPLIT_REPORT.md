# PROMPT 05E — PUT HANDOFF SETTINGS ROUTE SPLIT REPORT

Ngày thực hiện: 2026-07-08

## 1. Mục tiêu

Tách `PUT /settings/handoff` khỏi `backend/src/api/dashboard.js` sang settings controller/routes, giữ nguyên public API contract và runtime verify lại nhóm route nhỏ:

- `GET /api/settings/webhook`
- `GET /api/settings/telegram-destinations`
- `GET /api/prompts`
- `GET /api/settings/handoff`
- `PUT /api/settings/handoff`

Không sửa schema/migrations, webhook, tenant handoff, RAG, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.

## 2. File/report đã đọc

- `report/PROMPT_05D_FIX_HANDOFF_SETTINGS_ACCESSOR_REPORT.md`
- `report/PROMPT_05D_SETTINGS_ROUTE_SPLIT_RUNTIME_REPORT.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/LOCAL_RUN_GUIDE.md`
- `backend/prisma/schema.prisma`
- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
- `backend/src/presentation/http/controllers/dashboard/prompts.controller.js`
- `backend/src/presentation/http/routes/dashboard/prompts.routes.js`

Không mở/in `.env` thật. Token local/test được lấy qua login endpoint và không in credential/token.

## 3. Git preflight

| Kiểm tra | Kết quả |
|---|---|
| Branch hiện tại | `chore/prompt-05r-docs-local-run` |
| Không ở `master/main` | PASS |
| Working tree trước khi sửa | Clean |
| Commit Prompt 05D-FIX `6a427d9` tồn tại | PASS |
| Remote | Không có remote configured |
| Guardrail | Không dùng `git add .`, không push remote, không switch branch |

## 4. Baseline validation

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

## 5. Route map handoff settings

Kết quả scan trước khi sửa:

| Route/scan | Vị trí trước 05E | Ghi chú |
|---|---|---|
| `GET /settings/handoff` | `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Đã tách từ Prompt 05D. |
| `PUT /settings/handoff` | `backend/src/api/dashboard.js` | Chọn để tách trong Prompt 05E. |
| `handoffSettings` sai accessor | Không còn trong `backend/src` | Đã sửa ở Prompt 05D-FIX. |
| `botGracePeriodSeconds` trong Prisma payload `HandoffSetting` | Không còn trong settings GET/PUT payload | Đã bỏ ở Prompt 05D-FIX vì schema không có field này. |
| `botGracePeriodSeconds` trong `telegram/handoff.js` | Còn fallback in-memory | Không sửa vì ngoài scope và prompt cấm sửa bot/tenant handoff. |

Các route handoff khác còn trong `dashboard.js` như `/handoff/active`, `/handoff/staff-status`, `/handoff/bot-queue` là route trạng thái handoff, không phải `/settings/handoff`, nên không thuộc Prompt 05E.

## 6. Route selected

Route chọn: **`PUT /settings/handoff`**.

Lý do chọn:

- Đây là cặp write trực tiếp của `GET /settings/handoff`, đã được runtime verified ở Prompt 05D-FIX.
- Không gọi external API.
- Không raw SQL.
- Không tenant handoff file.
- Prisma upsert behavior nhỏ và đã rõ: singleton `HandoffSetting`.
- Có thể move sang settings controller/routes mà không đổi public contract.

Vì sao chưa chọn settings route external/write khác:

| Route còn lại trong `dashboard.js` | Lý do chưa tách |
|---|---|
| `POST /settings/telegram-destinations` | Write route, cần test regression riêng. |
| `PUT /settings/telegram-destinations/:id` | Write route, cần test regression riêng. |
| `DELETE /settings/telegram-destinations/:id` | Delete route, cần test regression riêng. |
| `POST /settings/telegram-destinations/:id/test` | Gọi external Telegram, cần mock/cô lập. |
| `GET /settings/chatwoot-test` | Gọi external Chatwoot, cần mock/cô lập. |
| `GET /settings/facebook-menu` | Liên quan Facebook menu/external state, cần test riêng. |
| `POST /settings/facebook-menu` | External + write side effect, không tách khi chưa có test cô lập. |

## 7. Files changed

| File | Thay đổi |
|---|---|
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | Thêm `createPutHandoffSettings({ prisma })`, move logic upsert từ `dashboard.js`. |
| `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Thêm `router.put('/handoff', authMiddleware, createPutHandoffSettings({ prisma }))`. |
| `backend/src/api/dashboard.js` | Gỡ block direct `router.put('/settings/handoff', ...)`, giữ comment ngắn trỏ route đã tách. |
| `docs/PROJECT_PROGRESS.md` | Cập nhật trạng thái Prompt 05E, validation, risk, next step. |
| `docs/FEATURE_AUDIT_CHECKLIST.md` | Thêm bảng Prompt 05E. |
| `docs/REFACTOR_PLAN.md` | Thêm kế hoạch/định hướng sau Prompt 05E. |
| `report/PROMPT_05E_PUT_HANDOFF_SETTINGS_ROUTE_SPLIT_REPORT.md` | Report prompt này. |

`dashboard.js`: 2395 dòng trước 05E → **2382 dòng** sau 05E. Route direct còn khoảng **96**.

## 8. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Public route có đổi không | Không. Vẫn `/api/settings/handoff`. |
| Method có đổi không | Không. Vẫn `PUT`. |
| Auth middleware có đổi không | Không. Vẫn `authMiddleware`. |
| Status code có đổi không | Không. Thành công vẫn 200, lỗi vẫn 500. |
| Response shape có đổi không | Không. Vẫn `res.json(settings)` object `HandoffSetting`. |
| Prisma query behavior có đổi không | Không. Vẫn `prisma.handoffSetting.upsert` singleton `id: 'singleton'`. |
| Error handling có đổi không | Không. Vẫn `{ error: 'Failed to update handoff settings' }` khi lỗi. |
| Schema/migrations có đổi không | Không. |
| External API call có thêm không | Không. |
| Dashboard frontend có đổi không | Không. |

## 9. Static validation

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
| `git diff --check` | PASS, chỉ có cảnh báo CRLF của Git |

## 10. Runtime smoke result

Môi trường:

- DB: container local/test `bbotech-pgvector-local`, port 5433, đang chạy.
- Backend: `npm run dev`, port 3001.
- Auth token: lấy qua `POST /api/auth/login` với credential local/test từ env; không in credential/token.
- Sau test: đã dừng backend process do prompt khởi động; giữ DB container/volume/env local.

| Route | Auth behavior | Status | Response shape | External API call | Write DB | Server crash | Result |
|---|---|---:|---|---|---|---|---|
| `GET /api/settings/handoff` | Không token | 401 | `{error}` | Không | Không | Không | PASS |
| `PUT /api/settings/handoff` | Không token | 401 | `{error}` | Không | Không | Không | PASS |
| `GET /api/settings/webhook` | Token hợp lệ | 200 | `{appSecret,pageAccessToken,verifyToken,webhookUrl}` | Không | Không | Không | PASS |
| `GET /api/settings/telegram-destinations` | Token hợp lệ | 200 | `{destinations,envFallback}` | Không | Không | Không | PASS |
| `GET /api/prompts` | Token hợp lệ | 200 | Array, length 7 | Không | Không | Không | PASS |
| `GET /api/settings/handoff` | Token hợp lệ | 200 | `{id,offHoursPendingTimeout,pendingTimeoutSeconds,sessionTimeoutSeconds,updatedAt,workHoursEnd,workHoursStart}` | Không | Không | Không | PASS |
| `PUT /api/settings/handoff` | Token hợp lệ | 200 | Cùng object settings | Không | Có, upsert current-equivalent payload | Không | PASS |
| `GET /api/settings/handoff` sau PUT | Token hợp lệ | 200 | Cùng object settings | Không | Không | Không | PASS |

PUT payload chỉ gồm field schema hợp lệ: `pendingTimeoutSeconds`, `sessionTimeoutSeconds`, `offHoursPendingTimeout`, `workHoursStart`, `workHoursEnd`. Không gửi `id`, `updatedAt`, `botGracePeriodSeconds`.

## 11. Source runtime scope

Chỉ sửa route/controller settings handoff:

- Move `PUT /settings/handoff` từ `dashboard.js` sang `settings.controller.js`.
- Mount PUT route trong `settings.routes.js`.
- Không đổi route khác.

Không sửa:

- Prisma schema/migrations.
- Webhook handlers.
- Tenant handoff.
- RAG pipeline.
- Bot engine/tools.
- Dashboard frontend.
- DevOps scripts.
- Package/dependency.
- Env files thật.

## 12. Remaining risks

- `backend/src/api/dashboard.js` vẫn lớn: 2382 dòng, khoảng 96 route direct.
- Settings external/write còn lại chưa tách và cần test cô lập: Telegram destination write/test, Chatwoot test, Facebook menu.
- Tenant scope sâu chưa runtime verified toàn diện.
- `$queryRawUnsafe` vẫn cần audit riêng.
- DevOps scripts vẫn có rủi ro migration/db push/start-all và cần hardening riêng.
- npm audit vulnerabilities vẫn chưa xử lý trong prompt này.
- `backend/src/telegram/handoff.js` còn fallback in-memory `botGracePeriodSeconds`, nhưng không sửa vì ngoài scope.

## 13. Final verdict

**PASS — route split and runtime verified.**

Điều kiện pass đã đạt:

- Static validation PASS.
- Runtime smoke PASS.
- Public route/method/auth/response shape giữ nguyên.
- Không sửa file ngoài phạm vi.
- Backend process do prompt khởi động đã dừng.

## 14. Next Step & Goal

Đề xuất tiếp theo:

- **Prompt 06**: tạo repository layer cho `settings`/`prompts`, đưa Prisma access ra khỏi controller/API mà không đổi public API contract.
- **Prompt 05F** nếu muốn xử lý tiếp Settings route còn lại: tạo test cô lập cho external/write route, không gọi Telegram/Chatwoot/Facebook thật.

Mục tiêu tiếp theo là giảm dần phụ thuộc Prisma trực tiếp trong `dashboard.js`/controller, nhưng vẫn giữ runtime baseline và không mở rộng blast radius.
