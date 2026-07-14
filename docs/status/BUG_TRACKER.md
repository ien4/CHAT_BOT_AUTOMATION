# BUG TRACKER — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-14

| Bug ID | Nguồn phát hiện | Mô tả | Ảnh hưởng | Root cause | Trạng thái | Fix/Workaround | Smoke proof | Report |
|---|---|---|---|---|---|---|---|---|
| BUG-21C-SAFE | `Bug_21C_SAFE.md` | Missing chunk `./20.js`/`./682.js`, `reading 'call'`, static chunks 404, vendor cache ENOENT sau content-packages split | Một số dashboard routes 500/chunk error khi dùng dev server/cache cũ | `STALE_NEXT_DEV_CACHE_RESOLVED` | RESOLVED | Dừng dashboard dev server cũ, xóa `.next`, typecheck/build, fresh dev smoke | 21C-FIX: routes dashboard/settings/campaigns/conversations/knowledge/prompts/analytics/content-packages PASS trên port 3019 | `report/bugs/PROMPT_21C_FIX_DASHBOARD_RUNTIME_CHUNK_ERROR_REPORT.md` |
| BUG-21C-3 | `Bug_21C-3.md` | `/dashboard/tenants` 500, `Cannot find module './20.js'`, `_next/static` CSS/JS/page chunks 404, `webpack.cache` + `vendor-chunks` ENOENT | Dashboard tenants và static assets có thể lỗi khi browser dùng server/cache stale | `MIXED_DEV_SERVER_OR_PORT` + `STALE_NEXT_DEV_CACHE`: dev server cũ `next dev -p 3002` thuộc workspace còn chạy và dùng `.next` stale/corrupt; source/build sạch | RESOLVED | Dừng đúng PID dashboard dev server cũ `20916/3524`, xóa `.next`, rebuild, fresh dev server `3019`; không sửa source | Prompt 21X: `/dashboard/tenants` 200, full route smoke PASS, 125 static assets all 200, log không còn missing chunk/cache/vendor/static 404 | `report/bugs/PROMPT_21X_GLOBAL_DASHBOARD_RUNTIME_AND_DOCS_REPORT.md` |

## Prompt 21Y regression note

Prompt 21Y không phát hiện bug dashboard mới. Sau khi move docs/report, đã dừng dashboard Next server cũ PID `24888`, clean `.next`, rebuild, start fresh dev server `3019`, smoke 16 routes PASS, 125 static assets PASS và dev log scan sạch. Không sửa source để xử lý bug vì không có bug source/runtime mới.

## Quy tắc bug dashboard từ Prompt 21X

1. Không mở feature split/refactor mới khi bug runtime chưa được root-cause.
2. Sau mọi dashboard refactor phải clean `.next`, start fresh dev server, smoke toàn bộ dashboard routes, smoke static assets và scan dev log.
3. Nếu bug biến mất sau clean cache + fresh server và static build sạch, không sửa source bừa.
4. Nếu bug còn tái hiện sau clean/fresh server, mới audit source import/barrel/client boundary/config và patch đúng root cause.
