# PROMPT 21R — LOCAL RUNTIME + WEBHOOK SMOKE REPORT

Ngày thực hiện: 2026-07-12
Trạng thái: **PASS**

## 1. Mục tiêu

Khôi phục và xác nhận local runtime readiness trước khi tiếp tục Prompt 21B-3. Phạm vi chỉ gồm Docker/DB/backend readiness và smoke endpoint an toàn; không refactor source, không đổi behavior, không sửa schema/migration/package, không gọi Facebook/Telegram/Gemini/Jina/LLM thật, không seed thật.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Không ở master/main | PASS |
| HEAD trước prompt | `0e24178 Sync project goals and webhook readiness status` |
| Working tree | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked env | Chỉ `backend/.env.example` match scan; env thật không tracked/staged |

Không mở/in `.env` hoặc `.env.local` thật. Không in token/secret.

## 3. Static validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

## 4. Docker/DB readiness

| Check | Kết quả |
|---|---|
| `docker version` | PASS, Docker client/server phản hồi |
| `docker ps -a --filter name=bbotech-pgvector-local` | Container tồn tại |
| `docker ps --filter name=bbotech-pgvector-local` | Container đang Up |
| Port mapping | `0.0.0.0:5433->5432/tcp`, `[::]:5433->5432/tcp` |
| `Test-NetConnection localhost -Port 5433` | PASS |

Không tạo container mới, không chạy `docker compose up`.

## 5. Prisma migrate status/deploy

| Lệnh | Kết quả |
|---|---|
| `npx prisma migrate status` | PASS, 12 migrations, database schema up to date |
| `npx prisma migrate deploy` | PASS, no pending migrations |

Chỉ dùng `migrate status/deploy`; không dùng `db push`, không reset DB.

## 6. Backend startup

Backend đã có sẵn listener ở port `3001`, process owner PID `31972`. `GET http://localhost:3001/health` trả 200.

Prompt 21R **không start backend mới** và **không kill backend hiện có**.

## 7. Runtime smoke

Smoke chạy bằng admin tạm trong DB local, token giữ trong memory, không in username/password/token. Cleanup admin tạm xong, leftover = 0.

| Endpoint | Kỳ vọng | Kết quả |
|---|---|---|
| `GET /health` | 200 | PASS |
| `GET /webhook` thiếu verify params | 403 | PASS |
| `POST /chatwoot-webhook` body `{}` | 404 | PASS |
| `POST /api/auth/login` | 200 + token exists | PASS |
| `GET /api/settings/webhook` | 200, keys đủ, secret mask/null | PASS |
| `GET /api/prompts` | 200 array | PASS |
| `GET /api/channel-configs` | 200 array | PASS |
| `GET /api/quick-reply-menus` | 200 array | PASS |
| `GET /api/analytics?days=7` optional | 200 shape OK | PASS |

Settings webhook response chỉ được kiểm bằng trạng thái `masked-configured`/`null`/`url-present`; không in giá trị secret.

## 8. Cleanup

- Prompt không start backend, nên không dừng process port 3001.
- Không dừng Docker container `bbotech-pgvector-local` để giữ local DB sẵn cho bước tiếp theo.
- Admin tạm prefix `prompt21r_` đã cleanup, leftover = 0.
- Không xóa `.env`, `.env.local`, `.next`, DB volume hoặc backup.

## 9. Docs changed

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `report/phase-21/PROMPT_21R_LOCAL_RUNTIME_WEBHOOK_SMOKE_REPORT.md`

## 10. Không thay đổi

- Không sửa `backend/src/**`.
- Không sửa `dashboard/src/**`.
- Không sửa `backend/prisma/schema.prisma`.
- Không sửa `backend/prisma/migrations/**`.
- Không sửa package/package-lock.
- Không sửa Dockerfile, `docker-compose.yml`, `start-all.bat`.
- Không mở/in env thật hoặc token/secret.
- Không gọi Facebook/Meta/Telegram/Gemini/Jina/LLM thật.
- Không làm Prompt 21B-3/21C/21D trong prompt này.

## 11. Remaining gaps

- Meta Developer verification vẫn pending vì chưa có callback/challenge thật từ Meta.
- Meta POST event thật vẫn pending.
- Production rollout vẫn pending vì chưa backup + migrate deploy + smoke production thật.
- Phase 21 vẫn Started; `backend/src/api/dashboard.js` còn route debt cho 21B-3.

## 12. Final verdict

**PASS**

Docker/DB/backend local đã sẵn sàng, migrations up to date, runtime smoke an toàn PASS 9/9. Đây là local readiness, không phải Meta connected hoặc production ready.

## 13. Next step

Đề xuất chạy **Prompt 21B-3** để tiếp tục giảm nợ backend route read-only/low-risk (`campaigns` list/detail hoặc `stats`) với baseline runtime hiện đã sẵn sàng. Vẫn không chọn webhook/RAG/handoff/tenants/settings-external trong 21B-3.
