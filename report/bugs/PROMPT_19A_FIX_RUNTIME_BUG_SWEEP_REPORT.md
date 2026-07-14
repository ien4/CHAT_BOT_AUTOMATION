# PROMPT 19A-FIX - FULL RUNTIME BUG SWEEP REPORT

## 1. Mục tiêu

- Điều tra và xử lý lỗi runtime Next.js sau Prompt 19A: `Cannot find module './20.js'`.
- Xác định lỗi thuộc stale `.next` cache/dev server, source analytics split, hay backend.
- Chỉ fix bug, không chạy Prompt 19B, không redesign UI, không sửa ngoài phạm vi.

## 2. Preflight

- Branch: `chore/prompt-05r-docs-local-run`, không phải `master/main`.
- Commit 19A `7b4516b Split analytics dashboard feature` tồn tại.
- Working tree sạch trước khi sửa, chỉ có ignored env/node_modules/.next/tmp artifacts.
- `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored; env thật không staged/tracked.

## 3. Bug observed

- Bug user báo: Server Error `Cannot find module './20.js'`, require stack qua `dashboard/.next/server/webpack-runtime.js`, `_not-found/page.js`, `dashboard/page.js`.
- Trong lượt chạy này, lỗi không còn tái hiện sau khi chạy baseline `npm run quality`; khả năng cao `next build` đã ghi lại `.next` và xóa trạng thái cache lệch trước đó.

## 4. Reproduction

- Port baseline:
  - Backend 3001 đang chạy sẵn.
  - Dashboard 3002 đang chạy sẵn.
  - Port 3019 trống trước khi prompt start dev server riêng.
- Dashboard baseline không clean cache trước:
  - `npm run quality` PASS.
  - Start `npx --no-install next dev -p 3019`.
  - HTTP smoke `/login`, `/dashboard`, `/dashboard/analytics`, route sai để kích `_not-found`: không có `Cannot find module './20.js'`, không có 500.
  - Smoke thêm process 3002 đang chạy sẵn: không còn chunk error.

## 5. Root cause

Root cause được phân loại là stale `.next` cache/dev server mismatch sau build/dev process cũ, không phải source 19A và không phải backend.

Bằng chứng:

- Source analytics split có client boundary hợp lệ: page/hook/filter/toggle có `'use client'`; formatter/types không import hook/component client.
- Barrel `@/features/analytics` chỉ export hook/components/types, không phát hiện circular import gây build/runtime error.
- `npm run quality` PASS và `next build` render route `/dashboard/analytics` PASS.
- Audit `.next/server/**/*.js` sau build không còn reference `./20.js`; relative require checker PASS.
- Sau clean `.next` và dev server fresh, route smoke PASS.

## 6. Fix applied

- Dừng dev server 3019 do prompt start.
- Xóa `dashboard/.next`.
- Chạy lại dashboard `npm run quality`.
- Start dev server fresh port 3019 và smoke route thật.
- Không patch source dashboard/backend vì không có bằng chứng source regression.

## 7. Files changed

Chỉ docs/report:

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md`
- `report/bugs/PROMPT_19A_FIX_RUNTIME_BUG_SWEEP_REPORT.md`

## 8. Dashboard route smoke

Fresh dev server port 3019 sau clean `.next`:

| Route | Status | Chunk error | 500 |
|---|---:|---|---|
| `/` | 307 | Không | Không |
| `/login` | 200 | Không | Không |
| `/dashboard` | 200 | Không | Không |
| `/dashboard/analytics` | 200 | Không | Không |
| `/dashboard/prompts` | 200 | Không | Không |
| `/dashboard/knowledge` | 200 | Không | Không |
| `/dashboard/settings` | 200 | Không | Không |
| `/dashboard/tenants` | 200 | Không | Không |
| `/dashboard/handoff` | 200 | Không | Không |
| `/dashboard/content-packages` | 200 | Không | Không |
| `/definitely-not-found-19a-fix` | 404 | Không | Không |

Dev server 3019 do prompt start đã được dừng sau smoke.

## 9. Backend smoke

- Backend 3001 đã chạy sẵn; prompt không start backend mới.
- `npm run quality` PASS.
- Runtime smoke bằng platform admin test tạm, không in token/password, cleanup sau smoke:
  - `GET /health` -> 200.
  - `POST /api/auth/login` -> 200 + token exists.
  - `GET /api/prompts` -> 200.
  - `GET /api/settings/handoff` -> 200.
  - `GET /api/analytics?days=7` -> 200, response shape hợp lệ.
  - `GET /webhook` thiếu verify token -> 403.
  - `POST /chatwoot-webhook` -> 404.

Kết quả: PASS 7/7.

## 10. Validation

- Dashboard:
  - `npm run quality` PASS trước clean.
  - Xóa `dashboard/.next`.
  - `npm run quality` PASS sau clean.
  - Fresh dev server route smoke PASS.
- Backend:
  - `npm run quality` PASS.
  - `node --check src/index.js` PASS.
  - `node --check src/api/dashboard.js` PASS.
  - `npx prisma validate` PASS.
- Scans:
  - Dashboard source không có `Cannot find module` hoặc `require("./<number>.js")`.
  - Backend source/scripts không còn active `$queryRawUnsafe` / `$executeRawUnsafe`.
  - `start-all.bat` còn warning/comment và `migrate deploy`, không có executable `db push --accept-data-loss`.

## 11. Không thay đổi

- Không sửa dashboard source hoặc backend source.
- Không sửa package/dependency.
- Không sửa Prisma schema/migrations.
- Không sửa `.env`, `.env.local`; không in token/secret/password/DATABASE_URL/API key.
- Không stage `.next`, temp logs/scripts, backup, node_modules.
- Không gọi Facebook/Telegram/Gemini/Jina/Claude/DeepSeek thật.
- Không push remote.

## 12. Remaining risks

- Lỗi ban đầu không tái hiện được sau khi baseline `npm run quality` đã ghi lại `.next`; root cause là suy luận kỹ thuật từ symptom + cache audit + clean-cache verification.
- Dashboard 3002 là process có sẵn từ trước, không bị dừng bởi prompt này. Nếu process cũ gặp chunk mismatch lại, cần restart hoặc clean `.next` theo rule mới.
- Một số script Chatwoot legacy vẫn tồn tại trong `backend/scripts` và `start-all.bat`; không liên quan bug 19A-FIX và không sửa trong prompt này.

## 13. Final verdict

PASS.

## 14. Next step

- Chỉ tiếp tục Prompt 19B sau khi giữ rule mới: typecheck/build chưa đủ, phải chạy dev server route smoke thật cho route vừa tách và các route dashboard trọng yếu.
- Mục tiêu Prompt 19B: tách page tiếp theo với blast radius nhỏ, giữ UI/behavior, và không để stale `.next`/dev server che lấp lỗi runtime.
