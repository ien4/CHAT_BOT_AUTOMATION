# PROMPT 10B — DEVOPS DEPLOY HARDENING + EMBEDDING DRIFT REPORT

Ngày: 2026-07-10
Branch: `chore/prompt-05r-docs-local-run`
Base commit: `19a06d6 Clean seed raw SQL safety`

## 1. Mục tiêu

- Xử lý drift `knowledge_base.embedding` giữa DB local/test và Prisma schema an toàn.
- Cho phép seed/insert knowledge_base content-first không lỗi constraint (kiểm thử cô lập, không chạy full seed).
- Hardening DevOps/deploy trước public: bỏ `db push --accept-data-loss`, tách migration khỏi container startup, viết checklist backup/migrate/rollback.
- Không sửa business runtime/dashboard UI/RAG/analytics/handoff; không gọi external; không push remote.

## 2. Preflight

- Branch `chore/prompt-05r-docs-local-run` (không master/main).
- Commit `19a06d6` tồn tại; working tree sạch (chỉ ignored env/node_modules/backups).
- `backend/.env`, `dashboard/.env.local` ignored & không tracked.

## 3. Embedding drift audit

| Nguồn | Trạng thái embedding | Ghi chú |
|---|---|---|
| Prisma schema | `Unsupported("vector")?` (nullable) | `backend/prisma/schema.prisma` model `KnowledgeBase`. |
| DB local/test | NOT NULL, type vector, no default | `information_schema`: `is_nullable=NO`. 0 rows, 0 null. |
| Migration history | Init tạo `"embedding" vector(768) NOT NULL` | `20260610025032_init/migration.sql`; chưa có migration sync sang nullable → drift. |
| Index phụ thuộc | Không có vector index | Chỉ `knowledge_base_pkey`, `knowledge_base_tenant_id_idx`. |
| RAG code expectation | Tolerate null | `rag/pipeline.js` search có `AND embedding IS NOT NULL`; add-path dùng fallback vector nên không insert null. |
| Seed expectation | Cần insert không embedding | `scripts/seed.js` (Prompt 10A) `knowledgeBase.create()` không set embedding. |

**Nguyên nhân**: init migration tạo cột NOT NULL; sau đó schema Prisma được sửa thành nullable nhưng KHÔNG sinh migration tương ứng → DB và schema lệch nhau. Seed/insert content-first vì thế fail NOT NULL.

## 4. Drift strategy selected

**OPTION A — DB align theo schema nullable.** Lý do:
- Schema Prisma đã nullable.
- Seed cần insert nội dung trước khi có embedding/reindex.
- RAG search đã bỏ qua null embedding (`embedding IS NOT NULL`); add-path dùng fallback vector.
- Không có code yêu cầu embedding NOT NULL tuyệt đối.
- DB có 0 rows, 0 vector index → DROP NOT NULL an toàn tuyệt đối.

Không chọn OPTION B (giữ NOT NULL) vì sẽ buộc mọi insert phải có embedding (chèn fallback vector khắp nơi), phức tạp và trái thiết kế "content-first, reindex sau".

## 5. Migration/DB changes

- Migration mới: `backend/prisma/migrations/20260710154312_align_knowledge_embedding_nullable/migration.sql`.
- Nội dung tối thiểu:
  ```sql
  ALTER TABLE "knowledge_base" ALTER COLUMN "embedding" DROP NOT NULL;
  ```
- Apply local/test: `npx prisma migrate deploy` → "All migrations have been successfully applied".
- Sau apply: `information_schema` xác nhận `embedding is_nullable = YES`.
- Không đụng migration lịch sử, không drop table/index, không `db push`, không reset, không production.
- Lưu ý: `npx prisma generate` báo EPERM (query_engine DLL bị lock bởi backend đang chạy trên :3001) — không phải lỗi schema; client cũ vẫn nguyên, `prisma validate` PASS và drift smoke chạy Prisma create OK.

## 6. Backup

- File: `backups/prompt-10b-before-embedding-drift-fix-20260710154312.dump` (pg_dump custom-format từ `bbotech-pgvector-local`).
- Verify: tồn tại, size 43488 bytes > 0, `pg_restore -l` đọc được TOC (100 entries).
- **Không stage/commit** (đã xác nhận `git check-ignore` khớp `backups/`).

## 7. Drift smoke test

Smoke cô lập (script tạm `backend/_smoke_10b.js`, đã xóa), không chạy full seed, không external:

PASS 9/9:
1. Insert `knowledge_base` KHÔNG embedding thành công.
2–6. Read lại đúng title/content(parameterized `O'Brien`)/category/sourceType/isActive.
7. `embedding IS NULL` trong DB (content-first).
8. `findMany` list không crash với null embedding.
9. Cleanup `test-10b-*` leftover = 0.

Regression backend :3001:
- `GET /health` → 200.
- `GET /webhook` (no token) → 403.
- `POST /chatwoot-webhook` → 404 (No-Chatwoot).

## 8. DevOps script audit

| File | Risk | Action |
|---|---|---|
| `start-all.bat:138` | `prisma db push --accept-data-loss` (destructive) | Thay bằng `prisma migrate deploy` + guard banner LOCAL ONLY |
| `start-all.bat` (Chatwoot/cloudflared/ngrok/admin123 text) | Legacy No-Chatwoot, không destructive | Ngoài scope rewrite; giữ nguyên + banner cảnh báo |
| `backend/Dockerfile:24` | CMD auto `migrate deploy` lúc startup | Tách: CMD `node src/index.js`, migration là release step |
| `docker-compose.yml` | Không destructive (env_file `.env`) | Không đổi; `docker compose config` valid |
| `webhook-urls-current.txt` | Stale Chatwoot/localhost/ngrok, sai flow | Warning header + trỏ direct `/webhook` + docs |
| `dashboard/Dockerfile` | Không migration, production runner OK | Không đổi |
| `stop-all.bat` | `docker compose down` chatwoot, không destructive app DB | Không đổi |

## 9. DevOps changes

- `start-all.bat`: guard banner LOCAL ONLY / DO NOT USE FOR PRODUCTION / NEVER db push; `db push --accept-data-loss` → `migrate deploy`.
- `backend/Dockerfile`: CMD `["node","src/index.js"]`; comment chỉ dẫn migration release step.
- `webhook-urls-current.txt`: header cảnh báo local/stale + direct `/webhook` No-Chatwoot + trỏ docs.
- `docs/DEPLOYMENT_POLICY.md` + `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` mới.

## 10. Validation

- Backend `node --check` (index/db/dashboard/rag pipeline/tenant handoff/seed) PASS.
- `npx prisma validate` PASS.
- Dashboard `npx --no-install tsc --noEmit` exit 0.
- `docker compose config` valid.
- Scan `db push|accept-data-loss`: không còn executable trong scripts/Docker; còn lại chỉ docs/reports/comment historical.
- `git diff --check`: chỉ warning CRLF/LF Windows.
- Drift smoke 9/9 + regression 3/3 PASS.

## 11. Production rollout policy

- Runtime container chỉ chạy app; migration = release step `docker compose run --rm backend npx prisma migrate deploy` sau backup.
- Không `db push`, không `--accept-data-loss`, không auto-migrate startup.
- Webhook production = direct `GET/POST /webhook` (không `/api/settings/webhook`, không `/chatwoot-webhook`).
- Env production bắt buộc; rollback = restore backup + redeploy image.
- Chi tiết: `docs/DEPLOYMENT_POLICY.md`, `docs/PRODUCTION_ROLLOUT_CHECKLIST.md`.

## 12. Không thay đổi

- Không sửa dashboard UI/auth, RAG pipeline, analytics route, tenant handoff, direct Facebook webhook, bot engine/tools.
- Không sửa package files, migration lịch sử; không xóa backup.
- Không mở/in `.env` thật, DATABASE_URL đầy đủ, token/password/JWT/FB-TG key.
- Không `db push`/`--accept-data-loss`/reset DB; không `docker compose up`/`start-all.bat`/full seed thật.
- Không apply production; không push remote.

## 13. Remaining risks

- Production rollout thật chưa chạy (theo thiết kế — cần release step + backup prod).
- `start-all.bat` vẫn mang flow Chatwoot legacy (không destructive) — dọn kiến trúc để prompt riêng nếu muốn.
- `docker-compose.yml` build backend nhưng không auto-migrate nữa → first-run cần chạy migrate release step (đã ghi trong docs).
- Quality gate/lint non-interactive chưa có (Prompt 10C).

## 14. Final verdict

**PASS**

- Drift `knowledge_base.embedding` fix an toàn (OPTION A, backup, migrate deploy local, smoke 9/9).
- DevOps destructive `db push --accept-data-loss` CLOSED; Docker migration tách khỏi startup; deploy docs đầy đủ.
- Static + regression validation PASS. Không stage env/backup/temp.

## 15. Next step

- **Prompt 10C** — quality gate/lint non-interactive (backend + dashboard) + production smoke checklist thực thi; hoặc **Prompt 19** — dashboard feature split nếu DevOps đã đủ sạch. Mục tiêu: đưa lint/typecheck vào validation gate và chuẩn hóa smoke trước khi public thật.
