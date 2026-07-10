# PHASE 19 — DASHBOARD FEATURE SPLIT PLAN

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
