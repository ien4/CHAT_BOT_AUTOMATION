# PROJECT PROGRESS — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-08
Trạng thái hiện tại: **sẵn sàng cho Prompt 05C — Backend API route/controller split next small group**
Lưu ý bắt buộc: các prompt 03 đến 05B mới đạt **Static validation pass — chưa runtime verified**.

## 1. Nguyên tắc cập nhật

- Sau mỗi prompt hoàn thành, phải tick checklist tương ứng trong file này và tạo report riêng trong `report/`.
- Không tick hạng mục runtime nếu chỉ mới có syntax/type/build validation.
- Nếu một phần chỉ là architecture shell/static validation, phải ghi rõ “Static validation pass — chưa runtime verified”.
- Không gom nhiều refactor rủi ro vào một prompt.
- Không sửa webhook, tenant handoff, RAG, Prisma schema/migrations hoặc DevOps script nếu prompt không cho phép rõ.
- Không đọc `.env` thật; chỉ dùng `.env.example` để mapping tên biến.
- Khi có commit mới, ghi hash vào lịch sử prompt và validation history.

## 2. Tổng quan trạng thái

| Phase | Trạng thái | Ghi chú |
|---|---|---|
| Phase 01 — Project audit | ✅ Done | Prompt 01 — read-only audit, không sửa source |
| Phase 02 — Safety gate | ✅ Done | Prompt 02 blocked đúng guardrail; Prompt 02B đã tạo Git checkpoint |
| Phase 03 — Progress/checklist foundation | ✅ Done | Prompt 02A tạo progress/checklist/report |
| Phase 04 — Baseline validation | ✅ Done with warnings | `npm ci`, backend syntax, Prisma validate dummy, dashboard typecheck/build pass; còn quality/security warnings |
| Phase 05 — Architecture shell | ✅ Done with warnings | Prompt 03, static validation pass — chưa runtime verified |
| Phase 06 — Config hardening/env policy | ✅ Done with warnings | Prompt 04, validation pass — chưa runtime verified |
| Phase 07 — Backend API route/controller split | ✅ Done with warnings | Prompt 05 tách nhóm route đầu tiên; static validation pass — chưa runtime verified |
| Phase 08 — Backend API route/controller split tiếp theo | ✅ Done with warnings | Prompt 05B tách `GET /settings/telegram-destinations`; static validation pass — chưa runtime verified |
| Phase 09 — Backend API route/controller split tiếp theo | 🟡 Next | Prompt 05C tiếp tục tách nhóm route nhỏ |
| Phase 10 — Repository layer | ⬜ Planned | Prompt 06 |
| Phase 11 — Tenant safety audit | ⬜ Planned | Prompt 07 |
| Phase 12 — RAG/raw SQL hardening | ⬜ Planned | Prompt 08 |
| Phase 13 — Dashboard feature split | ⬜ Planned | Prompt 09 |
| Phase 14 — DevOps/deploy hardening | ⬜ Planned | Prompt 10 |

## 3. Checklist chi tiết theo Prompt

### Prompt 01 — Project audit + clean architecture mapping

- [x] Đọc tree dự án.
- [x] Audit backend.
- [x] Audit dashboard.
- [x] Audit Prisma/Docker/scripts.
- [x] Xác định rủi ro mixed architecture.
- [x] Tạo report Prompt 01: `report/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md`.
- [x] Không sửa source runtime.
- [x] Không đọc `.env` thật.

Trạng thái: **PASS**.
Commit: chưa có Git repository tại thời điểm Prompt 01.

### Prompt 02 — Controlled clean architecture reorganization

- [x] Preflight safety gate.
- [x] Phát hiện thiếu `.git`.
- [x] Dừng đúng guardrail.
- [x] Tạo report blocked: `report/PROMPT_02_BLOCKED_NEED_GIT_CHECKPOINT.md`.
- [x] Không sửa source runtime.
- [x] Không chạy dependency install, migration, Docker hoặc start script.

Trạng thái: **BLOCKED đúng quy trình**.
Commit: chưa có Git repository tại thời điểm Prompt 02.

### Prompt 02A — Project progress + audit checklist

- [x] Tạo `docs/PROJECT_PROGRESS.md`.
- [x] Tạo `docs/FEATURE_AUDIT_CHECKLIST.md`.
- [x] Tạo report Prompt 02A: `report/PROMPT_02A_PROJECT_PROGRESS_AND_AUDIT_PLAN_REPORT.md`.
- [x] Tổng hợp roadmap an toàn trước refactor.
- [x] Không sửa source runtime.

Trạng thái: **PASS WITH WARNINGS** vì dự án vẫn thiếu Git checkpoint/dependencies/baseline validation tại thời điểm đó.
Commit: chưa có Git repository tại thời điểm Prompt 02A.

### Prompt 02B — Safety foundation + baseline validation

- [x] `git init`.
- [x] Cập nhật `.gitignore` để bảo vệ `.env`, dependency, build artifact, logs, uploads.
- [x] Tạo Git checkpoint.
- [x] Commit baseline `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca`.
- [x] `backend npm ci`.
- [x] `dashboard npm ci`.
- [x] Backend syntax check pass.
- [x] Prisma validate pass với `DATABASE_URL` dummy.
- [x] Dashboard `tsc --noEmit` pass.
- [x] Dashboard build pass.
- [x] Ghi warnings còn lại vào report Prompt 02B.
- [x] Không sửa source runtime.

Trạng thái: **PASS WITH WARNINGS**.
Warnings chính: backend chưa có lint/typecheck thật, dashboard lint chưa cấu hình không tương tác, npm audit vulnerabilities còn mở, `$queryRawUnsafe`, default credential/fallback, hard-code localhost và DevOps script rủi ro còn tồn tại.

### Prompt 03 — Architecture shell refactor

- [x] Tạo backend shell `domain/application/infrastructure/presentation`.
- [x] Tạo README layer/folder chính.
- [x] Tạo backend Prisma wrapper.
- [x] Tạo backend config helper.
- [x] Tạo dashboard shell `features/components/lib/config/lib/api`.
- [x] Tạo dashboard env/API helper.
- [x] Gom một số hard-code dashboard về helper fallback.
- [x] Tạo `docs/ARCHITECTURE.md`.
- [x] Tạo `docs/REFACTOR_PLAN.md`.
- [x] Backend syntax validation pass.
- [x] Prisma validate dummy pass.
- [x] Dashboard typecheck pass.
- [x] Dashboard build pass.
- [x] Commit `24ac487d1b406f06650ca942efb311619e6a7c47`.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Không đổi Prisma schema, migrations, public route, webhook URL, tenant handoff, RAG pipeline hoặc bot engine.

### Prompt 04 — Config hardening + localhost cleanup + env policy

- [x] Mở rộng backend config helper.
- [x] Chuẩn hóa dashboard env helper.
- [x] Gom Chatwoot/settings/Telegram dashboard URL về helper.
- [x] Tạo `docs/ENV_POLICY.md`.
- [x] Cập nhật `backend/.env.example`.
- [x] Tạo `dashboard/.env.example`.
- [x] Cập nhật `docs/ARCHITECTURE.md`.
- [x] Cập nhật `docs/REFACTOR_PLAN.md`.
- [x] Cập nhật `docs/FEATURE_AUDIT_CHECKLIST.md`.
- [x] Tạo report Prompt 04: `report/PROMPT_04_CONFIG_HARDENING_LOCALHOST_ENV_POLICY_REPORT.md`.
- [x] Backend validation pass.
- [x] Dashboard validation pass.
- [x] Commit `25f3bb79e419590fb14540a82f28efe6482d980f`.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. DevOps scripts, Dockerfile và stale webhook URL file chỉ được scan read-only, chưa sửa.

### Prompt 04A — Rewrite project progress + checklist before Prompt 05

- [x] Preflight Git.
- [x] Xác nhận commit Prompt 04 `25f3bb79e419590fb14540a82f28efe6482d980f`.
- [x] Đọc toàn bộ report/docs bắt buộc.
- [x] Rewrite `docs/PROJECT_PROGRESS.md`.
- [x] Cập nhật `docs/FEATURE_AUDIT_CHECKLIST.md`.
- [x] Tạo report `report/PROMPT_04A_PROJECT_PROGRESS_REWRITE_REPORT.md`.
- [x] Chỉ sửa docs/report.
- [ ] Runtime verification — không thuộc phạm vi Prompt 04A.

Trạng thái: **PASS — ready for Prompt 05 backend route split** nếu validation docs-only và commit pass.

### Prompt 05 — Backend API route/controller split

- [x] Preflight Git.
- [x] Xác nhận working tree không có source runtime change không rõ nguồn.
- [x] Route map trước khi tách bằng scan `router.get/post/put/delete`.
- [x] Chọn domain nhỏ ít rủi ro: `GET /settings/webhook`.
- [x] Tạo route/controller wrapper.
- [x] Giữ public route/response contract.
- [x] Không sửa webhook, tenant handoff, RAG, Prisma schema/migrations.
- [x] Backend syntax validation sau refactor.
- [x] Prisma validate dummy.
- [x] Không sửa dashboard frontend.
- [x] Tạo report Prompt 05.
- [x] Commit Prompt 05 nếu pass.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Public route `/api/settings/webhook`, method, auth middleware và response shape không đổi.

### Prompt 05B — Backend API route/controller split phase 2

- [x] Preflight Git.
- [x] Xác nhận commit Prompt 05 `c860ca416a3439dfc7b72bc1e9d9f5ab3cba5af0`.
- [x] Đọc docs/report bắt buộc và module settings từ Prompt 05.
- [x] Baseline validation trước thay đổi pass.
- [x] Route map update trước khi tách.
- [x] Chọn route nhỏ ít rủi ro: `GET /settings/telegram-destinations`.
- [x] Mở rộng controller/routes settings đã có.
- [x] Truyền `prisma` qua `createSettingsRoutes`.
- [x] Gỡ block GET tương ứng khỏi `backend/src/api/dashboard.js`.
- [x] Giữ public route/response contract.
- [x] Không sửa webhook, tenant handoff, RAG, Prisma schema/migrations.
- [x] Backend syntax validation sau refactor.
- [x] Prisma validate dummy.
- [x] Không sửa dashboard frontend.
- [x] Tạo report Prompt 05B.
- [x] Commit Prompt 05B nếu pass.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Public route `/api/settings/telegram-destinations`, method, auth middleware, Prisma query, status code và response shape không đổi.

## 4. Next planned prompts

| Prompt | Tên | Mục tiêu | Tool nên dùng |
|---|---|---|---|
| Prompt 05C | Backend API route/controller split next small group | Tách thêm một route/nhóm route nhỏ khỏi `backend/src/api/dashboard.js`, ưu tiên read-only và không external side effect | Codex |
| Prompt 06 | Repository layer cho Prisma | Đưa Prisma access dần vào repositories, không đổi schema sau khi route split đủ nhỏ | Codex |
| Prompt 07 | Tenant safety audit | Trace tenant scope, không sửa lớn nếu chưa chắc | Codex |
| Prompt 08 | RAG/raw SQL hardening | Audit `$queryRawUnsafe`, pgvector query và input source | Codex |
| Prompt 09 | Dashboard feature split | Tách page lớn thành features/components, giữ route/UI behavior | Claude Code hoặc Codex |
| Prompt 10 | DevOps/deploy hardening | Script, Docker, migration policy, CI/deploy env | Codex |

## 5. Rủi ro đang mở

| Rủi ro | Trạng thái | Ưu tiên | Prompt xử lý |
|---|---|---|---|
| `backend/src/api/dashboard.js` quá lớn | Open | P0 | Prompt 05C |
| `$queryRawUnsafe` | Open | P0 | Prompt 08 |
| Tenant scope chưa runtime verified | Open | P0 | Prompt 07 |
| Default credential/fallback | Open | P0 | Prompt riêng sau env policy |
| `start-all.bat` có `db push --accept-data-loss` | Open | P0 | Prompt 10 |
| Container start chạy `prisma migrate deploy` | Open | P0 | Prompt 10 |
| Runtime verification chưa chạy | Open | P0 | Sau khi route split an toàn |
| Backend chưa có lint/typecheck thật | Open | P1 | Prompt quality gate riêng |
| Dashboard lint chưa cấu hình | Open | P1 | Prompt quality gate riêng |
| npm audit vulnerabilities | Open | P1 | Prompt security deps riêng |
| Hard-code localhost trong script/root | Open | P1 | Prompt 10 |
| `webhook-urls-current.txt` có thể stale | Open | P1 | Prompt 10 |
| `chatwoot/` folder không tồn tại ở root | Open | P1 | Prompt 10 |

## 6. Decision log

| Quyết định | Lý do | Prompt |
|---|---|---|
| Không refactor khi chưa có Git checkpoint | Tránh mất điểm rollback | Prompt 02 |
| Tạo Git checkpoint trước khi cài dependency/refactor | Có baseline khôi phục an toàn | Prompt 02B |
| Dùng `DATABASE_URL` dummy cho Prisma validate | Validate schema mà không đọc `.env` thật hoặc connect DB thật | Prompt 02B+ |
| Chỉ tạo architecture shell ở Prompt 03 | Tránh phá webhook/RAG/tenant/handoff | Prompt 03 |
| Không sửa webhook/tenant/RAG trong Prompt 03/04 | Rủi ro behavior cao, cần regression checklist | Prompt 03/04 |
| Gom config trước khi tách route | Giảm hard-code và chuẩn bị route split | Prompt 04 |
| Không sửa DevOps script trong Prompt 04 | Script có migration/db push/tunnel risk, cần prompt riêng | Prompt 04 |
| Prompt 05 chỉ tách domain nhỏ | Tránh rewrite `dashboard.js` quá rộng | Prompt 05 planned |
| Prompt 05B tiếp tục chọn route settings read-only | Giữ blast radius nhỏ, không đụng write route hoặc external side effect | Prompt 05B |

## 7. Validation history

| Mốc | Backend syntax | Prisma validate dummy | Dashboard typecheck | Dashboard build | Runtime verification | Commit hash |
|---|---|---|---|---|---|---|
| Prompt 01 | Not run | Not run | Not run | Not run | Not run | Không có Git |
| Prompt 02 | Not run | Not run | Not run | Not run | Not run | Không có Git |
| Prompt 02A | Not run | Not run | Not run | Not run | Not run | Không có Git |
| Prompt 02B | PASS | PASS | PASS | PASS | Not run | `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` |
| Prompt 03 | PASS | PASS | PASS | PASS | Not run | `24ac487d1b406f06650ca942efb311619e6a7c47` |
| Prompt 04 | PASS | PASS | PASS | PASS | Not run | `25f3bb79e419590fb14540a82f28efe6482d980f` |
| Prompt 04A | Docs-only diff validation | Not applicable | Not applicable | Not applicable | Not applicable | `cea82b1993abf46a7f732991c24e7d532dd2f347` |
| Prompt 05 | PASS | PASS | Not run | Not run | Not run | `c860ca416a3439dfc7b72bc1e9d9f5ab3cba5af0` |
| Prompt 05B | PASS | PASS | Not run | Not run | Not run | Ghi sau commit Prompt 05B |

Ghi chú: “PASS” ở các mốc trên là static validation/build validation, không đồng nghĩa runtime smoke test đã pass.

## 8. Tool routing

| Tool | Việc nên dùng |
|---|---|
| Codex | Refactor backend, repository layer, config/env policy, DevOps hardening, validation, Git commit, báo cáo kỹ thuật. |
| Claude Code | Dashboard feature split, UI flow phức tạp, frontend component refactor lớn nếu cần thao tác nhiều UI state. |
| Claude Design | Chỉ dùng khi cần redesign visual/mockup, layout mới hoặc thiết kế giao diện trước khi code. |
| ChatGPT | Tạo prompt, review report, lập kế hoạch, tổng hợp quyết định và checklist. |

## 9. Bước tiếp theo rõ ràng

Bước tiếp theo: **Prompt 05B — Backend API route/controller split next group**.

Mục tiêu Prompt 05B:

- Tách thêm một nhóm route nhỏ ít rủi ro khỏi `backend/src/api/dashboard.js`.
- Giữ nguyên public route, HTTP method, middleware, auth behavior và response contract.
- Tạo route/controller wrapper theo shell `backend/src/presentation/http`.
- Chạy validation sau thay đổi.
- Tạo report Prompt 05 và commit nếu pass.

Điều kiện bắt buộc:

- Không đụng webhook handlers.
- Không đụng tenant handoff.
- Không đụng RAG pipeline.
- Không đụng Prisma schema/migrations.
- Không sửa Dockerfile/scripts.
- Không chạy migration/db push/Docker/start script.
- Nếu chưa có runtime smoke test, ghi rõ **Static validation pass — chưa runtime verified**.
