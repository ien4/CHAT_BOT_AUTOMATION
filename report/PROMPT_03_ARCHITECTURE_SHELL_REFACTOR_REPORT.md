# PROMPT 03 - ARCHITECTURE SHELL REFACTOR REPORT

Ngày thực hiện: 2026-07-08  
Phạm vi: tạo architecture shell và wrapper an toàn, không rewrite hệ thống, không đổi behavior có chủ đích.

## 1. Mục tiêu

Prompt 03 bắt đầu tổ chức lại dự án theo hướng Clean Architecture nhưng chỉ ở mức shell:

- Tạo layer backend `domain`, `application`, `infrastructure`, `presentation`.
- Tạo wrapper Prisma và helper config an toàn.
- Tạo shell dashboard `features`, `components`, `lib/config`, `lib/api`, `styles`.
- Chuẩn hóa điểm đọc API base URL ở dashboard nhưng giữ fallback local hiện tại.
- Tạo docs kiến trúc và kế hoạch refactor tiếp theo.
- Chạy validation trước/sau thay đổi.
- Không đổi schema, migration, public route, webhook URL, tenant handoff, RAG hoặc bot engine.

## 2. File/report đã đọc

| File | Mục đích |
|---|---|
| `docs/PROJECT_PROGRESS.md` | Trạng thái dự án và kết quả Prompt 02B. |
| `docs/FEATURE_AUDIT_CHECKLIST.md` | Checklist tính năng/rủi ro hiện tại. |
| `report/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md` | Bản đồ kiến trúc và rủi ro ban đầu. |
| `report/PROMPT_02B_SAFETY_FOUNDATION_BASELINE_VALIDATION_REPORT.md` | Checkpoint, dependency, validation baseline. |
| `backend/src/db.js` | Xác nhận Prisma singleton để tạo wrapper không tạo client thứ hai. |
| `dashboard/src/lib/api.ts` | Xác nhận axios client/interceptor hiện tại. |
| Dashboard pages settings/campaigns/tenants | Xác định hard-code localhost có thể gom về helper mà không đổi route/UI. |

Không đọc `.env` thật.

## 3. Preflight result

| Hạng mục | Kết quả |
|---|---|
| `git status --short --branch` | Có thay đổi docs/report từ Prompt 02B, không có source runtime thay đổi trước Prompt 03. |
| `git log --oneline -5` | Có baseline commit `57a6fe5 checkpoint before safety validation and clean architecture refactor`. |
| Baseline commit full hash | `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` tồn tại. |
| Working tree trước refactor | Chỉ có `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`, report Prompt 02B chưa commit. |
| Kết luận preflight | PASS - tiếp tục được vì không có source runtime change không rõ nguồn. |

## 4. Baseline validation trước thay đổi

| Nhóm | Command | Result | Notes |
|---|---|---|---|
| Backend syntax | `node --check` cho `src/index.js`, `src/db.js`, `src/api/dashboard.js`, webhook handlers, tenant webhook, bot agent/tools, RAG pipeline | PASS | Không có syntax error baseline. |
| Prisma | `DATABASE_URL` dummy + `npx prisma validate` | PASS | Không connect DB thật, không migrate, không db push. |
| Dashboard build | `npm run --if-present build` | PASS | Next build pass. |
| Dashboard typecheck | `npx --no-install tsc --noEmit` | PASS sau khi chạy tuần tự | Lần chạy song song với build bị nhiễu do `.next/types` đang tái tạo; chạy lại sau build thì pass. |

## 5. Files/folders created

Backend shell:

- `backend/src/domain/**`
- `backend/src/application/**`
- `backend/src/infrastructure/**`
- `backend/src/presentation/**`
- `backend/src/infrastructure/persistence/prisma/client.js`
- `backend/src/infrastructure/services/config.js`

Dashboard shell:

- `dashboard/src/components/ui/`
- `dashboard/src/components/layout/`
- `dashboard/src/components/feedback/`
- `dashboard/src/features/auth/`
- `dashboard/src/features/dashboard/`
- `dashboard/src/features/conversations/`
- `dashboard/src/features/knowledge/`
- `dashboard/src/features/prompts/`
- `dashboard/src/features/campaigns/`
- `dashboard/src/features/content-packages/`
- `dashboard/src/features/quick-replies/`
- `dashboard/src/features/channel-configs/`
- `dashboard/src/features/tenants/`
- `dashboard/src/features/analytics/`
- `dashboard/src/features/appointments/`
- `dashboard/src/features/staff/`
- `dashboard/src/features/handoff/`
- `dashboard/src/features/settings/`
- `dashboard/src/lib/config/env.ts`
- `dashboard/src/lib/api/client.ts`
- `dashboard/src/lib/auth/`
- `dashboard/src/lib/utils/`
- `dashboard/src/styles/`

Docs/report:

- `docs/ARCHITECTURE.md`
- `docs/REFACTOR_PLAN.md`
- `report/PROMPT_03_ARCHITECTURE_SHELL_REFACTOR_REPORT.md`

## 6. Files changed

| File | Loại thay đổi |
|---|---|
| `dashboard/src/lib/api.ts` | Dùng `createApiClient()` từ helper mới, giữ toàn bộ interceptor hiện tại. |
| `dashboard/src/app/dashboard/settings/page.tsx` | Thay hard-code API base URL bằng `API_BASE_URL`; fetch path giữ nguyên. |
| `dashboard/src/app/dashboard/campaigns/page.tsx` | Thay asset URL localhost bằng `API_BASE_URL`. |
| `dashboard/src/app/dashboard/tenants/page.tsx` | Thay fallback webhook base URL bằng `API_BASE_URL`. |
| `docs/PROJECT_PROGRESS.md` | Thêm Prompt 03 update. |
| `docs/FEATURE_AUDIT_CHECKLIST.md` | Thêm Prompt 03 static validation update. |

## 7. Backend changes

| Hạng mục | Kết quả |
|---|---|
| Folder Clean Architecture shell | Đã tạo `domain`, `application`, `infrastructure`, `presentation` và README giải thích vai trò/dependency rule. |
| Prisma wrapper | `backend/src/infrastructure/persistence/prisma/client.js` re-export `backend/src/db.js`; không tạo PrismaClient thứ hai. |
| Config helper | `backend/src/infrastructure/services/config.js` export `getEnv`, `getRequiredEnv`, `isProduction`; không log secret. |
| Phần cố tình không đụng | `index.js`, `api/dashboard.js`, webhook handlers, tenant handoff, Telegram handoff, RAG pipeline, Chatwoot crypto, Prisma schema/migrations. |
| Behavior có đổi không | Không có chủ đích đổi behavior. Backend runtime import cũ vẫn giữ nguyên. |

## 8. Dashboard changes

| Hạng mục | Kết quả |
|---|---|
| Folder shell | Đã tạo `components`, `features`, `lib/config`, `lib/api`, `lib/auth`, `lib/utils`, `styles`. |
| Config helper | `dashboard/src/lib/config/env.ts` gom `NEXT_PUBLIC_API_URL`, `API_BASE_URL`, `API_BASE_API_URL`, `CHATWOOT_BASE_URL`. |
| API client/helper | `dashboard/src/lib/api/client.ts` tạo axios instance; `dashboard/src/lib/api.ts` vẫn giữ API facade và interceptor cũ. |
| Hard-code localhost đã xử lý | `http://localhost:3001` trong dashboard source chỉ còn ở helper fallback `env.ts`. |
| Hard-code localhost chưa xử lý | Backend source logs/fallback, scripts, root docs/report/webhook URL file vẫn còn và dành cho Prompt 04. |
| Behavior có đổi không | Không đổi route, UI, auth header, tenantScope hoặc API response contract. |

## 9. Docs updated

| File | Kết quả |
|---|---|
| `docs/ARCHITECTURE.md` | Tạo mới, mô tả hiện trạng, mục tiêu, dependency rule, layer mapping, vùng không move và validation guardrails. |
| `docs/REFACTOR_PLAN.md` | Tạo mới, chia roadmap Prompt 04-10 với mục tiêu, file được phép/không được phép sửa, validation và rollback risk. |
| `docs/PROJECT_PROGRESS.md` | Cập nhật Prompt 03 status. |
| `docs/FEATURE_AUDIT_CHECKLIST.md` | Cập nhật static validation update cho Prompt 03. |

## 10. Validation after changes

| Command | Result | Notes | Action needed |
|---|---|---|---|
| `node --check src/index.js` | PASS | Backend entrypoint không đổi. | Chạy lại nếu Prompt sau chạm startup. |
| `node --check src/db.js` | PASS | Prisma singleton cũ không đổi. | Giữ singleton. |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Wrapper mới hợp lệ. | Dùng cho repository layer sau. |
| `node --check src/infrastructure/services/config.js` | PASS | Helper config hợp lệ. | Mở rộng ở Prompt 04. |
| `node --check` các backend file trọng yếu khác | PASS | Dashboard API, webhook handlers, tenant webhook, bot agent/tools, RAG pipeline. | Chưa runtime verified. |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Schema hợp lệ; không connect DB thật. | Không chạy migrate/db push. |
| `npx --no-install tsc --noEmit` | PASS | Dashboard typecheck pass. | Chạy lại sau mọi thay đổi TS/TSX. |
| `npm run --if-present build` | PASS | Next build pass. | Build là guardrail chính hiện tại. |
| `rg "http://localhost:3001" src` trong dashboard | PASS WITH NOTE | Chỉ còn trong `dashboard/src/lib/config/env.ts` làm fallback local. | Prompt 04 xử lý phần ngoài dashboard source. |
| `rg "NEXT_PUBLIC_API_URL|API_BASE_URL" src` trong dashboard | PASS | Helper được dùng ở env, settings, campaigns, tenants. | Có thể tiếp tục cleanup ở Prompt 04. |

## 11. Source behavior safety

Đã tuân thủ:

- Không đổi Prisma schema.
- Không đổi migrations.
- Không đổi public API route.
- Không đổi webhook URL.
- Không đổi tenant handoff behavior.
- Không đổi RAG behavior.
- Không đổi bot engine/tool behavior.
- Không chạy migration/db push.
- Không chạy `docker compose up`.
- Không chạy `start-all.bat`.
- Không thêm package mới.
- Không tự tạo dữ liệu ảo.
- Không đọc/in `.env` thật.
- Không push remote.

## 12. Known risks remaining

| Rủi ro | Trạng thái |
|---|---|
| `$queryRawUnsafe` | Vẫn còn, chưa xử lý trong Prompt 03. |
| Hard-code localhost | Dashboard source đã gom về helper; backend/scripts/root vẫn còn. |
| Default credential/fallback | Vẫn còn, chưa xử lý. |
| Dashboard lint | Vẫn chưa cấu hình không tương tác. |
| Backend lint/typecheck | Vẫn chưa có script thật. |
| Tenant scope | Cần runtime regression test. |
| Handoff/RAG behavior | Chưa runtime verified. |
| `start-all.bat` có accept-data-loss | Vẫn còn, không chạy. |
| npm audit vulnerabilities | Vẫn còn từ Prompt 02B, không tự fix package. |

## 13. Final verdict

**PASS WITH WARNINGS - shell created but listed warnings remain**

Lý do PASS WITH WARNINGS:

- Architecture shell và wrapper đã tạo.
- Static validation pass.
- Không đổi schema/route/webhook/tenant/RAG behavior.
- Nhưng các rủi ro baseline vẫn còn và chưa runtime verified.

## 14. Next Step & Goal

Prompt 04 nên là:

`PROMPT 04 - CONFIG HARDENING + LOCALHOST CLEANUP + ENV POLICY`

Mục tiêu Prompt 04:

1. Chuẩn hóa config backend/dashboard.
2. Cleanup hard-code localhost còn lại trong source runtime nếu không đổi behavior.
3. Xác định env policy: required, optional, local-only fallback, production constraints.
4. Không đổi Prisma schema/migrations.
5. Không chạm tenant handoff/RAG/webhook behavior nếu chưa có regression checklist.
6. Chạy validation sau từng nhóm: backend syntax, Prisma validate dummy, dashboard typecheck/build, `rg localhost`.
