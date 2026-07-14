# QUALITY GATE — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-10 (Prompt 10C)

Quality gate cho local/CI trước khi merge/deploy. Không thay thế `docs/policies/DEPLOYMENT_POLICY.md` (deploy) — bổ sung cho nó ở tầng validation code.

## 1. Lệnh quality (local/CI)

### Backend (`backend/`)
```
npm run quality      # = syntax + prisma:validate
npm run syntax       # node --check các file trọng yếu
npm run prisma:validate
```
- `syntax`: `node --check` cho `src/index.js`, `src/db.js`, `src/api/dashboard.js`, `src/rag/pipeline.js`, `src/tenants/handoff.js`, `scripts/seed.js`.
- `prisma:validate`: `prisma validate` (cần `DATABASE_URL`; local đọc từ `.env`).
- Backend là JS CommonJS → **không** có typecheck TS. **Không** thêm TypeScript backend trong giai đoạn này.

### Dashboard (`dashboard/`)
```
npm run quality      # = typecheck + build
npm run typecheck    # tsc --noEmit
npm run build        # next build
```

## 2. Required checks (bắt buộc PASS)

| Check | Lệnh | Trạng thái 10C |
|---|---|---|
| Backend syntax | `npm run syntax` (backend) | PASS |
| Prisma schema | `npm run prisma:validate` (backend) | PASS |
| Dashboard typecheck | `npm run typecheck` (dashboard) | PASS |
| Dashboard build | `npm run build` (dashboard) | PASS |

## 3. Lint status (chưa vào required gate)

- **ESLint CHƯA cài** ở cả `backend` lẫn `dashboard` (`node_modules/eslint` không tồn tại; không có `.eslintrc*`/`eslint.config.*`; dashboard thiếu `eslint-config-next`).
- `dashboard` script `lint: next lint` sẽ **prompt interactive đòi cài ESLint** → không dùng trong CI non-interactive cho tới khi cài dependency.
- `next build` vẫn PASS (bỏ qua lint khi ESLint chưa cấu hình).
- **Không** tự `npm install` / sửa `package-lock` trong Prompt 10C (ngoài phạm vi — cần phê duyệt dependency).

### Muốn bật lint sau này (prompt riêng, cần phê duyệt dependency)
- Dashboard (Next 14 / ESLint 8): thêm `eslint@^8` + `eslint-config-next@14` (dev), tạo `.eslintrc.json` `{ "extends": "next/core-web-vitals" }`, đổi script `lint` → `next lint --max-warnings=0` (non-interactive).
- Backend (tùy chọn): thêm `eslint@^8` + config tối thiểu cho CommonJS/Node, script `lint` → `eslint src --max-warnings=0`.
- Sau khi cài: chạy baseline lint, KHÔNG bulk `--fix` toàn repo, phân loại lỗi trước.

## 4. Production pre-release validation

- Quality gate mục 2 phải PASS trước khi build image.
- Sau đó theo `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md` (backup → `prisma migrate deploy` release step → deploy → health/smoke).
- Smoke tối thiểu (dry-run local đã PASS 9/9 ở 10C): `/health` 200; login → 200+token; `/api/prompts` (token) 200; `/api/settings/handoff` (token) 200; `/api/prompts` no-token 401; `/webhook` 403; `/chatwoot-webhook` 404; knowledge insert content-first OK.

## 5. Lệnh KHÔNG được dùng

- `prisma db push`, `prisma db push --accept-data-loss`.
- `start-all.bat` cho production.
- `docker compose up` / full seed thật khi validate quality.
- `eslint --fix` toàn repo khi chưa review diff.
