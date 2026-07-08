# PROMPT 05D-FIX — HANDOFF SETTINGS ACCESSOR FIX REPORT

Ngày thực hiện: 2026-07-08

## 1. Mục tiêu

Sửa lỗi pre-existing trong handoff settings:

- Đổi accessor Prisma sai `prisma.handoffSettings` sang `prisma.handoffSetting`.
- Giữ nguyên public route/method/auth/response shape, ngoại trừ behavior fix có chủ đích: route từ 500 thành 200 đúng contract.
- Runtime verify `GET /api/settings/handoff`, `PUT /api/settings/handoff`, và 3 route đã tách trước.
- Không sửa Prisma schema/migrations, webhook, RAG, tenant handoff, bot engine/tools, dashboard frontend, package hoặc DevOps scripts.

## 2. File/report đã đọc

- `report/PROMPT_05D_SETTINGS_ROUTE_SPLIT_RUNTIME_REPORT.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/LOCAL_RUN_GUIDE.md`
- `backend/prisma/schema.prisma`
- `backend/src/index.js`
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
| Commit Prompt 05D `a2fa5da` tồn tại | PASS |
| Remote | Không có remote configured |
| Guardrail | Không dùng `git add .`, không push remote, không switch branch |

## 4. Bug summary

Bug chính:

- Code dùng `prisma.handoffSettings`.
- Prisma model trong schema là `HandoffSetting`.
- Prisma Client accessor đúng là `prisma.handoffSetting`.
- Vì accessor sai là `undefined`, `GET /api/settings/handoff` trả 500.

Vì sao là pre-existing:

- Prompt 05D chỉ move handler `GET /settings/handoff` nguyên trạng sang controller/routes.
- Prompt 05D runtime đã chứng minh bản gốc và bản sau split đều trả 500.
- `backend/src/index.js` seed đang dùng đúng `prisma.handoffSetting`, nên lỗi nằm ở route/controller handoff settings cũ.

Bug phụ phát hiện khi runtime verify PUT:

- Sau khi sửa accessor, `PUT /api/settings/handoff` vẫn 500 vì payload Prisma còn `botGracePeriodSeconds`.
- Field này không tồn tại trong model `HandoffSetting`, nên Prisma validate fail cả nhánh `create` của `upsert`.
- Đã bỏ field này khỏi Prisma payload trong đúng phạm vi handoff settings. Không đổi schema và không đổi response shape hiện tại vì GET response vốn không có field này.

Đây là behavior fix có approval theo Prompt 05D-FIX: route lỗi 500 được sửa thành 200 đúng contract.

## 5. Code scan result

| File | Line/section | Current code sau fix | Expected accessor | Sửa trong prompt này | Lý do |
|---|---:|---|---|---|---|
| `backend/prisma/schema.prisma` | 165 | `model HandoffSetting` | `prisma.handoffSetting` | Không | Xác nhận source of truth; không sửa schema. |
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | 32 | `prisma.handoffSetting.findUnique(...)` | `prisma.handoffSetting` | Có | Sửa accessor sai ở GET handoff. |
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | 34 | `prisma.handoffSetting.create(...)` | `prisma.handoffSetting` | Có | Sửa accessor sai ở create default settings. |
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | create payload | Không còn `botGracePeriodSeconds` | Field schema hợp lệ | Có | Field này không tồn tại trong `HandoffSetting`. |
| `backend/src/api/dashboard.js` | 1291 | `prisma.handoffSetting.upsert(...)` | `prisma.handoffSetting` | Có | Sửa accessor sai ở `PUT /settings/handoff`. |
| `backend/src/api/dashboard.js` | 1293-1294 | `update/create` chỉ gồm field có trong schema | Field schema hợp lệ | Có | Runtime PUT cần pass, không sửa schema. |
| `backend/src/api/dashboard.js` | 1511 | `prisma.handoffSetting.findUnique(...)` | `prisma.handoffSetting` | Có | Vị trí đọc handoff settings liên quan khi assign. |
| `backend/src/index.js` | 339/343 | `prisma.handoffSetting.findUnique/create` | `prisma.handoffSetting` | Không | Đã đúng từ trước. |
| `backend/src/telegram/handoff.js` | 80 | `prisma.handoffSetting.findUnique(...)` | `prisma.handoffSetting` | Không | Đã đúng; prompt cấm sửa tenant/bot handoff. |

Scan sau fix: `rg -n "handoffSettings" backend/src backend/prisma/schema.prisma` không còn kết quả.

## 6. Files changed

- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/api/dashboard.js`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `report/PROMPT_05D_FIX_HANDOFF_SETTINGS_ACCESSOR_REPORT.md`

Không sửa `settings.routes.js` vì route module không cần thay đổi.

## 7. Behavior change

| Nội dung | Trước fix | Sau fix |
|---|---|---|
| `GET /api/settings/handoff` có token | 500 `{error:'Internal server error'}` theo Prompt 05D | 200 object settings |
| `PUT /api/settings/handoff` có token | 500 do accessor sai; sau sửa accessor lộ tiếp lỗi payload field ngoài schema | 200 object settings |
| Auth | Giữ nguyên | Giữ nguyên |
| Public route/method | Giữ nguyên | Giữ nguyên |
| Response shape | Lỗi 500 | Shape đúng theo Prisma `HandoffSetting`: `id`, timeout fields, work hours, `updatedAt` |
| External API call | Không | Không |

## 8. Static validation

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

Không chạy migration, không chạy `db push`, không chạy `start-all.bat`, không chạy Docker compose.

## 9. Runtime smoke result

Môi trường:

- DB: container local/test `bbotech-pgvector-local` đang chạy.
- Backend: `npm run dev`, port 3001.
- Auth token: lấy qua `POST /api/auth/login` bằng credential local/test đã cấu hình; không in credential/token.
- Sau test đã dừng backend process do prompt khởi động; giữ DB container/volume/env local.

| Route | Auth behavior | Status | Response shape | Result |
|---|---|---:|---|---|
| `GET /api/settings/handoff` không token | Không có token | 401 | `{error}` | PASS |
| `GET /api/settings/webhook` | Token hợp lệ | 200 | `{appSecret,pageAccessToken,verifyToken,webhookUrl}` | PASS |
| `GET /api/settings/telegram-destinations` | Token hợp lệ | 200 | `{destinations,envFallback}` | PASS |
| `GET /api/prompts` | Token hợp lệ | 200 | Array, length 7 | PASS |
| `GET /api/settings/handoff` | Token hợp lệ | 200 | `{id,offHoursPendingTimeout,pendingTimeoutSeconds,sessionTimeoutSeconds,updatedAt,workHoursEnd,workHoursStart}` | PASS |
| `PUT /api/settings/handoff` | Token hợp lệ | 200 | Cùng object settings | PASS |
| `GET /api/settings/handoff` sau PUT | Token hợp lệ | 200 | Cùng object settings | PASS |

## 10. PUT verification

Kết quả: **PASS**.

Cách verify:

- Đọc current settings bằng `GET /api/settings/handoff`.
- Gửi `PUT /api/settings/handoff` bằng payload tương đương current settings để tránh thay đổi semantic.
- Payload chỉ gồm field có trong schema `HandoffSetting`: `pendingTimeoutSeconds`, `sessionTimeoutSeconds`, `offHoursPendingTimeout`, `workHoursStart`, `workHoursEnd`.
- Không gửi `id`, `updatedAt`, `botGracePeriodSeconds`.
- Sau PUT, gọi GET lại và nhận 200.

## 11. Source runtime scope

Chỉ sửa phạm vi handoff settings:

- Accessor Prisma trong `GET /settings/handoff`.
- Accessor Prisma trong `PUT /settings/handoff`.
- Accessor Prisma ở vị trí đọc handoff settings liên quan assign trong `dashboard.js`.
- Prisma payload `HandoffSetting` để bỏ field ngoài schema.

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

- `backend/src/api/dashboard.js` vẫn lớn và còn nhiều route chưa tách.
- Các route settings write/external còn lại cần test cô lập trước khi refactor tiếp.
- Tenant scope sâu chưa runtime verified toàn diện.
- `$queryRawUnsafe` vẫn cần audit riêng.
- DevOps scripts vẫn có rủi ro migration/db push/start-all và cần hardening riêng.
- npm audit vulnerabilities vẫn chưa xử lý trong prompt này.
- `backend/src/telegram/handoff.js` còn dùng fallback in-memory `botGracePeriodSeconds`, nhưng không sửa vì nằm ngoài scope và prompt cấm sửa bot/tenant handoff.

## 13. Final verdict

**PASS — bug fixed and runtime verified.**

Điều kiện pass đã đạt:

- Static validation PASS.
- `GET /api/settings/handoff` runtime PASS 200.
- `PUT /api/settings/handoff` runtime PASS 200.
- 3 route đã tách trước vẫn runtime PASS.
- Backend process do prompt khởi động đã dừng.
- Không sửa file ngoài phạm vi.

## 14. Next Step & Goal

Đề xuất tiếp theo:

- **Prompt 05E** nếu muốn xử lý tiếp Settings: tạo test cô lập cho route write/external side effect trước khi tách thêm.
- **Prompt 06** nếu muốn đi vào Clean Architecture sâu hơn: tạo repository layer cho nhóm `settings`/`prompts` đã có runtime baseline.

Mục tiêu của bước tiếp theo là giảm phụ thuộc trực tiếp vào `dashboard.js` mà vẫn giữ public API contract, có static validation và runtime smoke test cho từng lát nhỏ.
