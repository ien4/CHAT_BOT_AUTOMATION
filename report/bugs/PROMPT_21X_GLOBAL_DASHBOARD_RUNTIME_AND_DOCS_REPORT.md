# PROMPT 21X — GLOBAL DASHBOARD RUNTIME BUG FIX + PROJECT STATUS HUB + DOCS/REPORT ORGANIZATION REPORT

Ngày thực hiện: 2026-07-14
Trạng thái: **PASS**

## 1. Mục tiêu

Dừng feature split mới, xử lý bug runtime dashboard ghi trong `Bug_21C-3.md`, kiểm tra toàn bộ dashboard routes/static assets/dev log, cập nhật bug tracker và tạo project status hub + docs/report organization map.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit yêu cầu | `366b72d Split dashboard campaigns feature` tồn tại |
| Commit runtime fix trước | `605fcc3 Fix dashboard runtime chunk error after content packages split` tồn tại |
| Working tree trước patch | Chỉ có `Bug_21C-3.md` untracked làm context; không stage file này |
| `.next` ignored | PASS |
| `dashboard/.env.local` ignored | PASS |
| `backend/.env` ignored | PASS |
| Tracked env scan | Chỉ match `backend/.env.example` sample hợp lệ |

Không đọc/in env thật, token hoặc secret.

## 3. Context files read

- `Bug_21C-3.md`
- `report/phase-19/PROMPT_21C_3_DASHBOARD_CAMPAIGNS_REPORT.md`
- `report/phase-19/PROMPT_21C_2_DASHBOARD_QUICK_REPLIES_REPORT.md`
- `report/bugs/PROMPT_21C_FIX_DASHBOARD_RUNTIME_CHUNK_ERROR_REPORT.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/index/HISTORICAL_DOCS_INDEX.md`
- `docs/policies/QUALITY_GATE.md`
- `docs/runbooks/LOCAL_RUN_GUIDE.md`

## 4. Bug evidence from Bug_21C-3

| Dấu hiệu bug | Route/asset | Status | Log signature | Có giống 21C-FIX không? | Giả thuyết | Cách chứng minh |
|---|---|---:|---|---|---|---|
| `Cannot find module './20.js'` | `/dashboard/tenants` server page | 500 | `.next/server/webpack-runtime.js` require stack | Có | Stale/corrupt `.next` hoặc server cũ dùng chunk stale | Static build + clean `.next` + fresh dev smoke |
| `/dashboard/tenants` 500 | `/dashboard/tenants` | 500 | `GET /dashboard/tenants 500` | Có | Dev runtime cache stale, chưa chắc source tenants bug | Build tenants route + fresh route smoke |
| CSS layout 404 | `/_next/static/css/app/layout.css?...` | 404 | `_next/static` 404 | Có | HTML/chunk manifest lệch với static output | Static asset smoke sau fresh server |
| Main app JS 404 | `/_next/static/chunks/main-app.js?...` | 404 | `_next/static` 404 | Có | Server/browser đang dùng asset version stale | Static asset smoke |
| App pages internals 404 | `/_next/static/chunks/app-pages-internals.js` | 404 | `_next/static` 404 | Có | Stale dev asset graph | Static asset smoke |
| Dashboard page chunks 404 | `/_next/static/chunks/app/dashboard/*/page.js` | 404 | page chunk 404 | Có | Mixed dev server / HMR cache mismatch | Full route asset smoke |
| `webpack.cache.PackFileCacheStrategy` | `.next/server` | Warning | cache failed | Có | webpack filesystem cache stale/corrupt | Clean `.next` + log scan |
| `vendor-chunks/* ENOENT` | `.next/server/vendor-chunks/*` | Warning | ENOENT vendor chunks | Có | missing generated vendor chunk in stale cache | Clean `.next` + log scan |

## 5. Process/port audit

| Port/process | Kết quả |
|---|---|
| `3002` | BUSY trước fix; PID `3524` listen |
| `3019` | FREE |
| `3020` | FREE |
| `3021` | FREE |
| Node process audit | PID `20916`: `next dev -p 3002` trong `dashboard`; PID `3524`: child `start-server.js` |
| Action | Dừng đúng dashboard Next dev server cũ PID `20916/3524` |
| Backend | PID `1260` `node src/index.js`, không dừng |

## 6. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS, route `/dashboard/tenants` build được |
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

Prisma CLI tự báo load `.env`; Codex không đọc/in nội dung env thật.

## 7. Root cause analysis

Root cause: **MIXED_DEV_SERVER_OR_PORT + STALE_NEXT_DEV_CACHE**.

Bằng chứng:

- Bug stack nằm trong generated `.next/server/webpack-runtime.js`, không nằm trong source dashboard.
- Static validation PASS trước khi clean cache.
- `next build` build route `/dashboard/tenants` thành công.
- Port 3002 còn dashboard dev server cũ thuộc workspace.
- Sau khi dừng server cũ, xóa `.next`, build lại và start fresh dev server port 3019, toàn bộ route/static asset/log đều sạch.

Không có bằng chứng cho `SOURCE_IMPORT_OR_BARREL_BUG` hoặc `NEXT_CONFIG_OR_ASSET_BASE_PATH_BUG`.

## 8. Fix applied / No source fix needed

Fix đã áp dụng:

1. Dừng đúng dashboard Next dev server cũ PID `20916/3524`.
2. Xác thực path `dashboard/.next` nằm trong workspace dashboard.
3. Xóa `.next` ignored artifact.
4. Chạy lại dashboard typecheck/build.
5. Start fresh dev server `npx --no-install next dev -p 3019 -H 127.0.0.1`.
6. Full route smoke + static asset smoke + dev log scan.

**NO_SOURCE_FIX_NEEDED**: không sửa dashboard source vì source/build sạch và bug biến mất sau xử lý process/cache.

## 9. Full dashboard route smoke matrix

| Route | HTTP status | Có 500? | Có redirect? | HTML có lỗi runtime? | Ghi chú |
|---|---:|---|---|---|---|
| `/login` | 200 | Không | Không | Không | OK |
| `/dashboard` | 200 | Không | Không | Không | OK |
| `/dashboard/analytics` | 200 | Không | Không | Không | OK |
| `/dashboard/prompts` | 200 | Không | Không | Không | OK |
| `/dashboard/staff` | 200 | Không | Không | Không | OK |
| `/dashboard/appointments` | 200 | Không | Không | Không | OK |
| `/dashboard/content-packages` | 200 | Không | Không | Không | OK |
| `/dashboard/quick-replies` | 200 | Không | Không | Không | OK |
| `/dashboard/campaigns` | 200 | Không | Không | Không | OK |
| `/dashboard/channel-configs` | 200 | Không | Không | Không | OK |
| `/dashboard/conversations` | 200 | Không | Không | Không | OK |
| `/dashboard/knowledge` | 200 | Không | Không | Không | OK |
| `/dashboard/settings` | 200 | Không | Không | Không | OK |
| `/dashboard/tenants` | 200 | Không | Không | Không | Bug route đã sạch |
| `/dashboard/handoff` | 200 | Không | Không | Không | OK |
| `/dashboard/__fake_21x__` | 404 | Không | Không | Không | 404 hợp lệ |

## 10. Static asset smoke matrix

| Route nguồn | Asset scope | Số asset | Status | Pass/Fail |
|---|---|---:|---|---|
| `/login` | `_next/static` CSS/JS | 7 | 200 x7 | PASS |
| `/dashboard` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/analytics` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/prompts` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/staff` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/appointments` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/content-packages` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/quick-replies` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/campaigns` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/channel-configs` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/conversations` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/knowledge` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/settings` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/tenants` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/handoff` | `_next/static` CSS/JS | 8 | 200 x8 | PASS |
| `/dashboard/__fake_21x__` | `_next/static` CSS/JS not-found page | 6 | 200 x6 | PASS |

Tổng: **125 assets**, không có 404.

## 11. Dev log scan

| Signature | Kết quả |
|---|---|
| `Cannot find module './` | Không có |
| `Cannot read properties of undefined (reading 'call')` | Không có |
| `MODULE_NOT_FOUND` | Không có |
| `webpack.cache.PackFileCacheStrategy` kèm ENOENT | Không có |
| `vendor-chunks` | Không có |
| `_next/static` 404 lỗi | Không có |
| `/dashboard/tenants 500` | Không có |

## 12. Bug tracker update

Tạo `docs/status/BUG_TRACKER.md` với:

- BUG-21C-SAFE stale `.next` chunk bug: RESOLVED.
- BUG-21C-3 tenants/static chunks bug: RESOLVED với root cause **MIXED_DEV_SERVER_OR_PORT + STALE_NEXT_DEV_CACHE**.

## 13. Project status master created

Tạo `docs/status/PROJECT_STATUS_MASTER.md` gồm:

- Tóm tắt product/architecture/current target.
- Bảng trạng thái theo nhóm.
- Phase board.
- Link dashboard route health và bug tracker.
- Next 3 prompt đề xuất.
- Các điều không được claim.

## 14. Docs/report organization map

Tạo `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md` và các index:

- `report/README.md`
- `report/phase-19/README.md`
- `report/phase-21/README.md`
- `report/phase-22/README.md`
- `report/bugs/README.md`
- README cho `docs/status`, `docs/index`, `docs/roadmap`, `docs/runbooks`, `docs/policies`, `docs/archive`.

Không move docs/report trong prompt này để tránh gãy link. Follow-up đề xuất: `21Y-DOCS-ARCHIVE-MOVE`.

## 15. Files changed

Docs/report only:

- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/BUG_TRACKER.md`
- `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md`
- `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/status/README.md`
- `docs/index/README.md`
- `docs/roadmap/README.md`
- `docs/runbooks/README.md`
- `docs/policies/README.md`
- `docs/archive/README.md`
- `report/README.md`
- `report/phase-19/README.md`
- `report/phase-21/README.md`
- `report/phase-22/README.md`
- `report/bugs/README.md`
- `report/bugs/PROMPT_21X_GLOBAL_DASHBOARD_RUNTIME_AND_DOCS_REPORT.md`

## 16. Forbidden areas unchanged

Không sửa:

- `dashboard/src/**`
- `backend/src/**`
- `backend/prisma/**`
- package/package-lock
- Docker/start scripts
- `.env`, `.env.local`
- `.next`, logs, temp, backup
- webhook/RAG/handoff/tenants backend/notifications

Không gọi Meta/Facebook/Telegram/Gemini/Jina/LLM thật. Không gửi POST `/webhook`. Không claim Meta verified hoặc production ready.

## 17. Validation after docs/source changes

Kết quả cuối:

- Dashboard typecheck: PASS
- Dashboard build: PASS
- Backend quality: PASS
- Prisma validate: PASS
- Root diff guard: PASS
- Cached diff check: PASS

## 18. Final verdict

**PASS**

Trả lời bắt buộc:

- `/dashboard/tenants` còn 500 không? **Không**, hiện 200 trên fresh server.
- Có static chunk/CSS/JS 404 không? **Không**, 125 assets đều 200.
- Có `Cannot find module './20.js'` không? **Không** trong dev log fresh.
- Có `webpack.cache`/vendor ENOENT không? **Không** trong dev log fresh.
- Có sửa source dashboard không? **Không**.
- Có sửa backend/schema/package không? **Không**.
- Có clean `.next` không? **Có**.
- Dev server port nào? **3019**.
- Có dừng đúng server cũ không? **Có**, PID `20916/3524` trên port `3002`.
- Có tạo project status master không? **Có**.
- Có tạo bug tracker không? **Có**.
- Có tạo docs/report organization map không? **Có**.
- Có move report/docs không? **Không**, chỉ tạo index/README; move cần prompt riêng.

## 19. Next step

1. Nếu mục tiêu là docs organization thật: chạy `21Y-DOCS-ARCHIVE-MOVE` để move files với compatibility stubs/link updates.
2. Nếu mục tiêu là giảm backend debt: chạy `21B-5-SAFE` chỉ với route GET read-only nhỏ sau audit.
3. Nếu tiếp tục dashboard split: bắt buộc áp dụng rule 21X full route smoke + static asset smoke + dev log scan.
