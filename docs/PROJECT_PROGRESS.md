# PROJECT PROGRESS — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-08
Trạng thái hiện tại: **Prompt 05D-FIX đã hoàn tất — sửa `prisma.handoffSettings` → `prisma.handoffSetting`, bỏ field Prisma không tồn tại `botGracePeriodSeconds` khỏi payload `HandoffSetting`; `GET` và `PUT /api/settings/handoff` runtime PASS trên DB local/test.**
Lưu ý bắt buộc: các prompt 03 đến 05D-FIX đạt **Static validation pass**. Prompt 05D-FIX đã **runtime verified** `GET /api/settings/webhook`, `GET /api/settings/telegram-destinations`, `GET /api/prompts`, `GET /api/settings/handoff`, `PUT /api/settings/handoff` (auth 401 khi thiếu token; 200 + shape đúng khi có token). Các route/khu vực khác vẫn chưa runtime verified.

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
| Phase 09 — Backend API route/controller split tiếp theo | ✅ Done with warnings | Prompt 05C tách `GET /prompts`; static validation pass — chưa runtime verified |
| Phase 10 — Runtime smoke test route đã tách | ✅ Done | Prompt 05R-ENV: runtime smoke test PASS cho 3 route trên DB local/test tạm (env + Docker Postgres dùng một lần, đã dọn) |
| Phase 10b — Settings route split tiếp | ✅ Done with warnings | Prompt 05D tách `GET /settings/handoff` (behavior giữ nguyên); phát hiện bug pre-existing accessor cần Prompt 05D-FIX |
| Phase 10c — Handoff settings accessor fix | ✅ Done | Prompt 05D-FIX sửa accessor + Prisma payload schema compatibility; `GET/PUT /settings/handoff` runtime PASS |
| Phase 11 — Repository layer | ⬜ Planned | Prompt 06 (đã mở khóa sau 05R runtime PASS) |
| Phase 12 — Tenant safety audit | ⬜ Planned | Prompt 07 |
| Phase 13 — RAG/raw SQL hardening | ⬜ Planned | Prompt 08 |
| Phase 14 — Dashboard feature split | ⬜ Planned | Prompt 09 |
| Phase 15 — DevOps/deploy hardening | ⬜ Planned | Prompt 10 |

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

### Prompt 05C — Backend API route/controller split phase 3

- [x] Preflight Git.
- [x] Xác nhận commit Prompt 05B `29a97a6c3950dc73219bcf91b74b373614ff4d28`.
- [x] Đọc docs/report bắt buộc và route map hiện tại.
- [x] Baseline validation trước thay đổi pass.
- [x] Route map update trước khi tách.
- [x] Chọn route nhỏ ít rủi ro: `GET /prompts`.
- [x] Tạo `prompts.controller.js`.
- [x] Tạo `prompts.routes.js`.
- [x] Mount `/prompts` tại đúng vị trí route cũ.
- [x] Gỡ block `GET /prompts` khỏi `backend/src/api/dashboard.js`.
- [x] Giữ public route/response contract.
- [x] Không sửa webhook, tenant handoff, RAG, bot engine, Prisma schema/migrations.
- [x] Backend syntax validation sau refactor.
- [x] Prisma validate dummy.
- [x] Không sửa dashboard frontend.
- [x] Tạo report Prompt 05C.
- [x] Commit Prompt 05C nếu pass.
- [ ] Runtime verification — chưa chạy.

Trạng thái: **PASS WITH WARNINGS**.
Ghi chú: **Static validation pass — chưa runtime verified**. Public route `/api/prompts`, method, auth middleware, tenant scope, Prisma query, status code và response shape không đổi.

### Prompt 05R — Feature inventory + local run readiness + runtime smoke test

- [x] Preflight Git; xác nhận commit Prompt 05C `5e51bf7eea53305b4800c1449f4dc60caf885f46` tồn tại.
- [x] Đọc docs/report/config/scripts bắt buộc; không đọc `.env` thật.
- [x] Tạo `docs/FEATURE_INVENTORY.md` (9 nhóm chức năng, không đánh dấu runtime PASS).
- [x] Tạo `docs/LOCAL_RUN_GUIDE.md` (trạng thái, cách chạy an toàn, checklist thủ công).
- [x] Kiểm tra readiness read-only: node/npm, node_modules, tồn tại `.env` (không mở nội dung).
- [x] Static validation: backend `node --check` toàn bộ file trọng yếu PASS; `prisma validate` dummy PASS; dashboard `tsc --noEmit` PASS; `next build` PASS.
- [x] Runtime smoke readiness check theo Phase 4.
- [ ] Runtime smoke test 3 route — **BLOCKED**: thiếu `backend/.env` local/test và DB local/test; không có token test an toàn.
- [x] Tạo report `report/PROMPT_05R_FEATURE_INVENTORY_LOCAL_RUN_RUNTIME_SMOKE_REPORT.md`.
- [x] Không sửa source runtime/schema/webhook/RAG/tenant handoff/DevOps script.

Trạng thái: **BLOCKED — needs local/test env** (tại thời điểm 05R). Docs/readiness/static validation hoàn tất; runtime chưa verify khi đó.
Điều kiện còn thiếu khi đó: `backend/.env` + `dashboard/.env.local` local/test, PostgreSQL local/test.

### Prompt 05R-ENV — Prepare local test env + runtime smoke gate

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean, commit `7425777` tồn tại.
- [x] Env readiness: xác nhận `.env` thiếu; người dùng phê duyệt tạo env local-only + Docker Postgres tạm.
- [x] Tạo `backend/.env` + `dashboard/.env.local` local-only (gitignored, không in secret, không commit).
- [x] Khởi động Docker Postgres tạm (`pgvector/pgvector:pg16`, port 5433, DB local/test).
- [x] `npx prisma migrate deploy` (non-destructive) áp dụng 10 migration vào DB tạm trống; KHÔNG `db push`/`--accept-data-loss`.
- [x] Static validation lại: backend `node --check` ×9 + `prisma validate` PASS; dashboard `tsc` + `next build` PASS.
- [x] Start backend local `node src/index.js`; seed default admin + prompt templates.
- [x] Lấy auth token qua `POST /api/auth/login` (không in token/secret).
- [x] Runtime smoke test 3 route — **PASS**: no-token→401; `webhook`→200 (secret mask/null); `telegram-destinations`→200 (`{destinations,envFallback}`); `prompts`→200 (array len=7).
- [x] Dừng server; gỡ container tạm; xóa file env local; working tree clean.
- [x] Tạo report `report/PROMPT_05R_ENV_RUNTIME_SMOKE_REPORT.md`.
- [x] Không sửa source runtime/schema/webhook/RAG/tenant handoff/DevOps; không push.

Trạng thái: **PASS — runtime smoke test passed**. 3 route đã tách runtime verified.

### Prompt 05R-LOCALDB-FIX — Fix local pgvector + run backend safely

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean, không đụng master/main.
- [x] Xác định 2 lỗi: `DATABASE_URL not found` (env hỏng/thiếu) và `type "vector" does not exist` (DB không có pgvector).
- [x] Tạo lại `backend/.env` local-only nhất quán (PORT/NODE_ENV/ENCRYPTION_KEY/DATABASE_URL/JWT/ADMIN), `dashboard/.env.local` local-only; gitignored, không commit, không in secret.
- [x] Dựng container **bền vững** `bbotech-pgvector-local` (`pgvector/pgvector:pg16`, port 5433, volume `bbotech_pgvector_local_data`); không đụng container Supabase dự án khác.
- [x] `CREATE EXTENSION IF NOT EXISTS vector;` + verify.
- [x] `npx prisma validate` PASS, `npx prisma migrate deploy` PASS (10 migration), `npx prisma generate` PASS; KHÔNG `db push --accept-data-loss`.
- [x] `npm run dev` chạy OK trên port 3001.
- [x] Smoke test 3 route PASS lại (401 no-token; 200 + shape đúng có token).
- [x] Dừng backend; **giữ** container + volume + env để user chạy lại.
- [x] Tạo report `report/PROMPT_05R_LOCALDB_PGVECTOR_FIX_REPORT.md`.
- [x] Không sửa source runtime/schema/webhook/RAG/tenant handoff.

Trạng thái: **PASS — backend local runs and smoke test passed**.

### Prompt 05D — Settings API route/controller split + runtime verify

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean, commit `040257b` tồn tại.
- [x] Baseline static validation PASS; route map toàn bộ `/settings*` còn lại.
- [x] Chọn route settings read-only an toàn nhất: `GET /settings/handoff` (còn lại đều write/external).
- [x] Thêm `createGetHandoffSettings({ prisma })` vào `settings.controller.js`; mount `GET /handoff` trong `settings.routes.js`; gỡ block khỏi `dashboard.js` (2408→2395 dòng).
- [x] Giữ nguyên public route/method/auth/status/shape/DB query/error — move handler **nguyên trạng**.
- [x] Static validation sau thay đổi PASS (`node --check` ×9, `prisma validate`, `git diff --check`).
- [x] Runtime smoke: no-token→401; `webhook`/`telegram-destinations`/`prompts`→200; `handoff`→500 (**giữ nguyên** behavior gốc).
- [x] Phát hiện **bug pre-existing**: route handoff dùng `prisma.handoffSettings` (số nhiều) trong khi model là `HandoffSetting` (accessor đúng `prisma.handoffSetting`) → undefined → 500. **Không tự sửa** (cần approval — Prompt 05D-FIX).
- [x] Dừng backend; giữ DB container/volume/env.
- [x] Tạo report `report/PROMPT_05D_SETTINGS_ROUTE_SPLIT_RUNTIME_REPORT.md`.
- [x] Không sửa schema/webhook/RAG/tenant handoff/dashboard FE.

Trạng thái: **PASS WITH WARNINGS** — tách route thành công, behavior giữ nguyên (không regression); tồn đọng bug pre-existing accessor cần fix riêng.

### Prompt 05D-FIX — Handoff settings Prisma accessor + runtime verify

- [x] Preflight Git; branch `chore/prompt-05r-docs-local-run`, working tree clean trước khi sửa, commit Prompt 05D `a2fa5da` tồn tại.
- [x] Đọc context bắt buộc: report 05D, progress/checklist/refactor plan/local run guide, Prisma schema, backend index/API/controller/routes liên quan.
- [x] Xác minh model Prisma đúng là `HandoffSetting`, accessor đúng là `prisma.handoffSetting`; scan trước fix còn `prisma.handoffSettings` trong handoff settings.
- [x] Sửa `settings.controller.js`: `prisma.handoffSettings.findUnique/create` → `prisma.handoffSetting.findUnique/create`.
- [x] Sửa `dashboard.js`: `PUT /settings/handoff` và vị trí đọc handoff settings khi assign dùng `prisma.handoffSetting`.
- [x] Sửa schema compatibility trong cùng phạm vi handoff settings: bỏ `botGracePeriodSeconds` khỏi Prisma payload `HandoffSetting` vì field này không tồn tại trong schema và làm `PUT /settings/handoff` 500.
- [x] Static validation PASS: `node --check` 9 file backend, `npx prisma validate`, `git diff --check`; không sửa schema/migrations.
- [x] Runtime smoke PASS trên `bbotech-pgvector-local`: no-token `GET /api/settings/handoff` → 401; `webhook`/`telegram-destinations`/`prompts` → 200; `GET /settings/handoff` → 200 object; `PUT /settings/handoff` với payload tương đương current settings → 200; GET lại → 200.
- [x] Dừng backend process do prompt khởi động; giữ DB container/volume/env local.
- [x] Không sửa webhook handlers, tenant handoff, RAG, bot engine/tools, dashboard frontend, Prisma schema/migrations, package hoặc DevOps scripts.
- [x] Tạo report `report/PROMPT_05D_FIX_HANDOFF_SETTINGS_ACCESSOR_REPORT.md`.

Trạng thái: **PASS — bug fixed and runtime verified**. Public route/method/auth giữ nguyên; behavior fix có chủ đích là `/api/settings/handoff` từ 500 thành 200 đúng contract.

**Settings/Cài Đặt là khu vực mấu chốt** (webhook config, Telegram destinations, handoff, provider/API, channel/Chatwoot/Facebook config) → refactor phải an toàn, route-by-route, có runtime smoke test; không tách route external side effect khi chưa có test cô lập.

## 4. Next planned prompts

| Prompt | Tên | Mục tiêu | Tool nên dùng |
|---|---|---|---|
| Prompt 05E | Settings write/external isolated tests | Kiểm tra các route settings còn lại có write/external side effect bằng test cô lập, không gọi external thật | Codex |
| Prompt 06 | Repository layer cho Prisma | Đưa Prisma access dần vào repositories, không đổi schema sau khi route split đủ nhỏ | Codex |
| Prompt 07 | Tenant safety audit | Trace tenant scope, không sửa lớn nếu chưa chắc | Codex |
| Prompt 08 | RAG/raw SQL hardening | Audit `$queryRawUnsafe`, pgvector query và input source | Codex |
| Prompt 09 | Dashboard feature split | Tách page lớn thành features/components, giữ route/UI behavior | Claude Code hoặc Codex |
| Prompt 10 | DevOps/deploy hardening | Script, Docker, migration policy, CI/deploy env | Codex |

## 5. Rủi ro đang mở

| Rủi ro | Trạng thái | Ưu tiên | Prompt xử lý |
|---|---|---|---|
| `backend/src/api/dashboard.js` quá lớn | Open (2395 dòng sau 05D) | P0 | Prompt 05E/06 |
| Bug handoff: sai Prisma accessor `handoffSettings` (đúng `handoffSetting`) → `/settings/handoff` trả 500 | Closed ở Prompt 05D-FIX | P1 | Đã sửa + runtime verified GET/PUT 200 |
| Handoff settings payload có field ngoài schema `botGracePeriodSeconds` | Closed ở Prompt 05D-FIX | P1 | Đã bỏ khỏi Prisma payload `HandoffSetting`; không đổi schema |
| `$queryRawUnsafe` | Open | P0 | Prompt 08 |
| Tenant scope chưa runtime verified | Open | P0 | Prompt 07 |
| Default credential/fallback | Open | P0 | Prompt riêng sau env policy |
| `start-all.bat` có `db push --accept-data-loss` | Open | P0 | Prompt 10 |
| Container start chạy `prisma migrate deploy` | Open | P0 | Prompt 10 |
| Runtime verification toàn hệ thống chưa chạy | Open | P0 | Đã verify nhóm settings/prompts nhỏ; route khác vẫn cần test |
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
| Prompt 05C chọn `GET /prompts` thay vì settings còn lại | Settings còn lại có write/external side effect; `GET /prompts` read-only và có query rõ | Prompt 05C |

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
| Prompt 05B | PASS | PASS | Not run | Not run | Not run | `29a97a6c3950dc73219bcf91b74b373614ff4d28` |
| Prompt 05C | PASS | PASS | Not run | Not run | Not run | `5e51bf7eea53305b4800c1449f4dc60caf885f46` |
| Prompt 05R | PASS | PASS | PASS | PASS | BLOCKED (thiếu env/DB local/test) | `2bf4386` / `7425777` |
| Prompt 05R-ENV | PASS | PASS | PASS | PASS | PASS (3 route, DB local/test tạm) | `c864390` |
| Prompt 05R-LOCALDB-FIX | PASS | PASS | Not run | Not run | PASS (3 route, DB pgvector local bền vững) | `040257b` |
| Prompt 05D | PASS | PASS | Not run | Not run | PASS WITH WARNINGS (3 route 200; handoff 500 giữ nguyên — bug pre-existing) | `a2fa5da` |
| Prompt 05D-FIX | PASS | PASS | Not run | Not run | PASS (`webhook`/`telegram-destinations`/`prompts` 200; handoff GET/PUT 200) | Ghi sau commit 05D-FIX |

Ghi chú: “PASS” ở các mốc trên là static validation/build validation, không đồng nghĩa runtime smoke test đã pass.

## 8. Tool routing

| Tool | Việc nên dùng |
|---|---|
| Codex | Refactor backend, repository layer, config/env policy, DevOps hardening, validation, Git commit, báo cáo kỹ thuật. |
| Claude Code | Dashboard feature split, UI flow phức tạp, frontend component refactor lớn nếu cần thao tác nhiều UI state. |
| Claude Design | Chỉ dùng khi cần redesign visual/mockup, layout mới hoặc thiết kế giao diện trước khi code. |
| ChatGPT | Tạo prompt, review report, lập kế hoạch, tổng hợp quyết định và checklist. |

## 9. Bước tiếp theo rõ ràng

Prompt 05D-FIX đã hoàn tất: nhóm route nhỏ `settings/prompts` đã runtime verified trên DB pgvector local/test, gồm `GET /api/settings/webhook`, `GET /api/settings/telegram-destinations`, `GET /api/prompts`, `GET /api/settings/handoff`, `PUT /api/settings/handoff`. Auth không token vẫn trả 401; token local/test lấy qua login endpoint; không in credential/token.

Bước tiếp theo (sau Prompt 05D-FIX):

- **Prompt 05E**: các route settings còn lại là write/external → cần prompt test cô lập riêng (mock external), không tách bừa.
- **Prompt 06**: bắt đầu repository layer cho nhóm `prompts`/`settings` khi controller boundary đã đủ rõ.

Lưu ý tái chạy: Prompt 05R-LOCALDB-FIX đã dựng DB pgvector local **bền vững** (`bbotech-pgvector-local`, port 5433, volume `bbotech_pgvector_local_data`) và giữ `backend/.env`. User chạy lại backend bằng: `docker start bbotech-pgvector-local` → `cd backend` → `npm run dev` (xem `docs/LOCAL_RUN_GUIDE.md` mục 1c). Không chạy migration/db push/Docker compose/start-all trên dữ liệu production.

Điều kiện bắt buộc:

- Không đụng webhook handlers.
- Không đụng tenant handoff.
- Không đụng RAG pipeline.
- Không đụng Prisma schema/migrations.
- Không sửa Dockerfile/scripts.
- Không chạy migration/db push/Docker/start script.
- Nếu chưa có runtime smoke test, ghi rõ **Static validation pass — chưa runtime verified**.
