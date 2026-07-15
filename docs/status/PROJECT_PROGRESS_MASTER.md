# PROJECT PROGRESS MASTER

## Cap nhat BE-01 - Backend clean-code audit + CI baseline + Facebook webhook App Review readiness

Ngay cap nhat: 2026-07-15
Trang thai: **PASS WITH WARNINGS**

- Da audit backend clean-code theo tung khu vuc va tao matrix moi: [BACKEND_CLEAN_CODE_AUDIT_MATRIX.md](BACKEND_CLEAN_CODE_AUDIT_MATRIX.md).
- Da them CI baseline toi thieu: `.github/workflows/ci.yml` chay backend `npm run quality`, `npx prisma validate`, dashboard `npm run typecheck`, `npm run build`.
- Da xac nhan Facebook direct callback van la `GET/POST /webhook`; `/api/settings/webhook` chi la dashboard config/read endpoint co auth.
- Da tao checklist Meta App Review: [META_APP_REVIEW_SUBMISSION_CHECKLIST.md](../runbooks/META_APP_REVIEW_SUBMISSION_CHECKLIST.md).
- Backend safe smoke hien tai PASS: `/health` 200, `GET /webhook` thieu params 403, `POST /chatwoot-webhook` 404, invalid login 401, cac read route da tach yeu cau auth 401.
- Khong doc/in secret/env that; khong goi Meta/Facebook/Telegram/LLM; khong POST fake page object vao `/webhook`.
- Khong sua backend runtime source vi cac log/clean-code gap nam trong bot/RAG/handoff/provider high-risk.
- Prompt tiep theo de xuat: **BE-02 Backend log redaction/safety hardening** truoc khi App Review operator checkpoint.
- Report moi: `report/phase-21/PROMPT_BE_01_BACKEND_CLEAN_CODE_CI_WEBHOOK_AUDIT_REPORT.md`.

## Cap nhat 19E - Settings API client normalization

Ngay cap nhat: 2026-07-15
Trang thai: **PASS WITH NOTES**

- Da normalize `dashboard/src/app/dashboard/settings/page.tsx` tu 6 direct `fetch()` ve 0 direct `fetch()` bang API facade.
- Da them `settingsApi.getWebhookConfig`, `facebookMenuApi.get`, `facebookMenuApi.setup` trong `dashboard/src/lib/api.ts`; tai su dung `facebookPagesApi.list/create`.
- Khong split settings page trong prompt nay; UI/text/layout/route `/dashboard/settings` giu nguyen.
- Dashboard gate PASS: `npm run typecheck`, `npm run build`, `npm run quality`, clean `.next`, fresh dev server `127.0.0.1:3019`, route/static/dev-log smoke PASS.
- `npm run lint` rieng bi chan vi `next lint` yeu cau tao ESLint config tuong tac; khong tao config vi ngoai scope.
- Backend baseline PASS: `npm run quality`, `npx prisma validate`; khong sua backend/schema/env/package/webhook.
- Matrix uu tien moi: [PHASE_EXECUTION_PRIORITY_MATRIX.md](PHASE_EXECUTION_PRIORITY_MATRIX.md).
- Report moi: `report/phase-19/PROMPT_19E_SETTINGS_API_CLIENT_NORMALIZATION_REPORT.md`.
- Prompt tiep theo de xuat: **19F Settings feature split**.

## Cap nhat 23B - Website Chatwoot schema/env/API contract

Ngay cap nhat: 2026-07-15
Trang thai: **PASS / DOCS_ONLY**

- 23B da chot plan schema/env/API contract cho Website Chatwoot, chua code runtime.
- Recommended data model: generic `TenantIntegration` trong prompt migration/code sau; khong them lai `Tenant.chatwoot*`.
- Feature flag de xuat: `WEBSITE_CHAT_ENABLED=false` mac dinh.
- Endpoint contract giu theo ADR: `POST /integrations/website-chat/events`.
- Facebook `/webhook` khong doi; `/chatwoot-webhook*` khong khoi phuc.
- Website Chatwoot van **NOT_STARTED runtime**: chua route, schema, migration, env file, package, dashboard UI hoac smoke real.
- 23C chi duoc bat dau neu 23B PASS va scope chi inbound skeleton disabled/mocked, khong external.

Ngày cập nhật: 2026-07-14
Prompt gần nhất: **23A — Hybrid channel architecture decision**
Trạng thái gần nhất: **PASS**

## 1. Trạng thái cực ngắn

- Target Facebook hiện tại: **No-Chatwoot cho Facebook path**.
- Target Website Chatwoot mới: **optional/planned theo ADR 23A**, chưa có runtime, schema, env thật hoặc dashboard UI.
- Backend custom Express vẫn là runtime chính cho Facebook/Meta webhook.
- Prompt 23A đã tạo quyết định kiến trúc hybrid: Facebook Messenger đi direct qua Express `/webhook`; Website live-chat có thể dùng Chatwoot như kênh riêng nếu được duyệt.
- Không khôi phục legacy `/chatwoot-webhook*`; Website Chatwoot tương lai phải dùng endpoint mới, khuyến nghị `POST /integrations/website-chat/events`.
- Prompt 21B-5 đã tách `GET /api/admin-users` khỏi `backend/src/api/dashboard.js` theo repository/controller/routes.
- Dashboard Next.js hiện không có bug runtime mới sau gate 21Y.
- Docs/report đã được move vật lý vào cấu trúc `docs/{status,index,roadmap,runbooks,policies,architecture,archive}` và `report/{phase-17,phase-18,phase-19,phase-20,phase-21,phase-22,bugs,archive}`.
- Root `docs/` và root `report/` chỉ giữ `README.md`.
- Production rollout thật chưa chạy.
- Meta verify UI và POST event thật vẫn pending operator.

## 2. Đã xử lý

| Nhóm | Trạng thái | Bằng chứng |
|---|---|---|
| No-Chatwoot directive | DONE | Reports 08A-08H, docs architecture/status. |
| Hybrid channel ADR | DONE / PLANNED | `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`, `docs/roadmap/WEBSITE_CHATWOOT_INTEGRATION_PLAN.md`. |
| RAG/raw SQL hardening | DONE | Reports 09/09B/09C/10A. |
| DevOps/deploy policy | DONE WITH PENDING ROLLOUT | `docs/policies/DEPLOYMENT_POLICY.md`, `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`. |
| Dashboard feature split | STARTED | Analytics/prompts/staff/appointments/content-packages/quick-replies/campaigns đã split. |
| Backend route consolidation | STARTED | Prompts/settings/quick-reply-menus/channel-configs/campaigns/stats/admin-users read routes đã tách. |
| Dashboard runtime bug 21X | RESOLVED | `report/bugs/PROMPT_21X_GLOBAL_DASHBOARD_RUNTIME_AND_DOCS_REPORT.md`. |
| Docs/report physical reorganization | DONE | Prompt 21Y, `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md`. |

## 3. Đang xử lý

| Nhóm | Tình trạng |
|---|---|
| Backend route consolidation Phase 21 | Đã tách thêm `GET /api/admin-users`; còn nợ trong `backend/src/api/dashboard.js`; chỉ tiếp tục nếu có route GET/read-only nhỏ, không external/mutation/raw SQL/secret. |
| Dashboard feature split Phase 19 | Còn page nặng/rủi ro; mọi prompt mới phải clean `.next`, fresh server, full route smoke, static asset smoke, dev log scan. |
| Meta webhook staging Phase 22 | Public HTTPS smoke đã có, nhưng verify Meta UI và POST event thật còn pending. |
| Website Chatwoot Phase 23 | ADR accepted/planned, docs-only; runtime/schema/env/package/dashboard UI chưa bắt đầu. |

## 4. Đang lên kế hoạch

| Việc | Điều kiện bắt đầu |
|---|---|
| `23B` Website Chatwoot schema/env/API plan | Chỉ sau khi ADR 23A được chấp nhận; vẫn không đụng Facebook `/webhook`. |
| `21B-6-SAFE` hoặc `NO_SAFE_CANDIDATE` | Audit tìm được candidate backend read-only nhỏ thật sự an toàn. |
| Dashboard split kế tiếp | Đọc bug tracker, áp dụng gate 21X/21Y đầy đủ, không còn runtime bug. |
| Meta verify checkpoint | Người vận hành xác nhận Meta UI Verify and Save bằng token thật. |
| Production rollout | Chỉ sau staging/Meta event thật; cần backup DB, migrate deploy, smoke production thật. |

## 5. Chưa xử lý

- Chưa có xác nhận operator rằng Meta UI verify callback `/webhook` đã PASS.
- Chưa nhận POST event thật từ Meta.
- Chưa chạy production rollout thật.
- Chưa có automated browser CI cho toàn bộ dashboard route/static asset smoke.
- Chưa hoàn tất toàn bộ backend route consolidation và dashboard feature split.
- Chưa có code runtime Website Chatwoot mới.
- Chưa có schema/env/package/dashboard UI cho Website Chatwoot mới.

## 6. Blocker

| Blocker | Ảnh hưởng | Cách gỡ |
|---|---|---|
| Thiếu `META_VERIFY_OPERATOR_CONFIRMED=YES` | Không thể claim Meta verified hoặc chạy POST event smoke thật. | Operator verify trên Meta UI và báo kết quả. |
| Production chưa rollout thật | Không thể claim production ready. | Chạy prompt rollout riêng với backup/migrate/deploy/smoke. |
| Candidate backend có thể lẫn mutation/external | Không được refactor tùy tiện trong 21B tiếp theo. | Audit route trước; nếu không an toàn thì trả `NO_SAFE_CANDIDATE`. |
| Website Chatwoot mới chưa có plan chi tiết | Không được code route/env/schema tùy tiện. | Chạy 23B để chốt API contract, env policy và data model option. |

## 7. Bug hiện tại

| Bug | Trạng thái | Ghi chú |
|---|---|---|
| BUG-21C-SAFE stale chunk | RESOLVED | Do stale `.next`; không phải source bug. |
| BUG-21C-3 mixed server/cache | RESOLVED | Prompt 21X xử lý bằng dừng server cũ, clean `.next`, rebuild, full smoke. |
| Bug mới sau 21Y | NONE OBSERVED | Full route/static asset/dev log gate sau move docs/report không phát hiện bug mới. |
| Bug mới sau 21B-5 | NONE OBSERVED | Backend smoke và dashboard regression gate không phát hiện bug mới. |

## 8. Next action đề xuất

1. `23B` nếu muốn tiếp tục Website Chatwoot: schema/env/API contract plan, vẫn docs-only hoặc migration create-only nếu được duyệt riêng.
2. `21B-6-SAFE` nếu audit chứng minh có route backend GET/read-only nhỏ còn lại.
3. `NO_SAFE_CANDIDATE` nếu không có candidate an toàn.
4. Meta verify operator checkpoint nếu người vận hành đã verify trong Meta Developer.
5. Dashboard split mới chỉ khi prompt riêng có smoke gate đầy đủ.

## 9. Tiêu chí bắt buộc cho prompt sau

- Đọc file này trước khi đọc report lịch sử.
- Không sửa source nếu yêu cầu chỉ là docs/report trừ khi có bug runtime chứng minh.
- Không stage `.env`, `.next`, logs, temp, backup hoặc file untracked không liên quan như `Bug_21C-3.md`.
- Không dùng `git add .`.
- Với dashboard: clean `.next`, fresh server, full route smoke, static asset smoke, dev log scan.
## Cap nhat 21B-6-FINAL - Backend read-route consolidation final audit

Ngay cap nhat: 2026-07-15
Trang thai: **NO_SAFE_CANDIDATE**

- Da audit lai toan bo route con lai trong `backend/src/api/dashboard.js` sau 21B-5 va 23B.
- Khong con nhom route GET/read-only nho nao du an toan tuyet doi de tach trong vong 21B thong thuong.
- `GET /auth/me` bi loai vi la auth/session core; cac GET con lai bi loai do PII/content, tenant core, handoff, provider/secret adjacency, Facebook/external, analytics raw SQL/query phuc tap, hoac nam canh mutation/action cung domain.
- Khong sua backend source, dashboard source, Prisma schema/migration, env/env example, package/lock, webhook, RAG, bot, tenants, facebook, telegram hoac notifications.
- Phase 21 chuyen sang **STARTED / HIGH_RISK_ONLY_REMAINING**: khong tiep tuc 21B thuong neu khong co prompt rieng cho vung high-risk.
- Phase 23 van **PLANNED / NOT_STARTED runtime** sau 23B; khong code Website Chatwoot, khong tao `/integrations/website-chat/events`, khong khoi phuc `/chatwoot-webhook*`.
- Facebook `GET/POST /webhook`, Meta verification va production status khong doi.
- Validation/smoke/gate PASS: backend quality, Prisma validate, backend read smoke, dashboard typecheck/build, fresh dashboard route/static/dev-log gate, safety scans va broken-link check.
