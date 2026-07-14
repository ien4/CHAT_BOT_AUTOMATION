# PROMPT 21C-2-SAFE — DASHBOARD QUICK-REPLIES FEATURE SPLIT REPORT

Ngày thực hiện: 2026-07-14
Trạng thái: **PASS**

## 1. Mục tiêu

Tách trang `dashboard/src/app/dashboard/quick-replies/page.tsx` thành feature module sạch, tối ưu và dễ bảo trì theo pattern Phase 19, giữ nguyên UI/behavior/API contract và không chạy mutation/action trong smoke.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit nền | `605fcc3 Fix dashboard runtime chunk error after content packages split` tồn tại |
| Commit 21C | `672792a Split dashboard content-packages feature` tồn tại |
| Working tree trước patch | Có `Bug_21C_SAFE.md` untracked từ prompt fix trước; không sửa/stage file này |
| Ignored artifacts | `.next`, `.env.local`, `backend/.env`, node_modules/backups/tmp-runtime đều ignored |
| Tracked env scan | Match `backend/.env.example` là sample tracked hợp lệ, không phải env thật |

Không đọc/in env thật, token hoặc secret.

## 3. Context files read

- `report/PROMPT_21C_FIX_DASHBOARD_RUNTIME_CHUNK_ERROR_REPORT.md`
- `report/PROMPT_21C_DASHBOARD_CONTENT_PACKAGES_REPORT.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- Existing feature patterns:
  - `dashboard/src/features/analytics/**`
  - `dashboard/src/features/prompts/**`
  - `dashboard/src/features/staff/**`
  - `dashboard/src/features/appointments/**`
  - `dashboard/src/features/content-packages/**`
- `dashboard/src/app/dashboard/quick-replies/page.tsx`
- `dashboard/src/features/quick-replies/README.md`
- `dashboard/src/lib/api.ts` quick reply facade

Không đọc env thật.

## 4. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

## 5. Page audit

File audit: `dashboard/src/app/dashboard/quick-replies/page.tsx` trước patch, 182 LOC.

| Khu vực | Logic hiện tại | Side effect? | API dùng | Mutation/action? | Có external? | Có thể tách? | Ghi chú |
|---|---|---|---|---|---|---|---|
| Imports/types | React hooks, `quickReplyMenusApi`, `useAuth`, `TenantScopeBanner`, icons, `INTENT_TYPES`, `QuickReplyMenu` | Không | Không | Không | Không | Có | Chuyển type/formatter sang feature. |
| State/form/modal | `menus`, `loading`, `error`, `showForm`, `editMenu`, `form` | Không trực tiếp | Không | Không | Không | Có | Chuyển vào hook. |
| Data loading/list | `fetchMenus()` gọi `quickReplyMenusApi.list()` theo `selectedTenantId` | Có, read | `list` | Không | Không | Có | Giữ error text `Lỗi tải danh sách menu`. |
| Create/update | `save()` validate item, gọi create/update, đóng modal, reload list | Có, write | `create`, `update` | Có | Không | Có | Preserve handler; không chạy trong smoke. |
| Delete | `del()` confirm rồi gọi delete, reload list | Có, write | `delete` | Có | Không | Có | Preserve confirm `Xóa menu này?`; không chạy trong smoke. |
| Formatter/helper | intent label từ `INTENT_TYPES` | Không | Không | Không | Không | Có | Chuyển vào `quickReplyFormatters.ts`. |
| Loading/error render | spinner + error banner | Không | Không | Không | Không | Có | Giữ className/text. |
| Empty/list render | empty card + menu cards/items | Không | Không | Không | Không | Có | Giữ UI/className. |
| Form modal render | intent/pageId/active/items/add/remove/save | Không trực tiếp | Không | Save button gọi mutation handler | Không | Có | Giữ text, className và disabled behavior. |

## 6. Feature structure created

```text
dashboard/src/features/quick-replies/
  components/
    QuickRepliesHeader.tsx
    QuickRepliesLoadingState.tsx
    QuickRepliesErrorBanner.tsx
    QuickRepliesEmptyState.tsx
    QuickRepliesList.tsx
    QuickReplyFormModal.tsx
  hooks/
    useQuickReplies.ts
  lib/
    quickReplyFormatters.ts
  README.md
  index.ts
  types.ts
```

Không tạo component rỗng. Không thêm dependency.

## 7. Patch summary

- `page.tsx` giảm từ 182 LOC xuống 52 LOC, giữ `'use client'`.
- `useQuickReplies` giữ data loading, form state, create/update/delete handlers và selected tenant reload.
- Components mới giữ render header, loading/error/empty/list và form modal.
- `types.ts` gom `QuickReplyMenu`, `QuickReplyItem`, `QuickReplyFormState`.
- `quickReplyFormatters.ts` gom `INTENT_TYPES` và label helper.
- `README.md` feature cập nhật trạng thái và cảnh báo mutation locked.

## 8. Behavior/API contract preservation

Giữ nguyên:

- Route: `/dashboard/quick-replies`.
- API facade: `quickReplyMenusApi` hiện hữu; không sửa `dashboard/src/lib/api.ts`.
- API methods/path/payload: `list`, `create`, `update`, `delete`.
- UI text, className và layout.
- Confirm text `Xóa menu này?`.
- Error text `Lỗi tải danh sách menu`, `Cần ít nhất 1 item có title + payload`, `Lỗi lưu menu`, `Lỗi xóa menu`.
- Form defaults, valid item filtering, global pageId behavior và disabled intent type khi edit.

## 9. Mutation/action safety

| Check | Kết quả |
|---|---|
| Có mutation không? | Có: create/update/delete quick reply menu |
| Có external/action nguy hiểm không? | Không |
| Có chạy mutation trong smoke không? | Không |
| Trạng thái | **LOCKED_NOT_EXECUTED** |

Runtime smoke chỉ dùng GET route, không click UI và không gọi create/update/delete.

## 10. Dashboard validation

| Lệnh | Kết quả |
|---|---|
| `cd dashboard && npx --no-install tsc --noEmit` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| Root `git diff --check` | PASS |

## 11. Clean `.next` + runtime route smoke

Đã clean `.next`: **Có**. `.next` là ignored build artifact, không commit.

Sau clean:

- `cd dashboard && npm run typecheck` PASS.
- `cd dashboard && npm run build` PASS.
- Fresh dev server tạm: `http://127.0.0.1:3019`.

| Route | Kết quả |
|---|---|
| `GET /login` | 200 |
| `GET /dashboard` | 200 |
| `GET /dashboard/quick-replies` | 200 |
| `GET /dashboard/content-packages` | 200 |
| `GET /dashboard/prompts` | 200 |
| `GET /dashboard/analytics` | 200 |
| `GET /dashboard/settings` | 200 |
| `GET /dashboard/campaigns` | 200 |
| `GET /dashboard/__fake_21c_2__` | 404 hợp lệ |

Dev server tạm đã dừng; port `3019` và `3002` free sau cleanup.

## 12. Chunk error regression check

Không tái hiện:

- `Cannot find module './*.js'`
- `Cannot read properties of undefined (reading 'call')`
- vendor chunk ENOENT
- static chunk 404 gây page 500

Dev log sau smoke chỉ có 404 hợp lệ của route giả.

## 13. Safety scans

| Scan | Kết quả |
|---|---|
| `fetch(` trong quick-replies/page/lib API scan | Không có match |
| `process.env/NEXT_PUBLIC/SECRET/TOKEN/PASSWORD` trong feature/page | Không có match |
| `migrate/migration/import/external/facebook/webhook/provider` trong feature/page | Chỉ match `import` statements do regex rộng; không external/webhook/provider runtime |
| `npm install/yarn add/pnpm add` | Chỉ match docs/script/report lịch sử cũ; không thêm dependency |
| `prisma db push/accept-data-loss/migrate reset` | Chỉ match docs/report/script lịch sử cũ; không thêm destructive command |
| Chunk bug signature trong `report docs dashboard/src` | Chỉ match docs/report lịch sử; không source mới hoặc runtime log mới |

## 14. Docs changed

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `report/PROMPT_21C_2_DASHBOARD_QUICK_REPLIES_REPORT.md`

## 15. Không thay đổi

| Câu hỏi | Kết quả |
|---|---|
| Có sửa backend không? | Không |
| Có sửa schema/package không? | Không |
| Có thêm dependency không? | Không |
| Có chạy mutation/action không? | Không |
| Có gọi external không? | Không |
| Có sửa webhook không? | Không |
| Có claim Meta verified không? | Không |
| Có claim production ready không? | Không |

Không sửa env thật, `.next` trong Git, logs, backups hoặc tmp-runtime.

## 16. Remaining risks

- Phase 19 vẫn **Started**, chưa Done; các dashboard page nặng còn lại cần prompt riêng.
- `quick-replies` vẫn có mutation handlers như behavior cũ; prompt này không runtime-test mutation vì không có rollback/test data contract.
- `settings`, `knowledge`, `handoff`, `tenants` vẫn là khu vực rủi ro cao.
- Meta verify challenge vẫn pending; Meta POST event thật pending; production rollout pending.

## 17. Final verdict

**PASS**

Dashboard `quick-replies` đã được tách an toàn thành feature module, page orchestrator mỏng, validation/build/clean cache/fresh smoke PASS, chunk bug không tái hiện và mutation không executed.

## 18. Next step

Tiếp theo có thể tiếp tục Phase 19 với candidate nhỏ khác như `campaigns` chỉ khi upload/write được khóa rõ, hoặc quay lại Phase 21 backend với route GET read-only nhỏ nếu audit chứng minh đủ an toàn.
