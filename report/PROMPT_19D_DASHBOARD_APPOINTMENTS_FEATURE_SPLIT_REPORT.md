# PROMPT 19D - DASHBOARD APPOINTMENTS FEATURE SPLIT REPORT

Ngày thực hiện: 2026-07-11
Trạng thái: **PASS WITH WARNINGS**

## 1. Mục tiêu

Tách `dashboard/src/app/dashboard/appointments/page.tsx` sang `dashboard/src/features/appointments/**`, giữ nguyên route `/dashboard/appointments`, UI/text/layout/className và API contract hiện tại.

## 2. Preflight

- Branch: `chore/prompt-05r-docs-local-run`.
- Commit 19C `a860670 Split staff dashboard feature` tồn tại.
- Working tree sạch trước khi sửa, ngoài ignored artifacts.
- `.env`, `.env.local`, `.next` đều ignored; chỉ env sample tracked.
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
- Clean `.next`, chạy lại `npm run quality` PASS.
- Fresh dev server port `3019` PASS cho `/`, `/login`, `/dashboard`, `/dashboard/appointments`, `/dashboard/staff`, `/dashboard/prompts`, `/dashboard/analytics`, route 404 giả.
- Không có 500, chunk error hoặc `Cannot find module`.

## 5. Appointments page map

| Nhóm | Hiện trạng | Sẽ tách sang |
|---|---|---|
| State/filter/search | State gồm appointments, loading, page, totalPages, statusFilter; không có search | `hooks/useAppointments.ts`, `AppointmentFilters.tsx` |
| API calls | `appointmentsApi.list({ page, limit: 20, status })`, `appointmentsApi.update(id, { status })` | `hooks/useAppointments.ts` |
| Loading/error | Loading spinner; lỗi dùng toast, không có error panel riêng | `AppointmentLoadingState`, hook toast |
| List/table/card/calendar | Card grid với thông tin khách/SĐT/ngày/giờ/status/notes/createdAt | `AppointmentList`, `AppointmentCard`, `AppointmentStatusBadge` |
| Create/edit/update status/delete form | Không có create/delete/form; chỉ update status pending -> confirmed/cancelled | hook action giữ nguyên, mutation smoke không chạy |
| Helpers/types | Status badge map và `date-fns` format inline | `types.ts`, `lib/appointmentFormatters.ts` |
| Notification/external risk | Backend `PUT /appointments/:id` gọi `notifications/appointments` khi đổi status/notes | Không smoke mutation route |
| Mutation risk | Update status có thể gửi notification thật | `NOT RUN BY DESIGN`; chỉ smoke GET list |

Kết luận map:

- Page có `"use client"`.
- Dùng `useState`, `useEffect`; không dùng `useMemo`.
- API từ `@/lib/api`: `appointmentsApi`.
- Có PUT update status; không có POST/DELETE trong page.
- Có toast/loading; không có modal/form/confirm delete.
- API appointments dùng `getTenantScope(req)`, platform admin có thể dùng `tenantScope`; tenant admin bị lock theo tenantId.
- Không có external provider call trong frontend; backend update status/notes có notification risk.

## 6. Mutation + notification safety plan

| Action | Có trong page? | Có khả năng notification/external? | Có smoke không? | Cleanup | Lý do |
|---|---|---|---|---|---|
| List appointments | Có | Không | Có | Không cần | Read-only GET, xác nhận 200 + response shape. |
| Create appointment | Không | Có thể ở bot tools, không thuộc page | Không | Không cần | Page không có create API/flow. |
| Update status confirmed/cancelled | Có | Có | Không | Không cần | Backend route gọi appointment notifications khi status đổi. |
| Update notes | Không trong page | Có | Không | Không cần | Backend route có notification khi notes đổi. |
| Delete appointment | Không | Không rõ | Không | Không cần | Page không có delete API/flow. |

Mutation status: **NOT RUN BY DESIGN**. Read API smoke PASS.

## 7. Feature split design

Đã tạo:

- `dashboard/src/features/appointments/hooks/useAppointments.ts`
- `dashboard/src/features/appointments/components/AppointmentsHeader.tsx`
- `dashboard/src/features/appointments/components/AppointmentFilters.tsx`
- `dashboard/src/features/appointments/components/AppointmentLoadingState.tsx`
- `dashboard/src/features/appointments/components/AppointmentEmptyState.tsx`
- `dashboard/src/features/appointments/components/AppointmentList.tsx`
- `dashboard/src/features/appointments/components/AppointmentCard.tsx`
- `dashboard/src/features/appointments/components/AppointmentStatusBadge.tsx`
- `dashboard/src/features/appointments/components/AppointmentPagination.tsx`
- `dashboard/src/features/appointments/lib/appointmentFormatters.ts`
- `dashboard/src/features/appointments/types.ts`
- `dashboard/src/features/appointments/index.ts`

Không tạo form/error component vì page hiện không có form hoặc error panel riêng.

## 8. Files changed

Source:

- `dashboard/src/app/dashboard/appointments/page.tsx`
- `dashboard/src/features/appointments/**`

Docs/report:

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md`
- `report/PROMPT_19D_DASHBOARD_APPOINTMENTS_FEATURE_SPLIT_REPORT.md`

## 9. UI/API behavior preservation

- Giữ nguyên visible text, className, filter buttons, card layout, badge labels, action button titles và pagination text.
- Giữ nguyên route `/dashboard/appointments`.
- Giữ nguyên `appointmentsApi.list` và `appointmentsApi.update`.
- Giữ nguyên list params `{ page, limit: 20, status: statusFilter || undefined }`.
- Giữ nguyên update payload `{ status }`.
- Không thêm direct `fetch()` hoặc external side effect.

## 10. Dashboard validation + route smoke

Sau refactor:

- `cd dashboard && npm run quality` PASS.
- `npm run typecheck` PASS.
- `npm run build` PASS.
- Clean `.next`, chạy lại `npm run quality` PASS.
- Fresh dev server port `3019` PASS cho `/`, `/login`, `/dashboard`, `/dashboard/appointments`, `/dashboard/staff`, `/dashboard/prompts`, `/dashboard/analytics`, `/dashboard/knowledge`, `/dashboard/settings`, `/dashboard/tenants`, `/dashboard/handoff`, `/dashboard/content-packages`, route 404 giả.
- Không có 500, server error, chunk error hoặc `Cannot find module`.

## 11. Backend/appointments smoke

- Backend smoke trước refactor PASS 7/7.
- Backend + appointments read smoke sau refactor PASS 8/8.
- `GET /api/appointments?page=1&limit=20` PASS với token test.
- Mutation smoke: **NOT RUN BY DESIGN** do notification risk.
- Cleanup leftover prefix `Prompt 19D Test Appointment` / `test-19d` = 0.
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

- Status update UI vẫn gọi backend route có notification side effect như trước; behavior được giữ nguyên nhưng không smoke mutation thật.
- Legacy Chatwoot references còn trong `start-all.bat` và một số `backend/scripts/*`; đây là backlog cũ, không phát sinh từ Prompt 19D.
- Nếu build xong rồi dùng lại dev server cũ, vẫn cần clean/restart để tránh stale chunk.

## 14. Phase 21 readiness note

Phase 21 hiện vẫn **Planned**. Prompt 19D không bắt đầu Phase 21 và không move code hàng loạt ngoài appointments feature. Nếu mở Phase 21, bước đầu nên là audit/plan-only.

## 15. Final verdict

**PASS WITH WARNINGS**

## 16. Next step

Prompt tiếp theo có thể là `content-packages/page.tsx` nếu khóa rõ không chạy migrate action, hoặc `Prompt 21A Project Structure Consolidation Audit` nếu muốn chuẩn bị Phase 21 theo hướng audit-only.
