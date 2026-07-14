# PROMPT 21C-FIX — DASHBOARD RUNTIME CHUNK ERROR REPORT

Ngày thực hiện: 2026-07-14
Trạng thái: **PASS**

## 1. Mục tiêu

Xử lý triệt để bug runtime Dashboard sau Prompt 21C-SAFE, xác định root cause thật trước khi tiếp tục feature work, không sửa chắp vá và không đổi behavior/UI/API để né lỗi.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit nền | `672792a Split dashboard content-packages feature` tồn tại |
| Working tree trước patch | Có `Bug_21C_SAFE.md` untracked làm context bug; không sửa/stage file này |
| Ignored artifacts | `.next`, `.env.local`, `backend/.env`, node_modules/backups/tmp-runtime đều ignored |
| Tracked env scan | Match `backend/.env.example` là sample tracked hợp lệ, không phải env thật |

Không đọc/in env thật, token hoặc secret.

## 3. Bug evidence

`Bug_21C_SAFE.md` ghi các lỗi runtime sau 21C:

- `Cannot find module './20.js'`
- `Cannot find module './682.js'`
- `Cannot read properties of undefined (reading 'call')`
- `static chunks 404`
- webpack cache ENOENT vendor chunk, ví dụ `vendor-chunks/es-object-atoms.js`
- stack nằm trong `dashboard/.next/server/webpack-runtime.js`
- route bị ảnh hưởng: `/dashboard`, `/dashboard/settings`, `/dashboard/campaigns`, `/dashboard/conversations`, `/dashboard/knowledge`
- một số route compile lại rồi có lúc 200, sau đó chunk/static request 404

Đây là signature rất gần với stale/corrupt Next dev cache hoặc HMR cache.

## 4. Context files read

- `Bug_21C_SAFE.md`
- `report/phase-19/PROMPT_21C_DASHBOARD_CONTENT_PACKAGES_REPORT.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `dashboard/src/app/dashboard/content-packages/page.tsx`
- `dashboard/src/features/content-packages/**`
- `dashboard/src/app/dashboard/page.tsx`
- `dashboard/src/app/dashboard/settings/page.tsx`
- `dashboard/src/app/dashboard/campaigns/page.tsx`
- `dashboard/src/app/dashboard/conversations/page.tsx`
- `dashboard/src/app/dashboard/knowledge/page.tsx`

Không đọc env thật.

## 5. Baseline validation

Trước khi clean `.next`:

| Lệnh | Kết quả |
|---|---|
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| Root `git diff --check/stat/name-status` | Sạch |

Static validation sạch trước clean cache cho thấy chưa có bằng chứng source/build bug.

## 6. Root-cause audit

| Nhóm nghi vấn | Bằng chứng | Có phải root cause? | Cách xử lý |
|---|---|---|---|
| Stale `.next` cache / HMR cache corruption | Bug stack nằm trong `.next/server/webpack-runtime.js`; missing numbered chunks `./20.js`, `./682.js`; static chunks 404; vendor chunk ENOENT; route compile lại rồi có lúc 200 | Có | Dừng dev server cũ, xóa `.next`, typecheck/build sạch, start fresh dev server và smoke route |
| Source import/barrel issue | `content-packages` chỉ có named exports; type exports dùng `export type`; chỉ `content-packages/page.tsx` import barrel mới; các route bug khác không import feature này; build PASS | Không | Không sửa source |
| Client/server boundary issue | Page/hook/components dùng state/event đều có `'use client'`; không có dynamic/lazy import; không có client-only global bất thường trong feature | Không | Không sửa source |

Kết luận root cause: **STALE_NEXT_DEV_CACHE_RESOLVED**.

## 7. Cache clean proof

Các bước đã chạy:

1. Phát hiện dashboard dev server cũ đang chạy `npm run dev` -> `next dev -p 3002`.
2. Dừng đúng process tree dashboard dev server cũ; không dừng backend/DB/process khác.
3. Verify `dashboard/.next` là path trong workspace dashboard, sau đó xóa `.next` ignored artifact.
4. Chạy lại:
   - `cd dashboard && npm run typecheck` PASS
   - `cd dashboard && npm run build` PASS
5. Start fresh dev server tạm bằng `npx --no-install next dev -p 3019 -H 127.0.0.1`.
6. Smoke route bắt buộc.
7. Scan dev log sau smoke.
8. Dừng process tạm; port `3019` và `3002` đều free sau cleanup.

Bug có tái hiện sau clean `.next` không? **Không**.

## 8. Source fix summary

**NO_SOURCE_FIX_NEEDED**

Không sửa source vì:

- Baseline typecheck/build PASS trước cache clean.
- Source import/client-boundary audit không tìm thấy lỗi.
- Clean cache + fresh dev smoke đóng được bug.
- Sửa source trong trường hợp này sẽ là sửa bừa và có rủi ro đổi behavior không cần thiết.

## 9. Runtime route smoke

Fresh dev server tạm: `http://127.0.0.1:3019`.

| Route | Kết quả |
|---|---|
| `GET /login` | 200 |
| `GET /dashboard` | 200 |
| `GET /dashboard/content-packages` | 200 |
| `GET /dashboard/settings` | 200 |
| `GET /dashboard/campaigns` | 200 |
| `GET /dashboard/conversations` | 200 |
| `GET /dashboard/knowledge` | 200 |
| `GET /dashboard/prompts` | 200 |
| `GET /dashboard/analytics` | 200 |
| `GET /dashboard/__fake_21c_fix__` | 404 hợp lệ |

Dev log sau clean:

- Không còn `Cannot find module './20.js'`.
- Không còn `Cannot find module './*.js'`.
- Không còn `Cannot read properties of undefined (reading 'call')`.
- Không còn vendor chunk ENOENT mới.
- Không còn static chunk 404 gây page 500.

Dev server tạm đã dừng. Port `3019` free sau cleanup.

## 10. Safety scans

| Scan | Kết quả |
|---|---|
| `process.env/NEXT_PUBLIC/SECRET/TOKEN/PASSWORD` trong content-packages | Không có source match |
| `fetch(` trong content-packages | Không có source match |
| `npm install/yarn add/pnpm add` | Chỉ match docs/script/report lịch sử cũ; không thêm dependency |
| `prisma db push/accept-data-loss/migrate reset` | Chỉ match docs/report/script lịch sử cũ; không thêm destructive command |
| Bug signatures trong report/docs/dashboard/src | Chỉ có trong `Bug_21C_SAFE.md` và report/docs lịch sử của prompt; không xuất hiện trong source hoặc dev log mới |

## 11. Docs changed

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `report/bugs/PROMPT_21C_FIX_DASHBOARD_RUNTIME_CHUNK_ERROR_REPORT.md`

## 12. Không thay đổi

| Câu hỏi | Kết quả |
|---|---|
| Có sửa source không? | Không |
| Có sửa backend không? | Không |
| Có sửa schema/package không? | Không |
| Có thêm dependency không? | Không |
| Có sửa webhook không? | Không |
| Có gọi external không? | Không |
| Có chạy migrate/import/action không? | Không |
| Có claim Meta verified không? | Không |
| Có claim production ready không? | Không |

Không commit `.next`, env, log, backup hoặc tmp-runtime.

## 13. Final verdict

**PASS**

Bug runtime chunk sau 21C không tái hiện sau clean `.next` + rebuild + fresh dev route smoke. Root cause có bằng chứng là **STALE_NEXT_DEV_CACHE_RESOLVED**. Không cần source fix.

## 14. Next step

Có thể tiếp tục Phase 19/21 sau khi bug runtime này đã đóng. Prompt tiếp theo nên chọn một refactor nhỏ, có guard mutation/action rõ và bắt buộc smoke runtime nếu route liên quan dashboard.
