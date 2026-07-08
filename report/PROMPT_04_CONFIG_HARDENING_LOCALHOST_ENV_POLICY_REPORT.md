# PROMPT 04 - CONFIG HARDENING + LOCALHOST CLEANUP + ENV POLICY REPORT

Ngày thực hiện: 2026-07-08  
Workspace: `D:\bbo_team\Boss_Chau\Bot_Automation\BBOTECH_BOT_AUTOMATION-main`  
Kết luận: **PASS WITH WARNINGS**

## 1. Phạm vi đã thực hiện

Prompt 04 tập trung vào cấu hình môi trường, giảm hard-code URL local trong phạm vi an toàn và tạo chính sách env cho các prompt tiếp theo.

Đã thực hiện:

- Kiểm tra Git preflight và xác nhận commit Prompt 03 tồn tại.
- Chạy baseline validation trước khi sửa source.
- Scan `process.env` trong backend và đối chiếu với `backend/.env.example`.
- Scan `NEXT_PUBLIC_*` trong dashboard.
- Scan URL local trong `backend/src`, `dashboard/src`, `.env.example`, docs và DevOps file theo chế độ read-only.
- Mở rộng backend config helper.
- Chuẩn hóa dashboard env helper.
- Gom fallback Chatwoot trong dashboard settings về helper config.
- Gom dashboard notification URL trong backend về helper config.
- Cập nhật `.env.example` cho backend và tạo `.env.example` cho dashboard.
- Tạo `docs/ENV_POLICY.md`.
- Cập nhật `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`, `docs/ARCHITECTURE.md`, `docs/REFACTOR_PLAN.md`.

## 2. Việc không làm theo đúng guardrail

Không thực hiện:

- Không đọc, in hoặc sửa `.env` thật.
- Không chạy `prisma migrate`, `prisma db push`, `db push --accept-data-loss`.
- Không chạy `docker compose up`.
- Không chạy `start-all.bat`.
- Không thêm package.
- Không sửa Prisma schema hoặc migration.
- Không sửa public route/webhook URL có chủ đích.
- Không sửa các file rủi ro: `backend/src/webhook/*`, `backend/src/tenants/webhookHandler.js`, `backend/src/tenants/handoff.js`, `backend/src/telegram/handoff.js`, `backend/src/rag/pipeline.js`, `backend/src/chatwoot/crypto.js`.
- Không sửa `start-all.bat`, `stop-all.bat`, Dockerfile.

## 3. File source đã thay đổi

| File | Thay đổi |
|---|---|
| `backend/src/infrastructure/services/config.js` | Thêm helper normalize URL, mode env, backend port, app base URL, dashboard base URL và cảnh báo placeholder config. |
| `backend/src/notifications/telegramDestinations.js` | Dùng `getDashboardBaseUrl()` thay vì đọc trực tiếp `DASHBOARD_URL || FRONTEND_URL || localhost`. |
| `dashboard/src/lib/config/env.ts` | Thêm `normalizeBaseUrl`, `CHATWOOT_BASE_URL`, `buildApiUrl`; giữ fallback local tại helper tập trung. |
| `dashboard/src/app/dashboard/settings/page.tsx` | Hiển thị Chatwoot base URL bằng `CHATWOOT_BASE_URL` từ helper config. |

## 4. File env/docs/report đã thay đổi

| File | Thay đổi |
|---|---|
| `backend/.env.example` | Bổ sung `DASHBOARD_URL`, `FRONTEND_URL`, `TELEGRAM_MANAGER_CHAT_ID` và các biến `MESSAGE_*`. |
| `dashboard/.env.example` | Tạo mới file mẫu cho `NEXT_PUBLIC_API_URL` và `NEXT_PUBLIC_CHATWOOT_URL`. |
| `docs/ENV_POLICY.md` | Tạo chính sách env: secret/public env, local vs production, validation an toàn, checklist deploy. |
| `docs/PROJECT_PROGRESS.md` | Ghi trạng thái Prompt 04 và rủi ro còn lại. |
| `docs/FEATURE_AUDIT_CHECKLIST.md` | Ghi audit config/env sau Prompt 04. |
| `docs/ARCHITECTURE.md` | Ghi bổ sung helper config sau Prompt 04. |
| `docs/REFACTOR_PLAN.md` | Đánh dấu Prompt 04 hoàn thành và định hướng Prompt 05. |

## 5. Backend config sau Prompt 04

`backend/src/infrastructure/services/config.js` hiện export:

- `getEnv`
- `getRequiredEnv`
- `isProduction`
- `isDevelopment`
- `isTest`
- `normalizeBaseUrl`
- `getBackendPort`
- `getAppBaseUrl`
- `getDashboardBaseUrl`
- `isPlaceholderSecret`
- `getPlaceholderConfigWarnings`
- `warnIfPlaceholderConfig`

Lưu ý: helper cảnh báo placeholder chưa được gọi tự động ở startup để tránh thay đổi behavior/log production trong Prompt 04.

## 6. Dashboard config sau Prompt 04

`dashboard/src/lib/config/env.ts` hiện gom:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_CHATWOOT_URL`
- local fallback backend API
- local fallback Chatwoot URL
- URL builder cho backend/API

Quy tắc cho Prompt sau: không thêm fallback localhost mới trực tiếp trong page/component; phải đưa vào helper config trước.

## 7. Env inventory

Kết quả đối chiếu backend env:

```text
NO_BACKEND_ENV_MISSING_FROM_EXAMPLE
```

Các biến đã bổ sung vào `backend/.env.example`:

- `DASHBOARD_URL`
- `FRONTEND_URL`
- `TELEGRAM_MANAGER_CHAT_ID`
- `MESSAGE_RATE_WINDOW_MS`
- `MESSAGE_RATE_MAX`
- `MESSAGE_BURST_WINDOW_MS`
- `MESSAGE_BURST_MAX`
- `MESSAGE_RATE_BLOCK_MS`
- `MESSAGE_RATE_WARNING_COOLDOWN_MS`

Dashboard đã có file mẫu riêng:

- `dashboard/.env.example`

## 8. Localhost còn lại sau Prompt 04

Trong source runtime, URL local còn lại có chủ đích:

| File | Lý do chưa sửa |
|---|---|
| `dashboard/src/lib/config/env.ts` | Fallback local tập trung cho dashboard dev. |
| `backend/src/infrastructure/services/config.js` | Fallback local tập trung cho backend/dashboard notification dev. |
| `backend/src/index.js` | Chỉ là log startup; chưa sửa để tránh nhiễu behavior/log cũ. |
| `backend/src/api/dashboard.js` | Có fallback webhook URL trong file lớn/rủi ro; chưa sửa vì có thể ảnh hưởng contract/settings/webhook. |

Các file DevOps/local URL chỉ scan read-only, chưa sửa:

- `start-all.bat`
- `stop-all.bat`
- `backend/Dockerfile`
- `docker-compose.yml`
- `webhook-urls-current.txt`

## 9. DevOps warnings

Các rủi ro còn tồn tại:

- `start-all.bat` vẫn có `prisma db push --accept-data-loss` và nhiều URL local/tunnel.
- `backend/Dockerfile` vẫn chạy `npx prisma migrate deploy` khi container start.
- `webhook-urls-current.txt` có thể stale; không nên dùng làm nguồn production.
- `chatwoot/` không tồn tại ở root khi scan trước đó; không chạy batch script nếu chưa xác minh môi trường.

Các mục này nên xử lý bằng Prompt DevOps/deploy riêng, không ghép với Prompt 05.

## 10. Validation sau thay đổi

Backend:

```text
node --check src/index.js: PASS
node --check src/db.js: PASS
node --check src/infrastructure/services/config.js: PASS
node --check src/infrastructure/persistence/prisma/client.js: PASS
node --check src/notifications/telegramDestinations.js: PASS
npx prisma validate với DATABASE_URL dummy: PASS
```

Dashboard:

```text
npx --no-install tsc --noEmit: PASS
npm run --if-present build: PASS
```

Scan guardrail:

```text
Không có diff trong webhook handlers, tenant handoff, telegram handoff, RAG pipeline, Chatwoot crypto, Prisma schema/migrations, start/stop scripts hoặc Dockerfile.
```

## 11. Trạng thái Git trước commit

Các file thay đổi thuộc phạm vi Prompt 04:

- `backend/.env.example`
- `backend/src/infrastructure/services/config.js`
- `backend/src/notifications/telegramDestinations.js`
- `dashboard/.env.example`
- `dashboard/src/app/dashboard/settings/page.tsx`
- `dashboard/src/lib/config/env.ts`
- `docs/ARCHITECTURE.md`
- `docs/ENV_POLICY.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/REFACTOR_PLAN.md`
- `report/PROMPT_04_CONFIG_HARDENING_LOCALHOST_ENV_POLICY_REPORT.md`

Ignored sau build:

- `backend/node_modules/`
- `dashboard/node_modules/`
- `dashboard/.next/`
- `dashboard/tsconfig.tsbuildinfo`

## 12. Hướng dẫn cho Prompt 05

Prompt 05 nên làm:

- Tách `backend/src/api/dashboard.js` theo route/controller domain nhỏ.
- Bắt đầu với domain ít rủi ro như health/settings read-only hoặc một nhóm CRUD nhỏ.
- Giữ nguyên public route, method, response shape và auth middleware.
- Chạy `node --check`, Prisma validate dummy và dashboard build/typecheck nếu có ảnh hưởng dashboard.

Prompt 05 không nên làm:

- Không sửa webhook handlers.
- Không sửa tenant handoff.
- Không sửa RAG pipeline.
- Không sửa Prisma schema/migrations.
- Không xử lý DevOps script trong cùng prompt.
- Không chạy migration/db push/Docker/start script.
