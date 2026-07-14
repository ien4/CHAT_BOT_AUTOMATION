# PROMPT 21C-3-SAFE — DASHBOARD CAMPAIGNS FEATURE SPLIT REPORT

Ngày thực hiện: 2026-07-14
Trạng thái: **PASS**

## 1. Mục tiêu

Tách trang `dashboard/src/app/dashboard/campaigns/page.tsx` thành feature module sạch, tối ưu và dễ bảo trì theo pattern Phase 19, giữ nguyên UI/behavior/API contract và không chạy upload/write/mutation/action trong smoke.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit nền | `4a23b50 Split dashboard quick replies feature` tồn tại |
| Working tree trước patch | Có `Bug_21C_SAFE.md` untracked từ prompt fix trước; không sửa/stage file này |
| Ignored artifacts | `.next`, `.env.local`, `backend/.env`, node_modules/backups/tmp-runtime đều ignored |
| Tracked env scan | Match `backend/.env.example` là sample tracked hợp lệ, không phải env thật |

Không đọc/in env thật, token hoặc secret.

## 3. Context files read

- `dashboard/src/app/dashboard/campaigns/page.tsx`
- `dashboard/src/features/campaigns/README.md`
- `dashboard/src/lib/api.ts` phần `campaignsApi`
- Existing feature patterns:
  - `dashboard/src/features/content-packages/**`
  - `dashboard/src/features/quick-replies/**`
- `report/phase-19/PROMPT_21C_2_DASHBOARD_QUICK_REPLIES_REPORT.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`

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

File audit: `dashboard/src/app/dashboard/campaigns/page.tsx` trước patch, 196 LOC.

| Khu vực | Logic hiện tại | Side effect? | API dùng | Mutation/action? | Có external? | Có thể tách? | Ghi chú |
|---|---|---|---|---|---|---|---|
| Imports/types | React hooks, `campaignsApi`, `API_BASE_URL`, icons, toast, `Asset` | Không | Không | Không | Không | Có | Chuyển type/formatter sang feature. |
| State/form/modal | `campaigns`, `loading`, `showForm`, `editing`, form fields, assets, submitting/uploading | Không trực tiếp | Không | Không | Không | Có | Chuyển vào hook. |
| Data loading/list | `load()` gọi `campaignsApi.list()` | Có, read | `list` | Không | Không | Có | Giữ toast `Lỗi tải chiến dịch`. |
| Manual asset add/remove | `addAsset`, `removeAsset` chỉ đổi state local | Có, local state | Không | Không | Không | Có | Giữ validation `Nhập ít nhất 1 trường`. |
| Upload file | `handleFileUpload()` gọi `campaignsApi.upload(file)` rồi thêm asset | Có, upload/write | `upload` | Có | Không trong source | Có | Preserve handler; không chạy trong smoke. |
| Create/update | `handleSubmit()` gọi create/update rồi reload | Có, write | `create`, `update` | Có | Không | Có | Preserve handler; không chạy trong smoke. |
| Delete | `handleDelete()` confirm rồi gọi delete | Có, write | `delete` | Có | Không | Có | Preserve confirm `Xóa?`; không chạy trong smoke. |
| Formatter/helper | asset label và link `${API_BASE_URL}${asset.url}` | Không trực tiếp | Không | Không | Không | Có | Chuyển label helper sang `campaignFormatters.ts`; link giữ trong modal. |
| Loading/empty render | spinner, empty card `Chưa có chiến dịch nào` | Không | Không | Không | Không | Có | Giữ className/text. |
| List render | campaign cards, Active/Inactive, assets chips, edit/delete buttons | Không trực tiếp | Không | Button gọi mutation handler | Không | Có | Giữ UI/className. |
| Form modal render | input/textarea/upload/manual asset/footer buttons | Không trực tiếp | Không | Submit/upload buttons gọi handlers | Không | Có | Giữ accept list, text, disabled behavior. |

## 6. Feature structure created

```text
dashboard/src/features/campaigns/
  components/
    CampaignFormModal.tsx
    CampaignsEmptyState.tsx
    CampaignsHeader.tsx
    CampaignsList.tsx
    CampaignsLoadingState.tsx
  hooks/
    useCampaigns.ts
  lib/
    campaignFormatters.ts
  README.md
  index.ts
  types.ts
```

Không tạo component rỗng. Không thêm dependency.

## 7. Patch summary

- `page.tsx` giảm từ 196 LOC xuống 57 LOC, giữ `'use client'`.
- `useCampaigns` giữ data loading, form state, upload, create/update/delete handlers và reset/open form behavior.
- Components mới giữ render header, loading, empty state, campaign list và campaign form modal.
- `types.ts` gom `Campaign`, `CampaignAsset`.
- `campaignFormatters.ts` gom asset label cho form/list để giữ truncation 40/30 ký tự.
- `README.md` feature cập nhật trạng thái và cảnh báo upload/mutation locked.

## 8. Behavior/API contract preservation

Giữ nguyên:

- Route: `/dashboard/campaigns`.
- API facade: `campaignsApi` hiện hữu; không sửa `dashboard/src/lib/api.ts`.
- API methods/path/payload: `list`, `upload`, `create`, `update`, `delete`.
- UI text, className và layout.
- Toast/confirm text: `Lỗi tải chiến dịch`, `Nhập ít nhất 1 trường`, `Tài liệu đã được tải lên`, `Lỗi upload tài liệu`, `Đã cập nhật`, `Đã tạo chiến dịch`, `Lỗi lưu`, `Xóa?`, `Đã xóa`, `Lỗi xóa`.
- Upload accept list: `.pdf,.docx,.txt,.md,.json,.png,.jpg,.jpeg,.gif,.webp`.
- Asset link behavior: `href={`${API_BASE_URL}${asset.url}`}`, `target="_blank"`, `rel="noopener noreferrer"`.

## 9. Upload/mutation/action safety

| Check | Kết quả |
|---|---|
| Có upload không? | Có: `campaignsApi.upload(file)` |
| Có mutation không? | Có: create/update/delete campaign |
| Có migrate/import/action khác không? | Không |
| Có chạy upload/mutation trong smoke không? | Không |
| Trạng thái | **LOCKED_NOT_EXECUTED** |

Runtime smoke chỉ GET route; không click `Upload file`, không submit form, không edit/delete/create.

## 10. Validation sau patch

| Lệnh | Kết quả |
|---|---|
| `cd dashboard && npx --no-install tsc --noEmit` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |

Prisma CLI tự báo load `.env`; Codex không đọc/in nội dung env thật.

## 11. Clean `.next` + runtime smoke

- Port 3019: FREE.
- Port 3002: BUSY bởi process khác; không đụng tới.
- Đã xác thực `dashboard/.next` nằm trong workspace rồi xóa bằng `Remove-Item -LiteralPath ... -Recurse -Force`.
- Start dev server tạm `npx --no-install next dev -p 3019 -H 127.0.0.1`.
- Dừng process tạm sau smoke; xác nhận port 3019 stopped.

| Route | Kết quả |
|---|---|
| `/login` | 200 PASS |
| `/dashboard` | 200 PASS |
| `/dashboard/campaigns` | 200 PASS |
| `/dashboard/quick-replies` | 200 PASS |
| `/dashboard/content-packages` | 200 PASS |
| `/dashboard/prompts` | 200 PASS |
| `/dashboard/analytics` | 200 PASS |
| `/dashboard/settings` | 200 PASS |
| `/dashboard/__fake_21c_3__` | 404 PASS_EXPECTED_NOT_FOUND |

Dev log scan:

- Không có `Cannot find module`.
- Không có `Cannot read properties of undefined`.
- Không có `webpack.cache`.
- Không có `ENOENT`.
- Không có `static/chunks`.
- Có 404 trong context route giả, hợp lệ.

## 12. Safety scans

| Scan | Kết quả |
|---|---|
| `fetch(` trong campaigns/page/lib API | Không match |
| `process.env/NEXT_PUBLIC/SECRET/TOKEN/PASSWORD` trong campaigns feature/page | Không match |
| `upload/migrate/migration/import/external/facebook/webhook/provider` | Match import và upload handler/UI hợp lệ; không migrate/import/external/webhook mới |
| `npm install/yarn add/pnpm add` | Chỉ match docs/script/report lịch sử cũ; không thêm dependency |
| `prisma db push/accept-data-loss/migrate reset` | Chỉ match docs/report/script cảnh báo lịch sử cũ; không thêm destructive command |
| Chunk bug signature scan | Chỉ match docs/report lịch sử cũ; dev log mới sạch |

## 13. Forbidden scope guard

Không sửa:

- `backend/**`
- Prisma schema/migration
- package/lock files
- Docker/start scripts
- dashboard API client/auth/config
- webhook/RAG/handoff/tenants/notifications
- env thật, `.next`, logs, temp, backup

`Bug_21C_SAFE.md` vẫn là untracked context file cũ và không được stage.

## 14. Gợi ý tiếp theo

1. Chỉ tiếp tục dashboard split nếu candidate nhỏ hơn và có audit risk rõ; các page `knowledge`, `handoff`, `settings`, `tenants` cần prompt riêng vì rủi ro cao.
2. Có thể tiếp tục backend route consolidation nếu tìm được route GET-only, read-only, không external/mutation/raw SQL/secret.
3. Nếu gặp lại chunk/runtime error, dừng feature work, clean `.next`, rebuild và smoke fresh server trước khi sửa source.

## 15. Điểm cần tu sửa

- Phase 19 vẫn **Started**, chưa Done; còn page dashboard nặng/rủi ro cao chưa split.
- Phase 21 vẫn **Started**, chưa Done; backend route debt còn lại cần audit từng route.
- Meta verify challenge, Meta POST event thật và production rollout vẫn pending; không claim production ready.
- `start-all.bat`/script legacy và docs lịch sử vẫn có warning cũ; không dùng làm source of truth hiện tại.
