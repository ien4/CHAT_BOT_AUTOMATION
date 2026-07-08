# PROMPT 05R-LOCALDB-FIX — LOCAL POSTGRESQL PGVECTOR REPORT

Ngày thực hiện: 2026-07-08
Kết luận: **PASS — backend local runs and smoke test passed** (DB pgvector local/test bền vững, giữ lại sau prompt).

## 1. Mục tiêu

Sửa môi trường chạy local/test để backend chạy được bằng `npm run dev`, dựng PostgreSQL pgvector local/test **bền vững** (giữ lại sau prompt), migrate an toàn, và smoke test lại 3 route đã tách. Không dùng production DB, không `start-all.bat`, không `db push --accept-data-loss`.

## 2. Lỗi ban đầu

- `PrismaClientInitializationError: Environment variable not found: DATABASE_URL` khi `npm run dev`.
- `ERROR: type "vector" does not exist` khi user thử `npx prisma db push`.

## 3. Nguyên nhân

- `DATABASE_URL not found`: sau Prompt 05R-ENV, `backend/.env` đã bị xóa. User tạo lại `backend/.env` nhưng `DATABASE_URL` bị **malformed** (không parse được thành URL) và thiếu `PORT`/`NODE_ENV`/`ENCRYPTION_KEY` → app không nạp được biến môi trường đúng.
- `type "vector" does not exist`: DB đang trỏ tới không có extension `vector`, hoặc không phải image pgvector. Prisma schema có cột `Unsupported("vector")` (pgvector), nên DB local/test bắt buộc phải bật extension `vector` trước khi áp schema. `db push` không chạy migration SQL tạo extension nên fail.
- Hướng fix đã áp dụng: dựng PostgreSQL pgvector local/test + `CREATE EXTENSION IF NOT EXISTS vector;` + `prisma migrate deploy` (migration sẵn có, non-destructive).

## 4. Git preflight

| Hạng mục | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` (không phải master/main) |
| Working tree | Clean trước khi bắt đầu |
| Commit gần nhất | `c864390 Prepare local env and record runtime smoke readiness` |
| Remote | Không cấu hình → không push |
| Source runtime change | Không |

Ghi chú: phát hiện có các container **Supabase của dự án khác** đang chạy (port 54322) — **không đụng tới**, không dùng làm DB cho dự án này.

## 5. Env local handling

- `backend/.env`: đã **tạo lại** local-only, nhất quán với container mới. Đầy đủ `PORT=3001`, `NODE_ENV=development`, `APP_BASE_URL`, `ENCRYPTION_KEY` (sinh local), `DATABASE_URL` trỏ container pgvector local, `JWT_SECRET` (sinh local), `ADMIN_USERNAME/ADMIN_PASSWORD` local/test. Token FB/Chatwoot/Telegram/LLM để trống.
- `dashboard/.env.local`: đã **tạo** local-only với `NEXT_PUBLIC_API_URL=http://localhost:3001/api` (khớp `dashboard/.env.example`), không đặt secret trong `NEXT_PUBLIC_*`.
- Có commit env không: **KHÔNG** (`git check-ignore` xác nhận cả hai bị ignore).
- Secret có bị in không: **KHÔNG** (chỉ in status/shape/tên biến; `DATABASE_URL`/password/JWT/ENCRYPTION_KEY/token không in).

## 6. PostgreSQL pgvector local

| Hạng mục | Giá trị |
|---|---|
| Container name | `bbotech-pgvector-local` |
| Image | `pgvector/pgvector:pg16` |
| Port host | `5433` (→ 5432 trong container) |
| Database | `bbotech_local_db` |
| User | `bbotech_local` (password local, không in) |
| Named volume | `bbotech_pgvector_local_data` (dữ liệu giữ khi restart) |
| Extension `vector` | Đã `CREATE EXTENSION IF NOT EXISTS vector;` → verify `SELECT extname ... = 'vector'` |
| Giữ container sau test | **CÓ** (không xóa container/volume) |

Không dùng `docker compose up`, không sửa `docker-compose.yml`.

## 7. Prisma setup

| Bước | Kết quả |
|---|---|
| `npx prisma validate` | PASS ("The schema ... is valid") |
| `npx prisma migrate deploy` | PASS — "All migrations have been successfully applied" (10 migration) |
| `npx prisma generate` | PASS |
| `prisma db push --accept-data-loss` | **KHÔNG chạy** |

## 8. Backend run result

`cd backend && npm run dev` → PASS. Log startup: "Database connected", "Default admin user created", "Default LLM/prompt/HandoffSettings created", "Server running on port 3001", "Dashboard API: http://localhost:3001/api". Không có secret/token trong log được copy. Facebook/Telegram bỏ qua đúng vì token trống (đúng kỳ vọng local).

## 9. Runtime smoke result

Base URL: `http://localhost:3001`.

| Route | Auth behavior | Status | Response shape | Result |
|---|---|---|---|---|
| (no token) `GET /api/prompts` | Auth enforced | 401 | `{error}`, không crash | PASS |
| `GET /api/settings/webhook` | Cần token hợp lệ | 200 | object `{verifyToken,pageAccessToken,appSecret,webhookUrl}`; secret = `null` (mask), `webhookUrl="http://localhost:3001/webhook"` | PASS |
| `GET /api/settings/telegram-destinations` | Cần token hợp lệ | 200 | object `{destinations:[] (len=0), envFallback:{statusGroupIdConfigured}}` | PASS |
| `GET /api/prompts` | Cần token hợp lệ | 200 | array len=7, keys khớp `promptTemplate` | PASS |

- Không external API call; chỉ read-only DB (`findMany`) và đọc `process.env` (route webhook).
- Server không crash. Không in secret/token.

## 10. Source runtime có thay đổi không

- **Không** sửa `backend/src`.
- **Không** sửa `dashboard/src`.
- **Không** sửa Prisma schema/migrations (chỉ áp dụng migration sẵn có vào DB local).
- **Không** sửa webhook/RAG/tenant handoff/bot engine/Dockerfile/scripts.

## 11. Files changed

Chỉ docs/report được commit:
- `docs/LOCAL_RUN_GUIDE.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `report/PROMPT_05R_LOCALDB_PGVECTOR_FIX_REPORT.md`

Không commit: `backend/.env`, `dashboard/.env.local` (gitignored, local-only).

## 12. Remaining risks

- `backend/src/api/dashboard.js` còn 2.408 dòng, 98 route trực tiếp; phần lớn route chưa runtime verified.
- Tenant scope chưa audit sâu (Prompt 07).
- `$queryRawUnsafe` trong dashboard API/RAG/tenant handoff (Prompt 08).
- DevOps script risk: `start-all.bat` (`db push --accept-data-loss`), `backend/Dockerfile` (`prisma migrate deploy` on start), `webhook-urls-current.txt` stale.
- npm audit: backend 10 (7 moderate, 1 high, 2 critical); dashboard 3 (1 moderate, 2 high).
- DB local là môi trường test riêng; không dùng cho production.

## 13. Final verdict

**PASS — backend local runs and smoke test passed.**

Đã fix cả hai lỗi (`DATABASE_URL not found` và `type "vector" does not exist`), backend chạy `npm run dev` ổn định trên DB pgvector local/test bền vững, smoke test 3 route PASS. Không sửa source runtime/schema. Không commit env.

## 14. Next Step & Goal

Cách user chạy lại backend sau prompt này:
1. Đảm bảo container DB đang chạy: `docker start bbotech-pgvector-local` (nếu đã dừng). Container + volume + `backend/.env` đã được giữ lại.
2. `cd backend`
3. `npm run dev` → backend chạy ở `http://localhost:3001`.

Tiếp theo (đã mở khóa vì runtime PASS):
- **Prompt 05D**: tách thêm route read-only nhỏ khỏi `dashboard.js`, hoặc
- **Prompt 06**: repository layer cho `prompts`/`settings`.

Mục tiêu: giảm dần kích thước `dashboard.js` an toàn, mỗi nhóm nhỏ có runtime verification trên DB local/test, trước khi vào tenant safety audit (Prompt 07) và RAG/raw SQL hardening (Prompt 08).
