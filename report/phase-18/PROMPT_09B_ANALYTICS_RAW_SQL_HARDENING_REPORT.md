# PROMPT 09B - ANALYTICS RAW SQL HARDENING REPORT

## 1. Mục tiêu

- Harden 4 `$queryRawUnsafe` còn lại trong analytics dashboard tại `backend/src/api/dashboard.js`.
- Sanitize `days` nhưng giữ contract hiện hữu của `GET /api/analytics`.
- Validate static và runtime smoke bằng platform admin token.
- Không sửa RAG, tenant handoff, seed script, schema/migration, package, Docker/scripts, dashboard UI/auth, webhook.

## 2. Analytics route map

- Route: `GET /api/analytics`.
- Middleware: `authMiddleware`, `platformAdminOnly`.
- Response shape giữ nguyên các nhóm field: `handoff`, `conversations`, `messages`, `intents`.
- Raw SQL trong route analytics trước patch: 4 query dùng `$queryRawUnsafe`, đều nhận `sinceDate`.

| Query | Input | Current risk | Patch |
|---|---|---|---|
| `staffResponseTimes` | `sinceDate` từ `days` | Raw unsafe API, `days` cũ có thể tạo invalid date | `$queryRaw` tagged template, `${sinceDate}::timestamp` |
| `hourlyActivity` | `sinceDate` từ `days` | Raw unsafe API, positional parameter trong string | `$queryRaw` tagged template, `${sinceDate}::timestamp` |
| `closedConversations` | `sinceDate` từ `days` | Raw unsafe API, invalid/huge `days` có thể gây 500 | `$queryRaw` tagged template, `${sinceDate}::timestamp` |
| `dailyMessages` | `sinceDate` từ `days` | Raw unsafe API, input chưa clamp | `$queryRaw` tagged template, `${sinceDate}::timestamp` |

## 3. Source files changed

- `backend/src/api/dashboard.js`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `report/phase-18/PROMPT_09B_ANALYTICS_RAW_SQL_HARDENING_REPORT.md`

## 4. Raw SQL changes

- Thêm helper `sanitizeAnalyticsDays()`.
- Chuyển 4 analytics query từ `$queryRawUnsafe` sang `$queryRaw` tagged template.
- Không đưa user input vào SQL structure.
- Không interpolate table/column/order từ client.
- `sinceDate` là `Date` object được parameterize vào query.

## 5. Days sanitization

- Default: `30`.
- Min: `1`.
- Max: `365`.
- Input không hợp lệ, ví dụ `days=abc`: dùng default `30`.
- Input quá lớn, ví dụ `days=999999`: clamp về `365`.
- `days` string không đi vào SQL; route tính `sinceDate` trong JS trước khi query.

## 6. Validation

- Preflight git/secret safety PASS: branch không phải `master/main`, Prompt 09 commit tồn tại, env thật ignored và không tracked.
- Backend PASS:
  - `node --check src/index.js`
  - `node --check src/db.js`
  - `node --check src/api/dashboard.js`
  - `node --check src/rag/pipeline.js`
  - `node --check src/rag/docParser.js`
  - `npx prisma validate`
- Dashboard PASS:
  - `npx --no-install tsc --noEmit`
- Diff PASS:
  - `git diff --check` chỉ có warning CRLF/LF của Git trên Windows.

## 7. Runtime analytics smoke

- DB local `bbotech-pgvector-local` đang chạy.
- Backend full trên port `3001` đã chạy sẵn; không dừng process này.
- Để test đúng source mới và tránh startup side effect, đã chạy Express app tạm trên port `3011` chỉ mount `dashboardApi`; process tạm đã dừng sau smoke.
- Tạo 1 platform admin test và 1 tenant admin test tạm; không in username/password/token; đã cleanup sau smoke.

Kết quả:

- `GET /health` -> 200.
- Login platform admin test -> 200, token exists.
- Login tenant admin test -> 200, token exists.
- `GET /api/prompts` với platform token -> 200.
- `GET /api/settings/handoff` với platform token -> 200.
- `GET /webhook` thiếu/sai verify token trên full backend -> 403.
- `POST /chatwoot-webhook` trên full backend -> 404.
- `GET /api/analytics` với platform token -> 200, giữ response shape.
- `GET /api/analytics?days=7` -> 200, giữ response shape.
- `GET /api/analytics?days=abc` -> 200, dùng default an toàn.
- `GET /api/analytics?days=7abc` -> 200, input integer không rõ ràng được xử lý an toàn.
- `GET /api/analytics?days=999999` -> 200, clamp an toàn.
- No-token `GET /api/analytics` -> 401.
- Tenant-token `GET /api/analytics` -> 403.
- Không thấy SQL error trong log smoke tạm.

## 8. Remaining raw SQL exceptions

Còn lại ngoài phạm vi Prompt 09B:

- `backend/src/tenants/handoff.js` - runtime handoff raw SQL.
- `backend/scripts/seed.js` - internal seed script raw SQL.
- Có thể còn dòng tài liệu/README nhắc tới raw SQL repository, không phải runtime code.

## 9. Không thay đổi

- Không sửa `backend/.env` hoặc `dashboard/.env.local`; không in JWT secret, token, password, DATABASE_URL.
- Không sửa Prisma schema/migrations.
- Không sửa package files.
- Không sửa Dockerfile/scripts/start-all.
- Không sửa dashboard UI/auth.
- Không sửa RAG files.
- Không sửa tenant handoff.
- Không sửa direct Facebook webhook.
- Không push remote.

## 10. Final verdict

PASS.

## 11. Next step

- Prompt 09C nên xử lý `$queryRawUnsafe` trong `backend/src/tenants/handoff.js`, mục tiêu là parameterize raw SQL handoff và smoke tenant isolation/handoff behavior.
- Sau đó xử lý `backend/scripts/seed.js` trong Prompt 10 DevOps/security scripts nếu muốn không còn unsafe raw SQL nào trong code/script.
