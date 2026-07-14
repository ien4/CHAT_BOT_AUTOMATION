# PROMPT 19A — DASHBOARD ANALYTICS FEATURE SPLIT REPORT

Ngày: 2026-07-10
Branch: `chore/prompt-05r-docs-local-run`
Base commit: `1c63166 Add quality gate and Phase 19 readiness`

## 1. Mục tiêu

- Tách `dashboard/src/app/dashboard/analytics/page.tsx` thành orchestrator mỏng + `dashboard/src/features/analytics/**`.
- Giữ nguyên UI (text/layout/className/loading-error/filter days), API `analyticsApi.get` read-only.
- Không sửa backend/API/package/dependency; không redesign; không push remote.

## 2. Preflight

- Branch `chore/prompt-05r-docs-local-run` (không master/main); commit `1c63166` tồn tại; working tree sạch.
- `backend/.env`, `dashboard/.env.local` ignored & không tracked.

## 3. Baseline validation

- Dashboard `npm run quality` (typecheck + build) đã PASS ở Prompt 10C (baseline). Alias `@/* -> ./src/*` xác nhận từ `tsconfig.json`.

## 4. Analytics page map

| Nhóm | Hiện trạng (page cũ) | Đã tách sang |
|---|---|---|
| State/filter | `useState` days/data/loading/showFallbackHelp | `hooks/useAnalytics.ts` (days/data/loading) + state help cục bộ trong FallbackAnalysisCard |
| API call | `analyticsApi.get({ days })` trong `loadData` | `hooks/useAnalytics.ts` (giữ nguyên) |
| Loading/error/empty | spinner + "Không có dữ liệu" + toast lỗi | page (loading/no-data) + hook (toast) |
| Summary cards | 5 card inline | `components/AnalyticsSummaryCards.tsx` |
| Charts | Bot vs Handoff, Intent, Staff RT, Hourly, Daily | 5 component chart riêng |
| Tables/lists | Handoff Status, Fallback Analysis | `HandoffStatusCard.tsx`, `FallbackAnalysisCard.tsx` |
| Helpers/formatters | `formatTime`, `INTENT_LABELS`, `intentColors`, `handoffRate` | `lib/formatters.ts` (`formatTime`, `getHandoffRate`, `INTENT_LABELS`, `INTENT_COLORS`) |
| Types | `interface Analytics` | `types.ts` |

Xác định: page có `'use client'`; dùng `useEffect`/`useState`; không chart library ngoài (thuần div/Tailwind); có type local; không hard-coded data fallback (chỉ empty-state text); có loading/empty; có days filter; className/layout phải giữ nguyên.

## 5. Feature split design

```
dashboard/src/features/analytics/
  types.ts
  index.ts                    (barrel)
  hooks/useAnalytics.ts       ('use client')
  lib/formatters.ts
  components/
    AnalyticsFilters.tsx      ('use client' — select days)
    AnalyticsSummaryCards.tsx
    BotVsHandoffCard.tsx
    IntentDistributionCard.tsx
    StaffResponseTimesCard.tsx
    HourlyActivityCard.tsx
    DailyActivityCard.tsx     (giữ lg:col-span-2)
    HandoffStatusCard.tsx
    FallbackAnalysisCard.tsx  ('use client' — toggle help)
```

- Mỗi component 1:1 với một block UI cũ → dễ đọc, dễ verify diff, không over-abstract.
- Import qua alias `@/features/analytics`.
- `'use client'` chỉ đặt ở file interactive (hook, Filters, FallbackAnalysis); component thuần render kế thừa client boundary từ page.

## 6. Files changed

Sửa:
- `dashboard/src/app/dashboard/analytics/page.tsx` (374 → 54 dòng).

Tạo mới (`dashboard/src/features/analytics/`):
- `types.ts`, `index.ts`, `hooks/useAnalytics.ts`, `lib/formatters.ts`
- `components/`: AnalyticsFilters, AnalyticsSummaryCards, BotVsHandoffCard, IntentDistributionCard, StaffResponseTimesCard, HourlyActivityCard, DailyActivityCard, HandoffStatusCard, FallbackAnalysisCard.

Docs/report:
- `docs/status/PROJECT_PROGRESS.md`, `docs/status/FEATURE_AUDIT_CHECKLIST.md`, `docs/roadmap/REFACTOR_PLAN.md`, `docs/roadmap/PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md`, report Prompt 19A file.

## 7. UI/behavior preservation

- Text/emoji/label giữ nguyên (di chuyển verbatim).
- className/layout/grid giữ nguyên (`grid-cols-1 lg:grid-cols-2`, `card`, `lg:col-span-2`, spinner...).
- Loading spinner + "Không có dữ liệu" + toast lỗi giữ nguyên.
- Filter days (7/30/90) giữ nguyên; `useAnalytics` refetch khi days đổi giống page cũ.
- Logic dẫn xuất (`handoffRate`, `totalIntents`, `formatTime`, height %) chuyển verbatim.
- Toggle "Fallback help" giữ nguyên (state cục bộ trong component).

## 8. Validation

- `npm run quality` (dashboard) PASS: `tsc --noEmit` + `next build` 19 routes; route `/dashboard/analytics` build OK (6.12 kB).
- `git diff --check`: chỉ warning CRLF/LF Windows.
- `git diff --stat` page.tsx: +22 / -342.
- Scan `dashboard/src/features/analytics` + analytics page: chỉ `analyticsApi.get` (read-only); không POST/PUT/DELETE/fetch mới.
- Không sửa page dashboard khác (git status chỉ analytics page + feature mới).

## 9. Optional smoke

- Build PASS bao phủ compile + type. Route `/dashboard/analytics` prerender OK.
- Runtime render qua browser: NOT re-run (không cần vì build PASS + read-only); API `GET /api/analytics` (token) đã verify 200 ở Prompt 10C smoke. Không chạy dev server sót.

## 10. Không thay đổi

- Không sửa backend source/`/api/analytics`/`dashboard/src/lib/api.ts`.
- Không sửa Prisma schema/migrations, RAG/analytics raw SQL/tenant handoff/webhook/bot.
- Không sửa page dashboard khác, auth provider, Tailwind config.
- Không sửa `package.json`/`package-lock`, không thêm dependency, không `npm install`.
- Không đổi route URL, text/copy, layout; không redesign.
- Không mở/in `.env`; không push remote.

## 11. Remaining risks

- Chưa render-test bằng browser thật (build + type PASS; UI giữ verbatim nên rủi ro thấp).
- Lint vẫn chưa vào gate (ESLint chưa cài — theo 10C, ngoài phạm vi 19A).

## 12. Final verdict

**PASS**

- Analytics page tách thành hook + 9 components; UI/text/layout/API read-only giữ nguyên; dashboard quality (typecheck + build) PASS; không đụng backend/dependency.

## 13. Next step

- **Prompt 19B** — tách `dashboard/src/app/dashboard/prompts/page.tsx` (write nhẹ, backend đã có `promptTemplatesRepository`) sang `features/` theo cùng pattern (hook + components), giữ UI/behavior & API contract. Mục tiêu: tiếp tục giảm kích thước page lớn và chuẩn hóa cấu trúc feature toàn dashboard.
