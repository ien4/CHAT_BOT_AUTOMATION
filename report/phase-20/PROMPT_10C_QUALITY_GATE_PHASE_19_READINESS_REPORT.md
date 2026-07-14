# PROMPT 10C — QUALITY GATE + PHASE 19 READINESS REPORT

Ngày: 2026-07-10
Branch: `chore/prompt-05r-docs-local-run`
Base commit: `588b9be Harden deploy workflow and knowledge embedding drift`

## 1. Mục tiêu

- Đóng quality gate (backend + dashboard) trước khi vào Phase 19.
- Chuẩn hóa lint non-interactive nếu an toàn; không bulk-fix, không thêm dependency.
- Tạo quality gate command rõ ràng cho local/CI.
- Dry-run production smoke checklist trên local/test (không production thật).
- Xác nhận Phase 19 readiness: chọn candidate page #1 + tiêu chí (chưa sửa page).

## 2. Preflight

- Branch `chore/prompt-05r-docs-local-run` (không master/main); commit `588b9be` tồn tại; working tree sạch.
- `backend/.env`, `dashboard/.env.local` ignored & không tracked.

## 3. Quality script audit

- Backend (`package.json`): CommonJS; scripts cũ `start/dev/test(placeholder)/export/import`. **Không** lint, **không** typecheck, **không** ESLint dependency.
- Dashboard (`package.json`): `lint: next lint` (Next 14). **Không** có `eslint`/`eslint-config-next` trong deps; **không** config `.eslintrc*`/`eslint.config.*`.
- Kiểm tra `node_modules`: **ESLint chưa cài** ở cả backend lẫn dashboard → `next lint` sẽ prompt interactive đòi cài (không dùng được trong CI non-interactive).

## 4. Dashboard lint strategy

- **OPTION C** (thiếu dependency): không tự `npm install`, không sửa `package-lock`.
- Giữ script `lint: next lint`, thêm `typecheck` + `quality` (không dùng ESLint).
- `next build` vẫn PASS (bỏ qua lint khi ESLint chưa cấu hình).
- Hướng dẫn bật lint (ESLint 8 + `eslint-config-next@14`, `.eslintrc.json`, `next lint --max-warnings=0`) ghi ở `docs/policies/QUALITY_GATE.md` cho prompt dependency riêng.

## 5. Backend quality strategy

- Backend JS CommonJS, không thêm TypeScript, không thêm dependency.
- Thêm scripts:
  - `syntax`: `node --check` cho `src/index.js`, `src/db.js`, `src/api/dashboard.js`, `src/rag/pipeline.js`, `src/tenants/handoff.js`, `scripts/seed.js`.
  - `prisma:validate`: `prisma validate`.
  - `quality`: `npm run syntax && npm run prisma:validate`.

## 6. Quality gate commands

Backend:
```
npm run quality   # syntax + prisma:validate  -> PASS
```
Dashboard:
```
npm run quality   # typecheck (tsc --noEmit) + build (next build) -> PASS
```
Chi tiết + required checks: `docs/policies/QUALITY_GATE.md`.

## 7. Production smoke dry-run (local/test)

Temp platform admin `test-10c-admin` (throwaway hash bằng bcryptjs, KHÔNG đọc `.env`, KHÔNG đụng admin thật, KHÔNG in token), backend :3001. Script tạm đã xóa.

PASS 9/9:
1. `GET /health` → 200.
2. `POST /api/auth/login` → 200 + token exists.
3. `GET /api/prompts` (token) → 200.
4. `GET /api/settings/handoff` (token) → 200.
5. `GET /api/prompts` (no token) → 401.
6. `GET /webhook` (no/invalid verify) → 403.
7. `POST /chatwoot-webhook` → 404.
8. Knowledge insert content-first không embedding → OK (migration 10B applied).
9. Cleanup `test-10c-*` leftover = 0.

Không gọi external thật.

## 8. Phase 19 readiness

Tiêu chí: không external side effect, không auth core, dễ tách component/hook, validate bằng tsc/build, không đổi UI, backend liên quan đã ổn định.

Bảng LOC + side effect (page dashboard):

| Page | LOC | Side effect |
|---|---|---|
| tenants | 1127 | write |
| settings | 725 | write + provider |
| content-packages | 671 | write |
| handoff | 581 | realtime (loại) |
| **analytics** | **374** | **read-only** |
| knowledge | 358 | upload/reindex (loại) |
| prompts | 318 | write |

**Candidate #1 = `dashboard/src/app/dashboard/analytics/page.tsx`**: read-only (`analyticsApi.get`), backend harden 09B, có sẵn `features/analytics/`, build route PASS. Kế hoạch chi tiết: `docs/roadmap/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md`. **Chưa sửa page trong 10C.**

## 9. Validation

- Backend `npm run quality` (syntax + prisma validate) PASS.
- Dashboard `npm run quality` (typecheck exit 0 + build 17 routes) PASS.
- `git diff --check`: chỉ warning CRLF/LF Windows.
- `git diff --stat`: `backend/package.json` (+5/-1... additive scripts), `dashboard/package.json` (+4/-1... additive scripts).
- Destructive scan `db push|accept-data-loss` trong scripts/docker/package: không executable (chỉ comment historical trong start-all.bat từ 10B).

## 10. Không thay đổi

- Không sửa dashboard page/component UI, backend API behavior, Prisma schema/migrations, RAG/analytics/tenant handoff/webhook/bot.
- Không sửa Dockerfile/start-all (không có regression từ 10B).
- Không thêm dependency, không `npm install`, không sửa `package-lock`, không `eslint --fix`.
- Không mở/in `.env` thật; không in token/secret.
- Không production rollout; không push remote.

## 11. Remaining risks

- Lint chưa vào required gate (ESLint chưa cài) — cần prompt dependency riêng.
- Runtime verification toàn hệ thống vẫn chưa phủ hết route (smoke tối thiểu đã PASS).
- npm audit vulnerabilities còn mở (không xử lý trong 10C theo phạm vi).
- Production rollout thật chưa chạy.

## 12. Final verdict

**PASS WITH WARNINGS**

- PASS: quality gate command backend + dashboard PASS; production smoke dry-run 9/9; Phase 19 readiness xác định.
- WARNING: lint non-interactive BLOCKED do ESLint chưa cài (OPTION C) — không thêm dependency theo phạm vi; hướng dẫn đã ghi.

## 13. Next step

- **Prompt 19A** — tách `analytics/page.tsx` sang `dashboard/src/features/analytics/**` (chart/table/summary components + `useAnalytics` hook), giữ nguyên UI & behavior, validate bằng `npm run quality` (typecheck + build). Mục tiêu: giảm kích thước page, chuẩn hóa cấu trúc feature làm mẫu cho các page kế tiếp.
