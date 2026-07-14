# PROMPT 19B - Dashboard Prompts Feature Split Report

Ngày thực hiện: 2026-07-11
Trạng thái: **PASS**

## 1. Phạm vi

Prompt 19B tách `dashboard/src/app/dashboard/prompts/page.tsx` thành feature module nhỏ hơn, giữ nguyên behavior. Phạm vi chỉ chạm dashboard prompts feature và docs/report được phép.

Không thay đổi:

- Backend source.
- `dashboard/src/lib/api.ts`.
- `package.json` / dependency.
- Prisma schema hoặc migrations.
- `.env`, `.env.local`, `.next`, backup, temp/log.
- Docker/script/start-all.

## 2. Thay đổi source

Đã chuyển page prompts thành orchestrator mỏng:

- `dashboard/src/app/dashboard/prompts/page.tsx`

Đã tạo feature module:

- `dashboard/src/features/prompts/hooks/usePrompts.ts`
- `dashboard/src/features/prompts/components/PromptsHeader.tsx`
- `dashboard/src/features/prompts/components/PromptTabs.tsx`
- `dashboard/src/features/prompts/components/PromptForm.tsx`
- `dashboard/src/features/prompts/components/PromptLoadingState.tsx`
- `dashboard/src/features/prompts/components/PromptEmptyState.tsx`
- `dashboard/src/features/prompts/components/PromptList.tsx`
- `dashboard/src/features/prompts/lib/promptFormatters.ts`
- `dashboard/src/features/prompts/types.ts`
- `dashboard/src/features/prompts/index.ts`

Behavior giữ nguyên:

- `promptsApi.list()` khi load/reload theo `selectedTenantId`.
- `promptsApi.create()`, `promptsApi.update()`, `promptsApi.delete()`.
- Confirm delete `Xóa?`.
- Toast success/error hiện tại.
- Payload create/update gồm `name`, `intentType`, `layer`, `systemPrompt`, `userPromptTemplate`, `modelPreference`.
- Filter tab theo `identity`, `guardrails`, chatbot intents, `email_b2b`, `zalo_b2b`.
- UI text/layout/className và các trạng thái loading/empty/modal/list.

## 3. Preflight và DB/backend readiness

- Branch giữ nguyên: `chore/prompt-05r-docs-local-run`.
- Working tree ban đầu sạch ngoài ignored artifacts.
- `.env`, `.env.local`, `.next`, backup/temp vẫn ignored và không stage.
- Docker container `bbotech-pgvector-local` đã đang chạy ở port local `5433`.
- Backend `GET http://localhost:3001/health` trả 200.
- `cd backend && npm run quality` PASS.
- `npx prisma migrate deploy` PASS, không có pending migration.
- Không gặp lỗi P1001.

## 4. Validation dashboard

Trước refactor:

- `cd dashboard && npm run quality` PASS.
- `cd dashboard && npm run typecheck` PASS.
- `cd dashboard && npm run build` PASS.
- Clean `.next`, chạy lại `npm run quality` PASS.
- Fresh dev server port `3019` smoke PASS cho `/`, `/login`, `/dashboard`, `/dashboard/prompts`, `/dashboard/analytics`, route 404 giả; không có 500/chunk error.

Sau refactor:

- `cd dashboard && npm run quality` PASS.
- `cd dashboard && npm run typecheck` PASS.
- `cd dashboard && npm run build` PASS.
- Clean `.next`, fresh dev server port `3019`.
- Route smoke PASS cho `/`, `/login`, `/dashboard`, `/dashboard/prompts`, `/dashboard/analytics`, `/dashboard/knowledge`, `/dashboard/settings`, `/dashboard/tenants`, `/dashboard/handoff`, `/dashboard/content-packages`, route 404 giả.
- Không tái hiện `Cannot find module './<number>.js'`.

## 5. Backend smoke

Backend smoke trước và sau refactor đều PASS 7/7:

- `/health` 200.
- Login admin test tạm trả token.
- `/api/prompts` 200.
- `/api/settings/handoff` 200.
- `/api/analytics?days=7` 200.
- `/webhook` với verify sai/thiếu trả 403.
- `/chatwoot-webhook` trả 404.

Admin test dùng prefix `prompt19b_`, mật khẩu/token không in ra output và đã cleanup sau smoke.

## 6. Scan an toàn

Focused dashboard scan:

- `promptsApi` chỉ xuất hiện ở `dashboard/src/lib/api.ts` và `features/prompts/hooks/usePrompts.ts`.
- Không có `fetch()` mới trong prompts feature.
- Không có static `require('./<number>.js')` trong prompts feature.

Backend safety scan:

- Không phát sinh `$queryRawUnsafe` / `$executeRawUnsafe` active code từ Prompt 19B.
- Các dòng Chatwoot còn thấy nằm ở `start-all.bat` và scripts legacy/backlog cũ, không do Prompt 19B tạo.

## 7. Docs đã cập nhật

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md`

## 8. Điểm cần tu sửa

- Các script legacy còn nhắc Chatwoot trong `start-all.bat` và `backend/scripts/*`; đây là backlog DevOps/legacy cleanup, không thuộc Prompt 19B.
- Phase 19 cần tiếp tục tránh page có external side effect nặng nếu chưa có rollback/smoke riêng.
- Nếu chạy build rồi quay lại dev server cũ, vẫn phải clean/restart dev server khi gặp chunk mismatch.

## 9. Gợi ý tiếp theo

Prompt 19C nên chọn `dashboard/src/app/dashboard/staff/page.tsx` hoặc `appointments/page.tsx` với checklist mutation rõ. Chưa nên chọn `settings`, `knowledge`, `tenants` cho tới khi prompt sau định nghĩa rollback, external call policy và runtime smoke riêng.
