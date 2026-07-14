# PROMPT 09C — TENANT HANDOFF RAW SQL HARDENING REPORT

Ngày: 2026-07-10
Branch: `chore/prompt-05r-docs-local-run`
Base commit: `6cc7e84 Harden analytics raw SQL safety`

## 1. Mục tiêu

- Audit & harden mọi `$queryRawUnsafe`/`$executeRawUnsafe` trong `backend/src/tenants/handoff.js`.
- Chuyển sang `$queryRaw`/`$executeRaw` tagged template an toàn, parameterize input tenant/staff/conversation/date/period/limit.
- Giữ nguyên behavior handoff, không gọi Facebook/Telegram thật.
- Không sửa analytics/RAG/seed/schema/migration/package/scripts/dashboard.

## 2. Handoff raw SQL map

| Function/Block | Raw SQL hiện tại | Input source | Tenant/staff/conversation scope | Risk | Patch |
|---|---|---|---|---|---|
| `getHandoffAnalytics` (group-by-day) | `$queryRawUnsafe` SELECT `handoff_events` group by day | `tenantId` (arg), `since` (Date từ `period`) | `WHERE tenant_id = $1` (tenant-scoped) | Raw unsafe API; positional param dạng string; nếu bị đổi thành nối chuỗi sẽ nguy hiểm | `$queryRaw` tagged template `${tenantId}` + `${since}` |

Các block khác trong file (`initiateHandoff`, `claimConversation`, `takeoverConversation`, `endSession`, `handlePendingTimeout`, `relay*`, `recordHandoffEvent`) đều dùng **Prisma Client API** (`findMany/updateMany/update/create/$transaction`) — không có raw SQL, không cần patch.

Xác định thêm:
- Export: `init, initiateHandoff, appendPendingMessage, relayToStaff, relayStaffMessage, claimConversation, takeoverConversation, endSessionByStaff, endSession, resetSessionTimerExternal, recordHandoffEvent, getHandoffAnalytics`.
- Raw SQL chỉ dùng cho **thống kê** (analytics group-by-day). Claim/assign/takeover/end-session dùng Prisma API + `$transaction`, không raw SQL.
- `getHandoffAnalytics` chỉ **đọc** DB, **không** gọi `bot()` → smoke không kích hoạt external Telegram/Facebook.
- Có dùng `tenantId`: có. `staffId`/`conversationId` trong raw query: không (chỉ ở Prisma groupBy/findMany). `period` từ input: có → chuyển thành `since` Date qua switch enum.
- Không build SQL string động, không interpolate table/column/order từ client.

## 3. Source files changed

- `backend/src/tenants/handoff.js` (patch source, 4 dòng)
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `report/phase-18/PROMPT_09C_TENANT_HANDOFF_RAW_SQL_HARDENING_REPORT.md`

## 4. Raw SQL changes

Trước:

```js
prisma.$queryRawUnsafe(`
  SELECT DATE(created_at) as day, event_type, COUNT(*)::int as count
  FROM handoff_events
  WHERE tenant_id = $1 AND created_at >= $2
  GROUP BY day, event_type
  ORDER BY day ASC
`, tenantId, since),
```

Sau:

```js
prisma.$queryRaw`
  SELECT DATE(created_at) as day, event_type, COUNT(*)::int as count
  FROM handoff_events
  WHERE tenant_id = ${tenantId} AND created_at >= ${since}
  GROUP BY day, event_type
  ORDER BY day ASC
`,
```

- `tenantId` (string) và `since` (Date) parameterize qua tagged template.
- Query shape + response shape (`dailyStats` parsing) giữ nguyên.
- Không nối SQL bằng user input; không interpolate table/column/order.

## 5. Input sanitization

- `period` được chuẩn hóa bởi `switch` enum sẵn có: `24h` / `7d` / `30d`, mọi giá trị khác (kể cả `null`, string lạ, injection-style) rơi vào `default` = 7 ngày. Raw string của `period` **không bao giờ** đi vào SQL — chỉ dùng để tính `since` (Date) trong JS.
- Không có `limit`/`days`/`from`/`to` từ user input trong hàm raw SQL này nên không cần thêm helper `sanitizePositiveInt`/`sanitizeDateRange`.
- `tenantId` được parameterize; input injection-style → 0 rows, không lỗi SQL (đã test).

## 6. Tenant/staff/conversation scope

- Tenant filter `WHERE tenant_id = ${tenantId}` giữ nguyên — không bỏ filter để query chạy.
- Tenant A chỉ thấy dữ liệu tenant A; tenant B không bị ảnh hưởng (verified).
- staffId/conversationId trong analytics dùng Prisma groupBy/findMany (đã parameterize sẵn), không đổi.

## 7. Validation

Preflight:
- Branch không phải master/main; commit `6cc7e84` tồn tại; `backend/.env` & `dashboard/.env.local` ignored, không tracked; working tree sạch.

Static (post-patch):
- `node --check` PASS: `src/index.js`, `src/db.js`, `src/api/dashboard.js`, `src/tenants/handoff.js`, `src/telegram/handoff.js`, `src/rag/pipeline.js`, `src/rag/docParser.js`.
- `npx prisma validate` PASS.
- Dashboard `npx --no-install tsc --noEmit` PASS (exit 0).
- `git diff --check`: chỉ warning CRLF/LF của Git trên Windows.
- `git diff --stat`: chỉ `backend/src/tenants/handoff.js` (4 insertions, 4 deletions).
- Scan: `backend/src` không còn `$queryRawUnsafe`/`$executeRawUnsafe` (chỉ còn 1 dòng README text).

## 8. Runtime/module smoke

Option 1 — Module-level smoke (script tạm `backend/_smoke_09c.js`, đã xóa sau khi chạy):

- DB local `bbotech-pgvector-local`: Up.
- Seed `test-09c-*`: tenant A (3 events), tenant B (2 events) trong `handoff_events`.

Kết quả 10/10 PASS:
1. tenant A total = 3.
2. tenant A chỉ thấy events tenant A.
3. tenant A dailyStats (raw query parameterized) trả rows.
4. tenant A byType claimed = 1.
5. tenant B total = 2 (isolation).
6. tenant B không leak sang tenant A.
7. invalid period (`'xyz-invalid-period'`) không crash + default 7d.
8. `period = null` không crash.
9. injection-style `tenantId` (`' OR 1=1 --`) parameterized → 0 rows, không lỗi SQL.
10. cleanup `test-09c-*` leftover = 0.

- Không gọi external Telegram/Facebook (hàm chỉ đọc DB).
- Script tạm đã xóa; working tree chỉ còn thay đổi hợp lệ.

## 9. Remaining raw SQL exceptions

- `backend/scripts/seed.js:69` — `$queryRawUnsafe(sql)` internal seed script (ngoài phạm vi Prompt 09C, dự kiến Prompt 10A).
- `backend/src/infrastructure/repositories/README.md` — chỉ là văn bản tài liệu, không phải runtime code.
- `backend/src/tenants/handoff.js`: **không còn** unsafe.

## 10. Không thay đổi

- Không mở/in `.env`, không in JWT/token/password/DATABASE_URL đầy đủ/FB-TG key.
- Không sửa Prisma schema/migrations, không `db push`, không migration, không reset DB.
- Không sửa analytics route, RAG files, seed script, package, Dockerfile/scripts, dashboard UI/auth, direct Facebook webhook.
- Không thêm dependency, không tạo PrismaClient mới, không gọi external provider.
- Không push remote.

## 11. Final verdict

**PASS**

## 12. Next step

- **Prompt 10** — DevOps/deploy hardening, hoặc **Prompt 10A** — dọn `$queryRawUnsafe` trong `backend/scripts/seed.js` để codebase runtime + script không còn raw unsafe nào.
