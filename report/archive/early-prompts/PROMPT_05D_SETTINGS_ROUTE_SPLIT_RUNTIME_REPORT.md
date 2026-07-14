# PROMPT 05D — SETTINGS ROUTE SPLIT + RUNTIME REPORT

Ngày thực hiện: 2026-07-08
Kết luận: **PASS WITH WARNINGS** — tách `GET /settings/handoff` thành controller/route đúng kiến trúc, behavior giữ nguyên (không regression); đồng thời **phát hiện bug pre-existing** trong chính route này (dùng sai Prisma accessor) khiến route trả 500 cả trước và sau khi tách.

## 1. Mục tiêu

Tiếp tục tổ chức phần Settings/Cài Đặt trong backend API: lập route map settings còn lại, chọn 1 route settings an toàn nhất để tách tiếp, giữ nguyên public route/method/auth/status/shape/DB query/error, runtime smoke test lại các route settings đã tách + route mới, cập nhật docs/report, commit local. Không push, không đổi behavior có chủ đích.

## 2. File/report đã đọc

- `docs/status/PROJECT_PROGRESS.md`, `docs/status/FEATURE_AUDIT_CHECKLIST.md`, `docs/roadmap/REFACTOR_PLAN.md`, `docs/runbooks/LOCAL_RUN_GUIDE.md`, `docs/architecture/FEATURE_INVENTORY.md`
- `report/archive/early-prompts/PROMPT_05R_LOCALDB_PGVECTOR_FIX_REPORT.md`, `report/archive/early-prompts/PROMPT_05C_BACKEND_API_ROUTE_CONTROLLER_SPLIT_REPORT.md`
- `backend/src/api/dashboard.js`, `settings.controller.js`, `settings.routes.js`, `prompts.controller.js`, `prompts.routes.js`
- `backend/src/index.js` (seedDefaults), `backend/src/db.js`, `backend/package.json`, `backend/prisma/schema.prisma`

Không đọc/in `.env` thật.

## 3. Git preflight

| Hạng mục | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` (không master/main) |
| Working tree | Clean trước khi sửa |
| Commit gần nhất | `040257b` (Prompt 05R-LOCALDB-FIX) tồn tại |
| Remote | Không cấu hình → không push |

## 4. Baseline static validation

`node --check` ×9 file trọng yếu → PASS; `npx prisma validate` → PASS. `dashboard.js` = 2408 dòng trước khi sửa.

## 5. Settings route map

Các route `/settings*` còn lại trong `dashboard.js` (trước Prompt 05D):

| Method | Path | Auth | Mục đích | DB | External | Raw SQL | Tenant scope | Risk | Tách 05D? |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/settings/handoff` | authMiddleware | Đọc handoff settings singleton (lazy-create nếu thiếu) | Read (+create lần đầu) | Không | Không | Không (global) | Medium | **CHỌN** |
| PUT | `/settings/handoff` | authMiddleware | Cập nhật handoff settings | Write (upsert) | Không | Không | Không | Medium-High (write) | Không |
| POST | `/settings/telegram-destinations` | authMiddleware | Tạo destination | Write | Không | Không | Không | High (write) | Không |
| PUT | `/settings/telegram-destinations/:id` | authMiddleware | Sửa destination | Write | Không | Không | Không | High (write) | Không |
| DELETE | `/settings/telegram-destinations/:id` | authMiddleware | Xóa destination | Write | Không | Không | Không | High (write) | Không |
| POST | `/settings/telegram-destinations/:id/test` | authMiddleware | Gửi test Telegram | Read | **Có (Telegram)** | Không | Không | High (external) | Không |
| GET | `/settings/chatwoot-test` | authMiddleware | Test kết nối Chatwoot | — | **Có (Chatwoot)** | Không | Không | High (external) | Không |
| GET | `/settings/facebook-menu` | authMiddleware | Đọc Facebook menu | — | **Có (Facebook)** | Không | Không | High (external) | Không |
| POST | `/settings/facebook-menu` | authMiddleware | Ghi Facebook menu | — | **Có (Facebook)** | Không | Không | High (external+write) | Không |

Các route settings read-only đã tách trước đó: `GET /settings/webhook` (05), `GET /settings/telegram-destinations` (05B).

## 6. Route selected

- **Route chọn:** `GET /settings/handoff`.
- **Lý do:** là route settings GET read-only duy nhất còn lại; không gọi external API; không raw SQL; không tenant scope; logic nhỏ; move nguyên trạng được; trên DB local/test singleton đã seed sẵn nên lúc chạy là read thuần. Chỉ cần dependency `prisma` đã được `createSettingsRoutes` nhận.
- **Risk:** Medium (có nhánh lazy-create singleton khi thiếu — được giữ nguyên trạng, không đổi).
- **Vì sao không chọn route settings khác:** PUT/POST/DELETE là write; `telegram-destinations/:id/test`, `chatwoot-test`, `facebook-menu` gọi external API thật (Telegram/Chatwoot/Facebook) → không phù hợp smoke test local không side effect.

## 7. Files changed

| File | Thay đổi |
|---|---|
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | Thêm `createGetHandoffSettings({ prisma })` — copy **nguyên trạng** handler cũ. |
| `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Thêm `router.get('/handoff', authMiddleware, createGetHandoffSettings({ prisma }))`. |
| `backend/src/api/dashboard.js` | Gỡ block `router.get('/settings/handoff', ...)`, thay bằng comment trỏ tới file route mới. Giữ nguyên `PUT /settings/handoff`. |

`dashboard.js`: 2408 → **2395** dòng.

## 8. Behavior safety

| Hạng mục | Kết quả |
|---|---|
| Public route | Không đổi — vẫn `/api/settings/handoff` |
| Method | Không đổi — `GET` |
| Auth middleware | Không đổi — `authMiddleware` |
| Status code | Không đổi — thành công 200, lỗi 500 (giữ nguyên) |
| Response shape | Không đổi — trả nguyên object settings qua `res.json(settings)` |
| DB query | Không đổi — copy **nguyên trạng** `prisma.handoffSettings.findUnique/create` (bao gồm cả accessor sai — xem cảnh báo mục 12) |
| External side effect | Không có |
| Prisma schema/migrations | Không đổi |
| Webhook/tenant/RAG/bot engine/dashboard FE | Không đụng |
| Route order | An toàn — không route nào khác match `GET /settings/handoff`; request rơi xuống mount `/settings` (dòng 1558) và được sub-router xử lý |

## 9. Runtime smoke result

Backend `npm run dev` trên DB local pgvector (`bbotech-pgvector-local`). Lưu ý: có một backend cũ đang chiếm port 3001 → đã dừng process đó (theo PID) và khởi động lại instance code mới trước khi test.

| Route | Auth behavior | Status | Response shape | Result |
|---|---|---|---|---|
| (no token) `GET /api/settings/handoff` | Auth enforced | 401 | `{error}`, không crash | PASS |
| `GET /api/settings/webhook` | token hợp lệ | 200 | `{verifyToken,pageAccessToken,appSecret,webhookUrl}` mask/null | PASS |
| `GET /api/settings/telegram-destinations` | token hợp lệ | 200 | `{destinations:[],envFallback}` | PASS |
| `GET /api/prompts` | token hợp lệ | 200 | array len=7 | PASS |
| `GET /api/settings/handoff` (mới tách) | token hợp lệ | **500** | `{error:'Internal server error'}` | Giữ nguyên behavior gốc (xem mục 12) |

Không external API call; không write DB ngoài lazy-create dự kiến; server không crash.

## 10. Settings as project objective

Phần **Settings/Cài Đặt** là khu vực **mấu chốt** của hệ thống vì chứa webhook config (Facebook), Telegram destinations, handoff settings, provider/API config và channel/integration (Chatwoot/Facebook) config. Vì vậy:

- Refactor Settings phải ưu tiên **an toàn, route-by-route**, mỗi route có runtime smoke test trên DB local/test.
- **Không** tách route Settings có external side effect (Telegram/Chatwoot/Facebook) khi chưa có test cô lập riêng.
- Route write (PUT/POST/DELETE) cần checklist regression riêng trước khi tách.

## 11. Source runtime có thay đổi không

- Chỉ sửa trong phạm vi route/controller settings: `settings.controller.js`, `settings.routes.js`, và gỡ block route khỏi `dashboard.js`.
- **Không** sửa Prisma schema/migrations, webhook, tenant handoff, RAG, bot engine, dashboard frontend, DevOps scripts.
- Handler move **nguyên trạng**, không đổi query/shape/status/error.

## 12. Remaining risks

- **Bug pre-existing (P1, mới phát hiện):** route `/settings/handoff` (cả GET đã tách lẫn `PUT /settings/handoff` dòng 1291 và một chỗ dòng 1511 trong `dashboard.js`) dùng accessor **`prisma.handoffSettings`** (số nhiều) trong khi model Prisma tên **`HandoffSetting`** (số ít, accessor đúng `prisma.handoffSetting`). Do đó `prisma.handoffSettings` là `undefined` → route ném lỗi → **500**. Đã xác minh: bản gốc tại `git HEAD` cũng dùng plural (đã lỗi từ trước); `index.js` seedDefaults dùng đúng singular `prisma.handoffSetting`; test trực tiếp `prisma.handoffSetting.findUnique` trả về row hợp lệ. **Prompt 05D KHÔNG tự sửa** vì đây là thay đổi behavior/query (500→200), cần approval/prompt riêng.
- `backend/src/api/dashboard.js` còn **2395 dòng** và nhiều route trực tiếp.
- Settings route write/external còn lại chưa tách (cần test cô lập).
- Tenant scope chưa audit sâu (Prompt 07).
- `$queryRawUnsafe` trong dashboard API/RAG/tenant (Prompt 08).
- DevOps script risk (`start-all.bat`, Dockerfile migrate on start), npm audit vulnerabilities (backend 10, dashboard 3).

## 13. Final verdict

**PASS WITH WARNINGS.**

- Việc tách `GET /settings/handoff` sang controller/route đúng kiến trúc **thành công** và **giữ nguyên behavior** (không regression: route trả 500 cả trước lẫn sau).
- 3 route đã tách trước (`webhook`, `telegram-destinations`, `prompts`) vẫn runtime PASS (200); auth enforced (401 khi thiếu token).
- Cảnh báo chính: phát hiện **bug pre-existing** ở route handoff (sai Prisma accessor). Cần một prompt fix riêng có approval để đổi `prisma.handoffSettings` → `prisma.handoffSetting`.

## 14. Next Step & Goal

Đề xuất ưu tiên:

1. **Prompt 05D-FIX (khuyến nghị làm trước):** sửa bug accessor `handoffSettings` → `handoffSetting` cho GET (controller) và `PUT /settings/handoff` + chỗ dùng ở dòng ~1511 trong `dashboard.js`; runtime verify `GET /settings/handoff` trả 200. Đây là behavior change nên cần approval rõ.
2. **Prompt 05E:** không còn settings route read-only "sạch" để tách tiếp; các route settings còn lại là write/external → cần prompt test cô lập riêng (mock external, hoặc chỉ verify auth/validation).
3. **Prompt 06:** boundary `settings`/`prompts` đã đủ rõ để bắt đầu repository layer cho nhóm này.

Mục tiêu: tiếp tục giảm `dashboard.js` an toàn theo từng route Settings, mỗi bước có runtime verification trên DB local/test, và xử lý dứt điểm bug handoff accessor trước khi tách các route write/external.
