# PROMPT 19C - DASHBOARD STAFF FEATURE SPLIT REPORT

Ngày thực hiện: 2026-07-11
Trạng thái: **PASS**

## 1. Mục tiêu

Tách `dashboard/src/app/dashboard/staff/page.tsx` sang `dashboard/src/features/staff/**`, giữ nguyên route `/dashboard/staff`, UI/text/layout/className và API contract hiện tại.

## 2. Preflight

- Branch: `chore/prompt-05r-docs-local-run`.
- Commit 19B `4337daf Split prompts dashboard feature` tồn tại.
- Working tree sạch trước khi sửa, ngoài ignored artifacts.
- `.env`, `.env.local`, `.next` đều ignored; chỉ `backend/.env.example` là env sample tracked.
- Không push remote.

## 3. Local DB/backend readiness

- Container `bbotech-pgvector-local` đang chạy ở port local `5433`.
- Backend port `3001` health 200, dùng process hiện có.
- `cd backend && npm run quality` PASS.
- `npx prisma migrate deploy` PASS, không có pending migration.
- Không gặp P1001.

## 4. Baseline dashboard route smoke

Trước refactor:

- `cd dashboard && npm run quality` PASS.
- `npm run typecheck` PASS.
- `npm run build` PASS.
- Clean `dashboard/.next`, chạy lại `npm run quality` PASS.
- Fresh dev server port `3019` PASS cho `/`, `/login`, `/dashboard`, `/dashboard/staff`, `/dashboard/prompts`, `/dashboard/analytics`, route 404 giả.
- Không có 500, chunk error hoặc `Cannot find module`.

## 5. Staff page map

| Nhóm | Hiện trạng | Sẽ tách sang |
|---|---|---|
| State/filter/search | Không có filter/search; state gồm staff list, loading, modal form, editing, name, telegramChatId, submitting | `hooks/useStaff.ts` |
| API calls | `staffApi.list/create/update/delete`; toggle dùng `staffApi.update` | `hooks/useStaff.ts` |
| Loading/error | Loading spinner; lỗi dùng toast, không có error panel riêng | `StaffLoadingState`, hook toast |
| List/table/card | Staff card grid với badge active/on-duty và action buttons | `StaffList.tsx` |
| Create/edit/delete form | Modal form create/edit; confirm delete | `StaffForm.tsx`, hook actions |
| Helpers/types | `Staff` interface trong page; date/initial inline | `types.ts`, `lib/staffFormatters.ts` |
| Mutation risk | Create/update/delete/toggle global staff | Smoke bằng prefix `Prompt 19C Test Staff` + cleanup |

Kết luận map:

- Page có `"use client"`.
- Dùng `useState`, `useEffect`; không dùng `useMemo`.
- API từ `@/lib/api`: `staffApi`.
- Có POST/PUT/DELETE.
- Có toast/loading, modal form, confirm delete.
- Page này dùng global staff `/api/staff`, backend `platformAdminOnly`; không dùng nested tenant staff route.
- Không có external provider call trong route staff CRUD.

## 6. Mutation safety plan

| Action | Có trong page? | Có smoke không? | Cleanup | Lý do |
|---|---|---|---|---|
| List staff | Có | Có | Không cần | Read-only, xác nhận API 200. |
| Create staff | Có | Có | Delete API + DB fallback | Dùng tên prefix `Prompt 19C Test Staff` và chat ID giả duy nhất. |
| Update staff | Có | Có | Delete API + DB fallback | Chỉ cập nhật record test vừa tạo. |
| Toggle on-duty | Có | Có | Delete API + DB fallback | Chỉ cập nhật record test vừa tạo. |
| Toggle active | Có | Có | Delete API + DB fallback | Chỉ cập nhật record test vừa tạo. |
| Delete staff | Có | Có | DB fallback kiểm leftover | Chỉ xóa record test vừa tạo, không đụng dữ liệu thật. |

## 7. Feature split design

Đã tạo:

- `dashboard/src/features/staff/hooks/useStaff.ts`
- `dashboard/src/features/staff/components/StaffHeader.tsx`
- `dashboard/src/features/staff/components/StaffGuide.tsx`
- `dashboard/src/features/staff/components/StaffForm.tsx`
- `dashboard/src/features/staff/components/StaffLoadingState.tsx`
- `dashboard/src/features/staff/components/StaffEmptyState.tsx`
- `dashboard/src/features/staff/components/StaffList.tsx`
- `dashboard/src/features/staff/lib/staffFormatters.ts`
- `dashboard/src/features/staff/types.ts`
- `dashboard/src/features/staff/index.ts`

Không tạo component filter/error vì page hiện không có filter hoặc error panel.

## 8. Files changed

Source:

- `dashboard/src/app/dashboard/staff/page.tsx`
- `dashboard/src/features/staff/**`

Docs/report:

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md`
- `report/PROMPT_19C_DASHBOARD_STAFF_FEATURE_SPLIT_REPORT.md`

## 9. UI/API behavior preservation

- Giữ nguyên visible text, className, card/list/modal layout, badges và button labels.
- Giữ nguyên route `/dashboard/staff`.
- Giữ nguyên `staffApi.list/create/update/delete`.
- Giữ nguyên create/update payload `{ name, telegramChatId }`.
- Giữ nguyên toggle payload `{ isOnDuty }` và `{ isActive }`.
- Không thêm direct `fetch()` hoặc external side effect.

## 10. Dashboard validation + route smoke

Sau refactor:

- `cd dashboard && npm run quality` PASS.
- `npm run typecheck` PASS.
- `npm run build` PASS.
- Clean `.next`, chạy lại `npm run quality` PASS.
- Fresh dev server port `3019` PASS cho `/`, `/login`, `/dashboard`, `/dashboard/staff`, `/dashboard/prompts`, `/dashboard/analytics`, `/dashboard/knowledge`, `/dashboard/settings`, `/dashboard/tenants`, `/dashboard/handoff`, `/dashboard/content-packages`, route 404 giả.
- Không có 500, server error, chunk error hoặc `Cannot find module`.

## 11. Backend/staff smoke

- Backend smoke trước refactor PASS 7/7.
- Backend + staff smoke sau refactor PASS 13/13.
- Staff mutation smoke đã chạy bằng record test prefix `Prompt 19C Test Staff`.
- Cleanup leftover = 0.
- Không in token, password hoặc credential.

## 12. Không thay đổi

- Không sửa backend source.
- Không sửa `dashboard/src/lib/api.ts`.
- Không sửa package/dependency.
- Không sửa Prisma schema/migrations.
- Không sửa `.env`, `.env.local`, `.next`, backup/temp/log.
- Không sửa Dockerfile/start-all/deploy scripts.
- Không gọi Facebook/Telegram/Gemini/Jina/Claude/DeepSeek thật.

## 13. Remaining risks

- Staff page vẫn là global staff (`/api/staff`, `platformAdminOnly`), không phải tenant staff; đây là behavior hiện hữu được giữ nguyên.
- Legacy Chatwoot references còn trong `start-all.bat` và một số `backend/scripts/*`; đây là backlog cũ, không phát sinh từ Prompt 19C.
- Nếu build xong rồi dùng lại dev server cũ, vẫn cần clean/restart để tránh stale chunk như rule Phase 19.

## 14. Final verdict

**PASS**

## 15. Next step

Prompt 19D nên chọn `appointments/page.tsx` với mutation-safe smoke riêng, hoặc `content-packages/page.tsx` nếu chỉ tách UI và không chạy migrate action. Chưa nên chọn `settings`, `knowledge`, `tenants` nếu chưa có rollback/external side-effect plan rõ.
