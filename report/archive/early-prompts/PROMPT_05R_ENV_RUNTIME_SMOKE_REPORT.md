# PROMPT 05R-ENV — LOCAL TEST ENV + RUNTIME SMOKE REPORT

Ngày thực hiện: 2026-07-08
Kết luận: **PASS — runtime smoke test passed** (3 route đã tách runtime verified trên môi trường local/test dùng một lần).

## 1. Mục tiêu

Chuẩn bị môi trường local/test an toàn (env + PostgreSQL local/test) và chạy runtime smoke test 3 route đã tách ở Prompt 05/05B/05C:
- `GET /api/settings/webhook`
- `GET /api/settings/telegram-destinations`
- `GET /api/prompts`

Không refactor code, không push remote, không đọc/in secret, không dùng DB/token production.

## 2. Git preflight

| Hạng mục | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` (không phải master/main) |
| Working tree trước khi bắt đầu | Clean |
| Commit gần nhất | `7425777 Add prompt 05R git recovery report` (05R docs `2bf4386` bên dưới) |
| Remote | Không cấu hình → không push |
| Source runtime change | Không |

## 3. File đã đọc

Docs/report 05R (`FEATURE_INVENTORY.md`, `LOCAL_RUN_GUIDE.md`, `PROJECT_PROGRESS.md`, `FEATURE_AUDIT_CHECKLIST.md`, `REFACTOR_PLAN.md`, report 05R + Git recovery), `backend/.env.example`, `dashboard/.env.example`, `backend/package.json`, `dashboard/package.json`, `backend/src/api/dashboard.js` (auth/login + authMiddleware), `settings.routes.js`, `prompts.routes.js`, `settings.controller.js`, `prompts.controller.js`, `backend/src/index.js` (seedDefaults). Không mở nội dung `.env` thật (không tồn tại từ đầu).

## 4. Env readiness

- Trạng thái ban đầu: `backend/.env` **MISSING**, `dashboard/.env` và `dashboard/.env.local` **MISSING**; `backend/node_modules` và `dashboard/node_modules` EXISTS.
- Người dùng phê duyệt: (1) tạo Docker Postgres tạm làm DB test, (2) tạo file env local-only (không commit).
- Đã tạo `backend/.env` **local-only** với: `NODE_ENV=development`, `PORT=3001`, `APP_BASE_URL=http://localhost:3001`, `DATABASE_URL` trỏ container Postgres tạm ở `localhost:5433`, `JWT_SECRET`/`ENCRYPTION_KEY`/`ADMIN_PASSWORD` sinh ngẫu nhiên local (không in ra), các token FB/Chatwoot/Telegram/LLM để trống.
- Đã tạo `dashboard/.env.local` với `NEXT_PUBLIC_API_URL=http://localhost:3001/api` (không đặt secret trong `NEXT_PUBLIC_*`).
- Cả hai file đều được `.gitignore` che (`git check-ignore` xác nhận). **Không in secret** ở bất kỳ đâu.

## 5. DB local/test readiness

- `psql (PostgreSQL) 17.6` và `Docker 29.4.1` có sẵn.
- Đã khởi động container **tạm** `bbotest_pg` từ image `pgvector/pgvector:pg16`, port host `5433`, user/db `bbotest` (mật khẩu sinh local, không in, không phải production).
- `DATABASE_URL` trỏ `localhost:5433` — local/test rõ ràng, không production. Không in password.
- Schema: repo có sẵn 10 migration + `migration_lock.toml`. Đã chạy `npx prisma migrate deploy` (non-destructive) trên container mới trống → "All migrations have been successfully applied". **Không** dùng `prisma db push` / `--accept-data-loss`.

## 6. Static validation

| Command | Result |
|---|---|
| `node --check` ×9 file trọng yếu (index, db, dashboard.js, settings/prompts controller+routes, config, prisma client) | PASS |
| `npx prisma validate` (dummy URL) | PASS |
| Dashboard `npx --no-install tsc --noEmit` | PASS (exit 0) |
| Dashboard `npm run build` | PASS |

## 7. Runtime smoke gate

**PASS** — đủ điều kiện: env local/test tồn tại, `dashboard/.env.local` tồn tại, `DATABASE_URL` local/test, DB đang chạy, schema đã migrate, admin local/test được seed, token lấy được qua login local, 3 route không cần external API, người dùng đồng ý chạy backend local.

## 8. Runtime smoke result

Backend start bằng `node src/index.js` (không dùng start-all/Docker/migration lúc chạy). Log startup: "Database connected", "Default admin user created", "Default prompt templates created", "Server running on port 3001". Base URL: `http://localhost:3001`.

| Route | Status | Response shape | Auth behavior | External API | Ghi DB | Kết luận |
|---|---|---|---|---|---|---|
| (no token) `GET /api/prompts` | 401 | `{error}` | Auth enforced, không crash | Không | Không | PASS |
| `GET /api/settings/webhook` | 200 | object `{verifyToken,pageAccessToken,appSecret,webhookUrl}` — secret = `null` (masked, do FB_* trống), `webhookUrl="http://localhost:3001/webhook"` | Yêu cầu token hợp lệ | Không | Không (chỉ đọc `process.env`) | PASS |
| `GET /api/settings/telegram-destinations` | 200 | object `{destinations:[] (len=0), envFallback:{statusGroupIdConfigured}}` | Yêu cầu token hợp lệ | Không | Read-only (`telegramDestination.findMany`) | PASS |
| `GET /api/prompts` | 200 | array length=7, keys[0]=`id,name,intentType,systemPrompt,userPromptTemplate,modelPreference,isActive,createdAt,updatedAt,layer,tenantId` | Yêu cầu token hợp lệ | Không | Read-only (`promptTemplate.findMany`) | PASS |

- Không có secret/token nào được in trong quá trình test (chỉ log status code + shape + trạng thái mask).
- Server không crash trong toàn bộ smoke test.
- Kỳ vọng khớp: không token → lỗi auth; có token → 200 với shape đúng, giá trị secret mask/null.

## 9. Source runtime có thay đổi không

- **Không** sửa `backend/src` logic.
- **Không** sửa `dashboard/src` UI.
- **Không** sửa Prisma schema/migrations (chỉ áp dụng migration sẵn có vào DB tạm).
- **Không** sửa webhook handlers / RAG pipeline / tenant handoff / bot engine.
- **Không** sửa Dockerfile/scripts.

## 10. Env file handling

- Có tạo `.env` local không: CÓ — `backend/.env` + `dashboard/.env.local` local-only, gitignored.
- Có commit `.env` không: **KHÔNG** (đã xác nhận `git check-ignore`; không stage/commit env).
- Sau smoke test: đã **gỡ** container tạm `bbotest_pg` và **xóa** 2 file env local (vì DB tạm không còn, tránh để lại config hỏng). Working tree clean.

## 11. Remaining risks

- 3 route đã runtime verified, nhưng **verify trên DB tạm dùng một lần** — cần chuẩn bị lại env/DB test nếu muốn tái chạy (xem `docs/runbooks/LOCAL_RUN_GUIDE.md`).
- `backend/src/api/dashboard.js` còn 2.408 dòng, 98 route trực tiếp — chưa runtime verify các route còn lại.
- `$queryRawUnsafe`, tenant scope (mới verify ở mức route list prompts trả `tenantId=null` scope mặc định), handoff, RAG chưa audit sâu.
- DevOps script risk: `start-all.bat` (`db push --accept-data-loss`), `backend/Dockerfile` (`prisma migrate deploy` on start), `webhook-urls-current.txt` stale.
- Default credential/fallback (`admin/admin123`) vẫn tồn tại trong code/scripts.
- npm audit: backend 10 (7 moderate, 1 high, 2 critical); dashboard 3 (1 moderate, 2 high) — chưa xử lý.

## 12. Final verdict

**PASS — runtime smoke test passed.**

3 route đã tách (`GET /api/settings/webhook`, `GET /api/settings/telegram-destinations`, `GET /api/prompts`) chạy đúng: auth enforced (401 khi thiếu token), 200 với response shape khớp contract, secret mask/null, không external API, chỉ read-only DB, server không crash. Không có source runtime/schema thay đổi. Không commit env.

## 13. Next Step & Goal

Runtime smoke test đã PASS → mở khóa lựa chọn:
- **Prompt 05D**: tiếp tục tách thêm route read-only nhỏ khỏi `dashboard.js` (đã có guardrail runtime tương đương), hoặc
- **Prompt 06**: bắt đầu repository layer cho nhóm `prompts`/`settings` khi controller boundary đã đủ rõ.

Mục tiêu: giảm dần kích thước `dashboard.js` một cách an toàn với runtime verification cho từng nhóm nhỏ, trước khi vào tenant safety audit (Prompt 07) và RAG/raw SQL hardening (Prompt 08).
