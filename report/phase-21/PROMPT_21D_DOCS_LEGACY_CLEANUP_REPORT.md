# PROMPT 21D — DOCS / LEGACY CLEANUP REPORT

Ngày thực hiện: 2026-07-12
Trạng thái: **PASS**

## 1. Mục tiêu

Làm rõ source of truth hiện tại cho dự án, gắn nhãn tài liệu stale có thể gây nhầm, audit legacy Chatwoot/docs/scripts, cleanup thư mục legacy rỗng được phép, và giữ nguyên runtime behavior.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không phải main/master |
| HEAD trước prompt | `f14259c Consolidate campaigns or stats dashboard route` |
| Remote | Không có remote configured |
| Working tree trước patch | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked env scan | Chỉ `backend/.env.example`; env thật không tracked/staged |

Không mở/in env thật, token hoặc secret.

## 3. Context files read

Đã đọc/đối chiếu:

- `report/phase-21/PROMPT_21B_3_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`
- `report/phase-21/PROMPT_21R_LOCAL_RUNTIME_WEBHOOK_SMOKE_REPORT.md`
- `report/phase-21/PROMPT_21S_PROJECT_GOALS_FACEBOOK_WEBHOOK_STATUS_REPORT.md`
- `report/phase-21/PROMPT_21A_PROJECT_STRUCTURE_CONSOLIDATION_AUDIT_REPORT.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/policies/DEPLOYMENT_POLICY.md`
- `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`
- `docs/policies/ENV_POLICY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/policies/QUALITY_GATE.md`
- `MULTITENANT_PROGRESS.md`
- `ROADMAP.md`
- `start-all.bat`
- `webhook-urls-current.txt`

`README.md` root không tồn tại.

## 4. Docs inventory map

| File | Loại | Current/Historical/Stale/Generated/Checklist | Có nhắc Chatwoot? | Có nhắc production ready? | Có nhắc Meta connected? | Hành động |
|---|---|---|---|---|---|---|
| `docs/status/PROJECT_PROGRESS.md` | Current doc | CURRENT_SOURCE_OF_TRUTH | Có, theo No-Chatwoot/status | Chỉ ghi không claim | Chỉ ghi không claim | Cập nhật 21D |
| `docs/status/FEATURE_AUDIT_CHECKLIST.md` | Current checklist | CURRENT_SOURCE_OF_TRUTH | Có, status/audit | Không claim sai | Không claim sai | Cập nhật 21D |
| `docs/roadmap/REFACTOR_PLAN.md` | Current roadmap | CURRENT_SOURCE_OF_TRUTH | Có, historical/context | Không claim sai | Không claim sai | Cập nhật 21D |
| `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` | Current structure plan | CURRENT_SOURCE_OF_TRUTH | Có, stale/backlog | Không claim sai | Không claim sai | Cập nhật 21D |
| `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md` | Current status | CURRENT_SOURCE_OF_TRUTH | Có, No-Chatwoot truth | Không claim sai | Không claim sai | Cập nhật link index |
| `docs/policies/DEPLOYMENT_POLICY.md` | Policy | CURRENT_SOURCE_OF_TRUTH | Có, No-Chatwoot policy | Không claim sai | Không claim sai | Không patch |
| `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md` | Checklist | CURRENT_SOURCE_OF_TRUTH | Có, 404 guard | Không claim sai | Không claim sai | Không patch |
| `docs/policies/ENV_POLICY.md` | Policy | CURRENT_SOURCE_OF_TRUTH | Có, legacy env deprecated | Không claim sai | Không claim sai | Không patch |
| `docs/architecture/ARCHITECTURE.md` | Architecture overview | CURRENT_WITH_HISTORICAL_SECTIONS | Có đoạn shell cũ | Không claim sai | Không claim sai | Ghi caveat trong index |
| `docs/policies/QUALITY_GATE.md` | Quality | CURRENT_SOURCE_OF_TRUTH | Có 404 smoke | Không claim sai | Không claim sai | Không patch |
| `docs/runbooks/LOCAL_RUN_GUIDE.md` | Local guide | CURRENT_SOURCE_OF_TRUTH | Có warning start-all | Không claim sai | Không claim sai | Không patch |
| `docs/architecture/FEATURE_INVENTORY.md` | Inventory cũ | HISTORICAL_OR_STALE_DOC | Có flow Chatwoot cũ | Không dùng làm current | Không dùng làm current | Ghi caveat trong historical index |
| `MULTITENANT_PROGRESS.md` | Root doc | HISTORICAL_OR_STALE_ROOT_DOC | Có flow Chatwoot cũ | Không current | Không current | Đã thêm stale header |
| `ROADMAP.md` | Root doc | HISTORICAL_OR_STALE_ROOT_DOC | Có roadmap cũ | Không current | Không current | Đã thêm stale header |
| `webhook-urls-current.txt` | Local log | GENERATED_OR_STALE | Có, nhưng có warning No-Chatwoot | Không current | Không current | Giữ nguyên |
| `report/PROMPT_*.md` | Report | HISTORICAL_REPORT | Có nhiều historical | Theo thời điểm | Theo thời điểm | Không rewrite/xóa |
| `start-all.bat` | Script text | STALE_EXECUTABLE_BACKLOG | Có Chatwoot flow executable | Không claim | Không claim | Không sửa trong 21D |
| `start_all.bat`, `stop-all.bat` | Script text | STALE_EXECUTABLE_BACKLOG | Có Chatwoot legacy | Không claim | Không claim | Không sửa trong 21D |

## 5. Stale docs findings

- `MULTITENANT_PROGRESS.md` mô tả Chatwoot inbox, `POST /chatwoot-webhook/:slug`, `tenants/webhookHandler.js`, `backend/src/chatwoot/api.js` như flow hiện tại. Đây là stale so với No-Chatwoot target.
- `ROADMAP.md` là roadmap tháng 6, còn nhắc `prisma db push` và trạng thái cũ. Đây là historical/stale root doc.
- `docs/architecture/ARCHITECTURE.md` và `docs/architecture/FEATURE_INVENTORY.md` còn đoạn lịch sử Chatwoot. Không patch vì ngoài scope update hiện tại; đã ghi caveat trong index.
- Không phát hiện current docs claim sai rằng Meta đã connected/verified hoặc production ready. Các match hiện tại đều là cảnh báo "không claim" hoặc status pending.

## 6. Chatwoot / legacy findings

Phân loại scan:

| Finding | Phân loại | Ghi chú |
|---|---|---|
| Historical reports nhắc Chatwoot | HISTORICAL_OK | Giữ audit trail, không rewrite. |
| `MULTITENANT_PROGRESS.md`, `ROADMAP.md` | STALE_DOC_HEADER_ADDED | Đã thêm stale header. |
| `webhook-urls-current.txt` | STALE_LOCAL_LOG_WITH_WARNING | Đã có warning No-Chatwoot sẵn; giữ nguyên. |
| `start-all.bat`, `start_all.bat`, `stop-all.bat` | ACTIVE_SCRIPT_BACKLOG | Còn flow Chatwoot local/executable; không sửa trong 21D vì prompt cấm sửa script. |
| `backend/scripts/update-chatwoot-agentbot-url.js`, `fix_tenant_token.js`, `test_decrypt.js` | LEGACY_SCRIPT_BACKLOG | Không phải runtime app path, nhưng còn reference Chatwoot/deleted crypto; cần prompt script cleanup riêng nếu muốn. |
| `backend/src` runtime JS | OK | Không còn active Chatwoot route/client runtime; chỉ README lịch sử còn từ khóa. |

## 7. Docs index created

Đã tạo:

- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/index/HISTORICAL_DOCS_INDEX.md`

Source of truth hiện tại được index hóa:

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/policies/DEPLOYMENT_POLICY.md`
- `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`
- `docs/policies/ENV_POLICY.md`
- `docs/architecture/ARCHITECTURE.md` với caveat historical sections
- `docs/policies/QUALITY_GATE.md`
- `docs/runbooks/LOCAL_RUN_GUIDE.md`

## 8. Stale header patches

Đã thêm stale notice ở đầu:

- `MULTITENANT_PROGRESS.md`
- `ROADMAP.md`

Không rewrite toàn file, không xóa nội dung lịch sử.

## 9. Legacy empty dir cleanup

| Dir | Trạng thái trước | Hành động | Ghi chú |
|---|---|---|---|
| `backend/src/chatwoot` | Tồn tại, rỗng | Đã xóa | Không có file; Git không track dir rỗng nên không có diff deletion. |
| `backend/src/adapters` | Tồn tại, rỗng | Đã xóa | Không có file; Git không track dir rỗng. |
| `backend/src/infrastructure/integrations/chatwoot` | Tồn tại, rỗng | Đã xóa | Không xóa parent integrations. |

Không xóa thư mục có file, không xóa historical report/docs.

## 10. Safety scans

| Scan | Kết quả |
|---|---|
| False production/Meta claims | Không có claim sai trong current docs; các match là "không claim" hoặc pending. |
| Chatwoot references | Historical/report/docs/script backlog còn nhiều; current No-Chatwoot policy rõ trong current docs. |
| Destructive commands | `start-all.bat` chỉ còn warning/comment + `migrate deploy`; `ROADMAP.md` và docs cũ có historical `db push`; không tạo executable destructive mới. |
| Env/secret tracking | Env thật ignored, không tracked/staged. |

## 11. Validation

Baseline trước patch:

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check/stat/name-status` | Sạch |

Final validation sau patch:

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check` | PASS |
| Forbidden source/package diff guard | PASS: `DOCS_OR_ALLOWED_EMPTY_DIR_ONLY_OK` |

## 12. Files changed

- `docs/index/CURRENT_STATUS_INDEX.md` (mới)
- `docs/index/HISTORICAL_DOCS_INDEX.md` (mới)
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `MULTITENANT_PROGRESS.md`
- `ROADMAP.md`
- `report/phase-21/PROMPT_21D_DOCS_LEGACY_CLEANUP_REPORT.md` (mới)

Thư mục rỗng đã xóa nhưng không có Git diff:

- `backend/src/chatwoot`
- `backend/src/adapters`
- `backend/src/infrastructure/integrations/chatwoot`

## 13. Không thay đổi

- Không sửa runtime JS source.
- Không sửa `dashboard/src/**`.
- Không sửa Prisma schema/migrations.
- Không sửa package/package-lock.
- Không sửa Dockerfile, `start-all.bat`, `docker-compose.yml`.
- Không mở/in env thật hoặc token/secret.
- Không gọi external service thật.
- Không move/archive historical reports.

## 14. Remaining risks

- `start-all.bat`, `start_all.bat`, `stop-all.bat` còn Chatwoot legacy executable text; cần prompt DevOps/script cleanup riêng.
- `backend/scripts/update-chatwoot-agentbot-url.js`, `fix_tenant_token.js`, `test_decrypt.js` còn Chatwoot/deleted crypto references; cần prompt script cleanup riêng nếu các script này còn cần dùng.
- `docs/architecture/ARCHITECTURE.md` và `docs/architecture/FEATURE_INVENTORY.md` còn đoạn lịch sử Chatwoot; hiện được caveat qua index, chưa rewrite.
- `backend/src/api/dashboard.js` còn route debt.
- Public HTTPS/Meta verification/production rollout vẫn pending.

## 15. Final verdict

**PASS**

Docs index đã tạo, root stale docs đã gắn header, 3 thư mục legacy rỗng đã cleanup, validation PASS, không sửa runtime source/schema/package và không claim sai Meta/production status.

## 16. Next step

Đề xuất:

1. **Prompt 21B-4** nếu muốn tiếp tục backend read-only route consolidation.
2. **Prompt 21C** nếu muốn tách dashboard `content-packages` với action migrate/external bị khóa.
3. **Prompt 22A / Meta staging readiness** nếu muốn chuẩn bị public HTTPS webhook và verify Meta Developer.
4. Prompt DevOps/script cleanup riêng nếu muốn xử lý `start-all.bat`, `start_all.bat`, `stop-all.bat` và legacy scripts Chatwoot.
