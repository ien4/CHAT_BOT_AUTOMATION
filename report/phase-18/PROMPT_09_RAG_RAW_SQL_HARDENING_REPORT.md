# PROMPT 09 — RAG RAW SQL HARDENING REPORT

## 1. Mục tiêu

Audit raw SQL toàn backend và harden đường RAG/knowledge trước: vector safety, `$queryRawUnsafe`, tenant scope cho upload/scrape/reindex, và guard SSRF cơ bản cho scrape URL.

## 2. Raw SQL risk map

| File | Query/function | Input source | Tenant scope | Risk | Action |
|---|---|---|---|---|---|
| `backend/src/rag/pipeline.js` | `search()` vector query | embedding provider, query intent, tag filter, tenantId | tenant/global filter | P0 trước patch | Chuyển sang `$queryRaw`, validate vector, sanitize tag/limit/threshold. |
| `backend/src/rag/pipeline.js` | `addDocument()` insert embedding | dashboard/upload/scrape/bot admin input | truyền tenantId | P0 trước patch | Chuyển sang `$queryRaw`, vector literal chỉ từ numeric array đã assert. |
| `backend/src/rag/pipeline.js` | `updateDocument()` update embedding | dashboard/tenant knowledge input | route guard trước khi gọi | P0 trước patch | Chuyển sang `$executeRaw`, parameterized all fields. |
| `backend/src/api/dashboard.js` | `/knowledge` fallback insert | request body | `getTenantScope(req)` | P0 trước patch | Chuyển sang `$queryRaw`, dùng fallback vector vì DB NOT NULL. |
| `backend/src/api/dashboard.js` | `/knowledge/reindex` select/update | platform admin, `all`, `tenantScope` | `tenantScope` optional | P1 trước patch | Chuyển sang `$queryRaw/$executeRaw`, dùng helper vector. |
| `backend/src/api/dashboard.js` | analytics raw SQL | `days` query -> Date | platform admin only | P1/P2 | Audit-only, backlog 09B. |
| `backend/src/tenants/handoff.js` | handoff daily stats raw SQL | tenantId, period | tenant handoff scope | P1 | Audit-only, cần prompt handoff riêng. |
| `backend/scripts/seed.js` | seed insert raw SQL | internal seed data | internal/global | P2 | Audit-only, xử lý khi harden scripts. |

## 3. Source files changed

- `backend/src/rag/pipeline.js`
- `backend/src/rag/docParser.js`
- `backend/src/api/dashboard.js`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`

## 4. RAG/vector hardening

- Thêm `assertEmbeddingVector(vector, expectedDimension = 768)`.
- Thêm `toPgVectorLiteral()` chỉ nhận numeric array đã validate.
- Thêm clamp `sanitizeSearchLimit()` và `sanitizeSimilarityThreshold()`.
- RAG search dùng vector parameter cast `${vectorLiteral}::vector`.
- Add/update/reindex dùng `$queryRaw`/`$executeRaw` tagged template, không còn tự nối SQL với user input.
- DB local đang có `embedding NOT NULL`, nên fallback khi provider lỗi dùng zero-vector placeholder đã validate; vector search lọc similarity không hữu hạn để placeholder không lọt vào kết quả.

## 5. Tenant scope hardening

- `/knowledge/upload` truyền `tenantId` từ `getTenantScope(req)` vào `ragPipeline.addDocument`.
- `/knowledge/scrape` truyền `tenantId` từ `getTenantScope(req)`.
- `/knowledge/reindex` là platform-admin route nhưng tôn trọng `tenantScope` nếu có.
- `rag.search()` giữ logic tenant-specific + global, và smoke xác nhận không leak sang tenant khác.

## 6. Scrape/upload safety

- `docParser.validateScrapeUrl()` chỉ cho `http:` và `https:`.
- Chặn `file:`, localhost, `127.0.0.0/8`, `0.0.0.0`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, link-local và một số IPv6 local/private literal.
- Không fetch URL internet thật trong smoke.
- Upload route có multer size limit sẵn; multipart HTTP smoke chưa chạy vì không thêm dependency.

## 7. Validation

- `node --check src/index.js`: PASS.
- `node --check src/db.js`: PASS.
- `node --check src/api/dashboard.js`: PASS.
- `node --check src/rag/pipeline.js`: PASS.
- `node --check src/rag/docParser.js`: PASS.
- `node --check src/bot/tools.js`: PASS.
- `node --check src/bot/engine.js`: PASS.
- `node --check src/llm/jina.js`: PASS.
- `npx prisma validate`: PASS.
- Dashboard `npx --no-install tsc --noEmit`: PASS.
- `git diff --check`: PASS, chỉ còn warning CRLF/LF của Git trên Windows.

## 8. Runtime smoke

- Auth regression smoke: PASS 6/6.
- RAG helper smoke: PASS, vector dimension 768, reject NaN/Infinity/string, clamp limit/threshold.
- Scrape guard smoke: PASS, reject `file:///etc/passwd`, localhost và private IP literal trước fetch.
- DB RAG smoke: PASS, tạo 3 row `test-09-*`, add/update/query vector parameterized, tenant fallback scope đúng, cleanup leftover = 0.
- `rag.search()` smoke: PASS, tenant vector row trả đúng tenant và không leak sang tenant khác, cleanup leftover = 0.
- Không gọi Gemini/Jina/Facebook/Telegram thật; embedding được monkeypatch trong smoke.

## 9. Remaining unsafe/raw SQL exceptions

- `backend/src/api/dashboard.js` analytics còn 4 `$queryRawUnsafe`; hiện dùng positional parameter cho `sinceDate`, platform-admin only, nhưng vẫn nên chuyển sang `$queryRaw` ở Prompt 09B.
- `backend/src/tenants/handoff.js` còn `$queryRawUnsafe`; không sửa vì Prompt 09 không rewrite tenant handoff.
- `backend/scripts/seed.js` còn `$queryRawUnsafe`; internal script, không chạy runtime.
- `backend/src/infrastructure/repositories/README.md` chỉ nhắc text `$queryRawUnsafe`, không phải code runtime.

## 10. Không thay đổi

- Không sửa `.env` hoặc `.env.local`.
- Không sửa Prisma schema/migrations.
- Không chạy `prisma db push`.
- Không gọi external provider thật.
- Không sửa dashboard UI/auth/session.
- Không sửa webhook/direct Facebook.
- Không sửa tenant handoff logic.
- Không sửa package, Dockerfile hoặc scripts.
- Không push remote.

## 11. Final verdict

PASS WITH WARNINGS

Lý do warning: raw unsafe ngoài RAG runtime vẫn còn ở analytics/handoff/seed và upload multipart chưa smoke HTTP.

## 12. Next step

Prompt tiếp theo nên là Prompt 09B: analytics raw SQL hardening. Mục tiêu là chuyển 4 query analytics trong `backend/src/api/dashboard.js` sang `$queryRaw` tagged template, sanitize `days`, và smoke `/api/analytics` với token platform admin.
