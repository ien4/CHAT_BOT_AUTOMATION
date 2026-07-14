# PROMPT 10A — SEED RAW SQL CLEANUP + PROGRESS SYNC REPORT

Ngày: 2026-07-10
Branch: `chore/prompt-05r-docs-local-run`
Base commit: `1e3bc0e Harden tenant handoff raw SQL safety`

## 1. Mục tiêu

- Audit & dọn `$queryRawUnsafe`/`$executeRawUnsafe` còn lại trong `backend/scripts/seed.js`.
- Chuyển sang Prisma API / tagged template an toàn, giữ nguyên mục tiêu và data shape seed.
- Không chạy seed script phá dữ liệu.
- Sau patch: `backend/src` + `backend/scripts` không còn unsafe raw SQL runtime/script (trừ README text).
- Sync 3 docs tiến độ.
- Không sửa DevOps lớn/schema/migration/package/Docker/dashboard/RAG/analytics/handoff.

## 2. Seed raw SQL map

| File | Function/block | Raw SQL hiện tại | Input source | Risk | Patch |
|---|---|---|---|---|---|
| `backend/scripts/seed.js` | vòng lặp `items` (INSERT knowledge_base) | `$queryRawUnsafe(sql)` với `sql` build bằng template string + escaping thủ công `replace(/'/g,"''")` | File `backend/data/seed.json` (title/content/category/sourceType/sourceUrl) | Manual escaping mong manh; nếu escaping sót → SQL injection qua nội dung file seed | `prisma.knowledgeBase.create()` (Prisma parameterize) |

Xác định thêm:
- SQL dùng để **insert seed data** vào `knowledge_base`; không phải DDL, không drop/alter.
- Input đến từ **file** `data/seed.json` (không phải user request/env). Không nhận env input.
- SQL là **dynamic string** (build bằng interpolation) → đúng loại cần loại bỏ.
- Content Packages (phần sau của seed) đã dùng Prisma API (`contentPackage.create`, `contentPackageItem.create`) — không có raw SQL, không cần đụng.
- Không có default credential/hard-code nhạy cảm trong đoạn raw SQL này (chỉ knowledge content).
- Lý do ban đầu dùng raw: cột `embedding` là vector `Unsupported` → nhưng nó optional trong schema nên Prisma Client vẫn insert được (không cần raw SQL).

## 3. Source files changed

- `backend/scripts/seed.js` (patch script)
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `report/phase-18/PROMPT_10A_SEED_RAW_SQL_CLEANUP_PROGRESS_SYNC_REPORT.md`

## 4. Raw SQL changes

Trước (rút gọn):

```js
const safeTitle = item.title.replace(/'/g, "''");
const safeContent = item.content.replace(/'/g, "''");
const safeCategory = (item.category || 'general').replace(/'/g, "''");
let sql;
if (sourceUrl) {
  sql = `INSERT INTO knowledge_base (...) VALUES (gen_random_uuid(), '${safeTitle}', '${safeContent}', ...) RETURNING id, title`;
} else {
  sql = `INSERT INTO knowledge_base (...) VALUES (gen_random_uuid(), '${safeTitle}', ...) RETURNING id, title`;
}
const result = await prisma.$queryRawUnsafe(sql);
```

Sau:

```js
await prisma.knowledgeBase.create({
  data: {
    title: item.title,
    content: item.content,
    category: item.category || 'general',
    sourceType: item.sourceType || 'file',
    sourceUrl: item.sourceUrl || null,
    isActive: true,
  },
});
```

- Loại bỏ hoàn toàn raw SQL string + escaping thủ công.
- Prisma parameterize mọi giá trị.
- Data shape giữ nguyên: cùng cột; `id` auto `uuid()`; `createdAt`/`updatedAt` theo default; `isActive` true.
- Không đổi id/slug/name/role/dữ liệu seed mặc định.
- `-23/+13` dòng.

## 5. Validation

Preflight: branch không phải master/main; commit `1e3bc0e` tồn tại; working tree sạch; `.env`/`.env.local` ignored, không tracked.

Static post-patch (PASS):
- `node --check`: `src/index.js`, `src/db.js`, `src/api/dashboard.js`, `src/rag/pipeline.js`, `src/tenants/handoff.js`, `scripts/seed.js`.
- `npx prisma validate` PASS.
- Dashboard `npx --no-install tsc --noEmit` exit 0.
- `git diff --check`: chỉ warning CRLF/LF Windows.
- `git diff --stat`: chỉ `backend/scripts/seed.js` (+13/-23).

Scan unsafe:
- `backend/src`: 0 (chỉ 1 dòng `README.md` documentation-only).
- `backend/scripts`: 0.

## 6. Seed execution policy

- **Option A — Static-only** (theo ưu tiên prompt). Seed script mutate DB rộng (knowledge_base + content packages) → **NOT RUN** trực tiếp trên DB.
- Bổ sung **behavior-parity check bằng transaction rollback** (không để lại dữ liệu), phát hiện điểm quan trọng:
  - DB local `knowledge_base.embedding` = **NOT NULL, không default** (xác nhận qua `information_schema`).
  - Chạy chính SQL INSERT gốc trong `BEGIN...ROLLBACK` qua psql → lỗi `null value in column "embedding" ... violates not-null constraint`.
  - `prisma.knowledgeBase.create()` mới → cùng lỗi P2011 null constraint trên `embedding`.
  - ⇒ **Behavior parity**: cả raw SQL cũ lẫn Prisma create mới đều fail ở cùng constraint DB; seed's try/catch đếm `failed++` và tiếp tục. Patch KHÔNG làm đổi behavior.
- Smoke script tạm đã xóa; không để lại dữ liệu (`test-10a-*` = 0).

## 7. Docs sync

- `docs/status/PROJECT_PROGRESS.md`:
  - Trạng thái hiện tại → Prompt 10A; rủi ro raw SQL unsafe → **Closed**.
  - Bảng Phase: **Phase 18 — RAG/raw SQL hardening** đổi từ Planned → **Done** (Prompt 09/09B/09C PASS + 10A PASS WITH WARNINGS).
  - Phase 20 DevOps đánh dấu **next** (Prompt 10B), kèm follow-up drift `knowledge_base.embedding`.
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`: thêm block Prompt 10A; mark seed unsafe raw SQL **Closed**; giữ lịch sử cũ.
- `docs/roadmap/REFACTOR_PLAN.md`: thêm section Prompt 10A; Next = Prompt 10B; giữ section 09C.

## 8. Remaining unsafe raw SQL

- `backend/src/infrastructure/repositories/README.md:5` — **documentation-only**, không phải runtime code.
- Không còn `$queryRawUnsafe`/`$executeRawUnsafe` trong `backend/src` runtime hay `backend/scripts`.

## 9. Không thay đổi

- Không mở/in `.env` thật; không in secret/token/password/DATABASE_URL đầy đủ.
- Không sửa Prisma schema/migrations, không `db push`, không migration, không reset DB.
- Không sửa package/Dockerfile/start-all/stop-all/DevOps lớn.
- Không sửa dashboard UI/auth, RAG, analytics route, tenant handoff source.
- Không đổi dữ liệu seed mặc định; không thêm dependency; không tạo PrismaClient mới (dùng instance sẵn có của seed).
- Không chạy seed thật; không gọi external Facebook/Telegram/Gemini/Jina/Claude/DeepSeek.
- Không push remote.

## 10. Final verdict

**PASS WITH WARNINGS**

- PASS: `$queryRawUnsafe` trong `backend/scripts/seed.js` đã loại bỏ; static validation + scan sạch; behavior bảo toàn (parity verified).
- WARNING: drift tiền tồn tại `knowledge_base.embedding` NOT NULL (DB) vs `Unsupported("vector")?` nullable (schema) khiến insert knowledge_base của seed fail bất kể raw SQL hay Prisma. Ngoài phạm vi 10A (không sửa schema/migration) — chuyển Prompt 10B/DevOps.

## 11. Next step

- **Prompt 10B — DevOps/deploy hardening**, đồng thời đồng bộ drift `knowledge_base.embedding` (schema vs DB) để seed knowledge_base insert hoạt động lại; mục tiêu: pipeline deploy an toàn + seed data chạy được không lỗi constraint.
