# PHASE 19 — DASHBOARD FEATURE SPLIT PLAN

## Prompt 19D - `appointments/page.tsx` done

Ngày cập nhật: 2026-07-11

Kết quả: **PASS WITH WARNINGS**. Candidate #4 `dashboard/src/app/dashboard/appointments/page.tsx` đã được tách sang `dashboard/src/features/appointments/**` theo pattern hook + components + formatter/type/barrel. Page app route chỉ còn orchestrator mỏng, giữ nguyên route/UI/API behavior.

File nguồn chính sau split:

- `dashboard/src/app/dashboard/appointments/page.tsx`
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

Rule giữ lại cho các prompt Phase 19 tiếp theo:

1. Luôn kiểm DB/backend readiness trước.
2. Sau build phải clean `.next` và route smoke thật bằng fresh dev server.
3. Mutation chỉ smoke với test prefix + cleanup chắc chắn.
4. Không trigger notification/external side effect thật; nếu route có notification risk, mutation smoke là NOT RUN BY DESIGN.
5. Không stage `.env`, `.env.local`, `.next`, backup, temp/log.

Ứng viên còn lại nếu tiếp tục Phase 19: `content-packages/page.tsx` chỉ khi khóa rõ không chạy migrate action. Phase 21 chưa bắt đầu; Prompt 21A nếu làm thì chỉ nên audit/plan, không move code hàng loạt.

## Prompt 19C - `staff/page.tsx` done

Ngày cập nhật: 2026-07-11

Kết quả: **PASS**. Candidate #3 `dashboard/src/app/dashboard/staff/page.tsx` đã được tách sang `dashboard/src/features/staff/**` theo pattern hook + components + formatter/type/barrel. Page app route chỉ còn orchestrator mỏng, giữ nguyên route/UI/API behavior.

File nguồn chính sau split:

- `dashboard/src/app/dashboard/staff/page.tsx`
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

Rule giữ lại cho các prompt Phase 19 tiếp theo:

1. Luôn kiểm DB/backend readiness trước; nếu P1001 do `localhost:5433`, chỉ start `bbotech-pgvector-local`, không `db push`, không reset DB.
2. Sau split dashboard phải chạy `npm run quality`, `npm run typecheck`, `npm run build`.
3. Sau build phải clean `.next` và route smoke thật bằng fresh dev server port sạch.
4. Mutation chỉ smoke với test prefix + cleanup chắc chắn; không delete/update dữ liệu thật.
5. Không stage `.env`, `.env.local`, `.next`, backup, temp/log.

Ứng viên 19D: `appointments/page.tsx` nếu có mutation checklist riêng, hoặc `content-packages/page.tsx` nếu chỉ tách UI và khóa rõ không chạy migrate action. Vẫn chưa chọn `settings`, `knowledge`, `tenants` nếu chưa có rollback/external side-effect riêng.

## Prompt 19B - `prompts/page.tsx` done

Ngày cập nhật: 2026-07-11

Kết quả: **PASS**. Candidate #2 `dashboard/src/app/dashboard/prompts/page.tsx` đã được tách sang `dashboard/src/features/prompts/**` theo pattern hook + components + formatter/type/barrel. Page app route chỉ còn orchestrator mỏng, giữ nguyên route/UI/API behavior.

File nguồn chính sau split:

- `dashboard/src/app/dashboard/prompts/page.tsx`
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

Rule giữ lại cho các prompt Phase 19 tiếp theo:

1. Trước backend smoke, xác nhận DB local `bbotech-pgvector-local` đang chạy; nếu gặp P1001 do `localhost:5433`, chỉ start container này, không `db push`, không reset DB.
2. Sau split dashboard phải chạy `npm run quality`, `npm run typecheck`, `npm run build`.
3. Sau build phải clean/restart dev server nếu cần và route smoke thật bằng port sạch, tối thiểu `/login`, `/dashboard`, route vừa tách, route 404 giả, và vài route dashboard trọng yếu.
4. Không kết luận PASS nếu còn 500/chunk error kiểu `Cannot find module './<number>.js'`.
5. Không stage `.env`, `.env.local`, `.next`, backup, temp/log.

Ứng viên kế tiếp: `staff/page.tsx` hoặc `appointments/page.tsx` nếu prompt sau có checklist mutation rõ. Không chọn `settings`, `knowledge`, `tenants` cho tới khi có kế hoạch rollback/external side effect riêng.

Ngày cập nhật: 2026-07-10 (Prompt 10C — readiness, CHƯA sửa page)

Kế hoạch tách feature cho dashboard. Prompt 10C chỉ chọn candidate + lập tiêu chí; **không** sửa page UI.

## 1. Tiêu chí chọn candidate

1. Không external side effect (upload/reindex/crawl/gọi provider).
2. Không phải auth provider core.
3. Read-only hoặc write nhẹ, dễ tách thành component/hook nhỏ.
4. Validation rõ bằng `tsc --noEmit` + `next build`.
5. Không đổi UI text/layout (chỉ tách cấu trúc).
6. Backend liên quan đã ổn định/harden.

## 2. Bảng audit page (line count + side effect)

| Page | LOC | Side effect | Ứng viên |
|---|---|---|---|
| `tenants/page.tsx` | 1127 | Write (tạo/sửa tenant) | Không (lớn + write, để sau) |
| `settings/page.tsx` | 725 | Write + provider/external | Không (Settings/Providers) |
| `content-packages/page.tsx` | 671 | Write | Không |
| `handoff/page.tsx` | 581 | Handoff realtime | Không (loại theo prompt) |
| **`analytics/page.tsx`** | **374** | **Read-only** (`analyticsApi.get`) | **CÓ — candidate #1** |
| `knowledge/page.tsx` | 358 | Upload/reindex/crawl | Không (external side effect) |
| `prompts/page.tsx` | 318 | Write | Không (ưu tiên sau) |
| các page nhỏ khác | <320 | mixed | Sau |

## 3. Candidate #1 — `dashboard/src/app/dashboard/analytics/page.tsx` — ✅ DONE (Prompt 19A)

Đã tách 374→54 dòng sang `features/analytics/**` (hook `useAnalytics` + 9 components + formatters + types + barrel). UI/text/layout/API giữ nguyên; dashboard quality PASS. Chi tiết: `report/PROMPT_19A_DASHBOARD_ANALYTICS_FEATURE_SPLIT_REPORT.md`.


Vì sao chọn:
- **Read-only**: chỉ `analyticsApi.get({ days })` từ `@/lib/api`; không POST/PUT/DELETE/upload.
- Backend analytics đã harden ở **Prompt 09B** (raw SQL parameterized) → ít rủi ro thay đổi phía server.
- Đã có sẵn folder đích `dashboard/src/features/analytics/` (README placeholder nhắm đúng mục tiêu).
- 374 LOC — vừa đủ để tách chart/table/summary components + 1 data hook.
- Validation dễ: `tsc --noEmit` + `next build` (route `/dashboard/analytics` build PASS ở 10C).

## 4. Phạm vi cho Prompt 19A

Được phép sửa:
- `dashboard/src/app/dashboard/analytics/page.tsx` (chuyển thành orchestrator mỏng).
- `dashboard/src/features/analytics/**` (tạo components/hook: ví dụ `useAnalytics.ts`, `AnalyticsSummary.tsx`, `AnalyticsCharts.tsx`, `AnalyticsTable.tsx`).
- `docs/*` + report Prompt 19A.

KHÔNG được sửa:
- Backend `analyticsApi`/route `/api/analytics` hoặc raw SQL (đã harden 09B).
- Page/feature khác ngoài analytics.
- Prisma schema/migrations, RAG/handoff/webhook/bot.
- `package.json`/dependency, Dockerfile/scripts.
- UI text/layout hiển thị (giữ nguyên hành vi & giao diện).

## 5. Validation/smoke cho Prompt 19A

- `cd dashboard && npm run typecheck` PASS.
- `cd dashboard && npm run build` PASS; route `/dashboard/analytics` build không lỗi.
- (Tùy chọn) render smoke `/dashboard/analytics` local; API `GET /api/analytics` (token) 200 (dry-run local đã PASS ở 10C).
- Không đổi response shape / không gọi external.

## 6. Rollback plan

- Thay đổi chỉ nằm trong analytics page + `features/analytics/**` → revert bằng `git checkout -- <files>` hoặc revert commit 19A.
- Không có DB/migration/dependency change nên rollback thuần code.

## 7. Sau 19A

- Ứng viên kế tiếp gợi ý: `prompts/page.tsx` (write nhẹ, đã có repository backend) hoặc `staff/page.tsx`. Settings/Knowledge/Tenants để sau cùng vì write/external nặng.

## 8. Prompt 19A-FIX - Runtime regression follow-up

Prompt 19A phát sinh báo lỗi runtime Next.js sau khi chạy dev/build: `Cannot find module './20.js'` từ `.next/server/webpack-runtime.js` và `_not-found`.

Kết quả Prompt 19A-FIX:

- Không tìm thấy bug source trong analytics split: client boundary/import/barrel hợp lệ, không cần rollback.
- Lỗi được phân loại là stale `.next` cache/dev server mismatch sau build/dev process cũ.
- Đã clean `dashboard/.next`, chạy lại `npm run quality`, start dev server fresh port 3019 và route smoke `/dashboard`, `/dashboard/analytics`, `_not-found` cùng các route dashboard trọng yếu: PASS.
- Backend quality + runtime smoke tối thiểu PASS; không sửa backend.

Rule mới cho Prompt 19B trở đi:

1. Không chỉ dựa vào `next build`; sau mỗi feature split phải chạy dev server thật trên port sạch và smoke route liên quan.
2. Smoke tối thiểu: `/login`, `/dashboard`, route vừa tách, `_not-found`, và một vài route dashboard trọng yếu.
3. Nếu thấy `Cannot find module './<number>.js'`, phải audit `.next/server`, dừng dev server cũ, clean `.next`, rebuild và smoke lại trước khi kết luận lỗi source.
4. Chỉ tiếp tục Prompt 19B khi runtime smoke PASS hoặc PASS WITH WARNINGS có lý do rõ.
