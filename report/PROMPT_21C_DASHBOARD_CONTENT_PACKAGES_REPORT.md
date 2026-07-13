# PROMPT 21C-SAFE — DASHBOARD CONTENT-PACKAGES FEATURE SPLIT REPORT

Ngày thực hiện: 2026-07-13
Trạng thái: **PASS**

## 1. Mục tiêu

Tách trang `dashboard/src/app/dashboard/content-packages/page.tsx` thành feature module mỏng theo Phase 19, giữ nguyên UI/behavior/API contract và tuyệt đối không chạy migrate/import/action trong smoke.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit nền | `340d854 Consolidate another safe dashboard read route` tồn tại ở lịch sử gần nhất |
| Working tree trước patch | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked sensitive env exact scan | Không có env thật tracked/staged |
| Regex env scan theo prompt | Có match `backend/.env.example` là sample tracked hợp lệ, không phải env thật |

Không đọc/in env thật, token hoặc secret.

## 3. Context files read

- `report/PROMPT_21B_4_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `dashboard/src/app/dashboard/content-packages/page.tsx`
- Existing feature pattern:
  - `dashboard/src/features/analytics/**`
  - `dashboard/src/features/prompts/**`
  - `dashboard/src/features/staff/**`
  - `dashboard/src/features/appointments/**`

Không đọc env thật.

## 4. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

## 5. Page audit

File audit: `dashboard/src/app/dashboard/content-packages/page.tsx` trước patch, 671 LOC.

| Khu vực | Dòng/logic | Side effect? | API dùng | Có migrate/action? | Có external? | Có thể tách? | Ghi chú |
|---|---|---|---|---|---|---|---|
| Imports/types | 1-29 | Không | Không | Không | Không | Có | Chuyển type sang `types.ts`, icon import chuyển vào component tương ứng. |
| Auth/state/form/modal | 32-56 | Không trực tiếp | Không | Không | Không | Có | Chuyển vào `useContentPackages`. |
| Data loading | 58-79 | Có, read | `contentPackagesApi.list`, `listItems` | Không | Không | Có | Giữ error text cũ. |
| Select/filter/permission | 82-98 | Không | Không | Không | Không | Có | `globalPackages`, `tenantPackages`, `canEditPackage`. |
| Package create/update/delete | 100-153 | Có, write | `create`, `update`, `delete` | Không | Không | Có | Giữ payload, confirm và error text cũ; không chạy trong smoke. |
| Item create/update/delete | 155-207 | Có, write | `createItem`, `updateItem`, `deleteItem` | Không | Không | Có | Giữ tag parsing, order, payload và confirm cũ; không chạy trong smoke. |
| Migrate từ campaigns | 210-221 | Có, write/action | `migrateFromCampaigns` | Có | Không | Có nhưng khóa smoke | **MIGRATE_ACTION_LOCKED_NOT_EXECUTED**. Giữ handler cũ nguyên behavior; không click/gọi. |
| Formatter/icon | 224-243 | Không | Không | Không | Không | Có | Label formatter chuyển sang `lib`, icon giữ trong detail component. |
| Loading/header/error/list/detail/modal render | 246-631 | Không trực tiếp | Không | Có nút migrate render | Không | Có | UI text/className/layout giữ nguyên. |
| Package row | 633-671 | Không | Không | Không | Không | Có | Chuyển vào `ContentPackagesList`. |

## 6. Feature structure created

```text
dashboard/src/features/content-packages/
  components/
    ContentPackageDetails.tsx
    ContentPackageFormModal.tsx
    ContentPackageItemFormModal.tsx
    ContentPackagesErrorBanner.tsx
    ContentPackagesHeader.tsx
    ContentPackagesList.tsx
    ContentPackagesLoadingState.tsx
  hooks/
    useContentPackages.ts
  lib/
    contentPackageFormatters.ts
  README.md
  index.ts
  types.ts
```

Không tạo component rỗng. Không thêm dependency.

## 7. Patch summary

- `page.tsx` giảm từ 671 LOC xuống 85 LOC, giữ `'use client'`.
- `useContentPackages` giữ data loading, package CRUD, item CRUD, selected package state, error state và migrate handler.
- Components mới giữ render header, error/loading state, package list, detail/items và 2 modal form.
- `types.ts` gom type `ContentPackage`, `ContentPackageItem`, form state.
- `contentPackageFormatters.ts` gom label formatter cho item type.
- `README.md` feature cập nhật trạng thái và cảnh báo migrate.

## 8. Behavior/API contract preservation

Giữ nguyên:

- Route: `/dashboard/content-packages`.
- API facade: `contentPackagesApi` hiện hữu; không sửa `dashboard/src/lib/api.ts`.
- API methods: `list`, `listItems`, `create`, `update`, `delete`, `createItem`, `updateItem`, `deleteItem`, `migrateFromCampaigns`.
- Form payload package và item.
- Confirm/alert/error text.
- Loading/empty/error state.
- UI text/className/layout grid/list/detail/modal.
- Platform admin visibility của nút migrate.

## 9. Migrate/action safety

| Check | Kết quả |
|---|---|
| Có migrate/import/from-campaigns action không? | Có, tồn tại từ code cũ |
| Có xóa hoặc đổi behavior không? | Không |
| Có chạy/click/gọi trong smoke không? | Không |
| Trạng thái | **MIGRATE_ACTION_LOCKED_NOT_EXECUTED** |

Handler `migrate` chỉ được di chuyển sang hook và vẫn yêu cầu `confirm()` trước khi gọi API. Prompt này không kích hoạt handler đó bằng UI hoặc HTTP.

## 10. Dashboard validation

| Lệnh | Kết quả |
|---|---|
| `cd dashboard && npx --no-install tsc --noEmit` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |

Build route `/dashboard/content-packages` PASS, không chunk error.

## 11. Runtime route smoke

Runtime smoke dashboard chạy trên dev server tạm `127.0.0.1:3019`, process do prompt này tạo và đã dừng sau smoke.

| Route | Kết quả |
|---|---|
| `GET /login` | 200 |
| `GET /dashboard` | 200 |
| `GET /dashboard/content-packages` | 200 |
| `GET /dashboard/__prompt_21c_fake_404__` | 404 |

Không login bằng token, không click UI, không create/update/delete, không migrate/import/action.

## 12. Safety scans

| Scan | Kết quả |
|---|---|
| `rg -n "fetch\\(" dashboard/src/app/dashboard/content-packages dashboard/src/features/content-packages dashboard/src/lib/api.ts` | Không có match |
| `rg -n "migrate|migration|import|from-campaigns|external|facebook|webhook" dashboard/src/app/dashboard/content-packages dashboard/src/features/content-packages` | Match import/module text và handler migrate được preserve; không external/webhook/facebook mới |
| `rg -n "process\\.env|NEXT_PUBLIC|SECRET|TOKEN|PASSWORD" dashboard/src/app/dashboard/content-packages dashboard/src/features/content-packages` | Không có match |
| `rg -n "npm install|yarn add|pnpm add" .` | Chỉ match script/docs/report lịch sử cũ; prompt này không thêm dependency |
| `rg -n "prisma db push|accept-data-loss|migrate reset" .` | Chỉ match docs/report/script cảnh báo lịch sử cũ; prompt này không thêm destructive command |

## 13. Docs changed

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `report/PROMPT_21C_DASHBOARD_CONTENT_PACKAGES_REPORT.md`

## 14. Không thay đổi

| Câu hỏi | Kết quả |
|---|---|
| Có sửa backend không? | Không |
| Có sửa API contract không? | Không |
| Có sửa schema/migration/package không? | Không |
| Có thêm dependency không? | Không |
| Có chạy migrate/import/action không? | Không |
| Có gọi external không? | Không |
| Có sửa webhook không? | Không |
| Có claim Meta verified không? | Không |
| Có claim production ready không? | Không |

Không sửa `backend/src/**`, `backend/prisma/**`, package/lock, dashboard API client/auth/config, Docker/start scripts, env thật, `.next` tracked, backups, tmp-runtime hoặc logs.

## 15. Remaining risks

- Phase 19 vẫn **Started**, chưa Done; các page dashboard nặng còn lại cần prompt riêng.
- `content-packages` vẫn có write handlers và migrate action trong UI như behavior cũ; smoke của prompt này cố ý không chạy mutation/action.
- `knowledge`, `handoff`, `settings`, `tenants` vẫn là khu vực dashboard rủi ro cao.
- Meta verify challenge vẫn pending; Meta POST event thật pending; production rollout pending.

## 16. Final verdict

**PASS**

Dashboard `content-packages` đã được tách an toàn thành feature module, page orchestrator mỏng, validation/build/runtime smoke GET-only PASS, migrate action được preserve nhưng không executed.

## 17. Next step

Tiếp theo nên chọn một dashboard page nhỏ hơn như `quick-replies` hoặc `campaigns` nếu có prompt riêng và khóa mutation/action rõ, hoặc quay lại Phase 21 backend với route GET read-only nhỏ nếu audit chứng minh đủ an toàn. Không chọn `knowledge`, `handoff`, `settings`, `tenants` nếu chưa có kế hoạch riêng cho upload/external/realtime/tenant risk.
