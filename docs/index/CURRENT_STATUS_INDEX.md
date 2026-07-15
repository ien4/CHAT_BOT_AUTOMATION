# CURRENT STATUS INDEX

Ngày cập nhật: 2026-07-14

Tài liệu này là điểm vào hiện tại trước khi đọc docs hoặc report cũ. Nếu một tài liệu khác mâu thuẫn với file này, ưu tiên file này, `docs/status/PROJECT_PROGRESS_MASTER.md` và `docs/status/PROJECT_STATUS_MASTER.md`.

## 1. Nguồn sự thật hiện tại

| Chủ đề | File nên đọc | Vai trò |
|---|---|---|
| Tổng tiến độ master | `docs/status/PROJECT_PROGRESS_MASTER.md` | Bản tóm tắt mới nhất cho prompt sau: đã xử lý, đang xử lý, blocker, bug, next action. |
| Tổng tiến độ lịch sử | `docs/status/PROJECT_PROGRESS.md` | Audit trail tiến độ theo prompt, giữ lịch sử dài. |
| Status hub hiện tại | `docs/status/PROJECT_STATUS_MASTER.md` | Bảng trạng thái master theo nhóm, phase board, next prompts và các điều không được claim. |
| Phase board | `docs/status/PROJECT_PHASE_BOARD.md` | Bảng phase 17-22 ngắn gọn. |
| Bug tracker | `docs/status/BUG_TRACKER.md` | Tracker bug runtime hiện tại và quy tắc xử lý bug dashboard. |
| Dashboard route health | `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md` | Matrix smoke route/static assets/dev log mới nhất. |
| Docs/report organization | `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md` | Bản đồ tổ chức docs/report sau Prompt 21Y. |
| Checklist audit/quality | `docs/status/FEATURE_AUDIT_CHECKLIST.md` | Bảng kiểm tính năng, rủi ro, smoke và kết quả audit theo phase. |
| Refactor roadmap | `docs/roadmap/REFACTOR_PLAN.md` | Kế hoạch refactor tiếp theo và giới hạn an toàn theo phase. |
| Project structure consolidation | `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` | Bản đồ cấu trúc backend/dashboard/docs và nợ còn lại của Phase 21. |
| Facebook webhook readiness | `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md` | Trạng thái source/local/staging/Meta/production của direct Facebook webhook. |
| Meta webhook staging readiness | `docs/status/META_WEBHOOK_STAGING_READINESS.md` | Checklist public HTTPS staging, prerequisite, smoke plan và bước verify Meta thủ công. |
| Meta webhook staging runbook | `docs/runbooks/META_WEBHOOK_STAGING_RUNBOOK.md` | Các bước public smoke, verify Meta thủ công, test POST event thật và rollback staging. |
| Deployment policy | `docs/policies/DEPLOYMENT_POLICY.md` | Chính sách deploy, migration release step và No-Chatwoot webhook target. |
| Production rollout checklist | `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md` | Checklist backup, migrate deploy, smoke production và rollback. |
| Env policy | `docs/policies/ENV_POLICY.md` | Quy tắc env/secret, biến production/local và biến legacy không dùng lại. |
| Architecture overview | `docs/architecture/ARCHITECTURE.md` | Tổng quan shell/layer lịch sử; đọc kèm status vì một số đoạn cũ còn nhắc Chatwoot như bối cảnh quá khứ. |
| Hybrid channel ADR | `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md` | Quyết định mới: Facebook direct no-Chatwoot, Website Chatwoot optional/planned riêng. |
| Website Chatwoot roadmap | `docs/roadmap/WEBSITE_CHATWOOT_INTEGRATION_PLAN.md` | Kế hoạch 23B-23F cho website live-chat, chưa runtime. |
| Quality gate | `docs/policies/QUALITY_GATE.md` | Lệnh validation hiện tại cho backend/dashboard. |
| Local run guide | `docs/runbooks/LOCAL_RUN_GUIDE.md` | Cách chạy local an toàn; không dùng `start-all.bat` cho production. |
| Historical reports | `report/README.md`, `docs/index/HISTORICAL_DOCS_INDEX.md` | Audit trail theo prompt, không phải source of truth hiện tại nếu có mâu thuẫn. |

## 2. Trạng thái kiến trúc hiện tại

- Target Facebook hiện tại là **No-Chatwoot**: không đưa Facebook Messenger qua Chatwoot.
- Website Chatwoot là **optional/planned** theo ADR 23A, chưa có runtime/schema/env/dashboard UI.
- Meta/Facebook callback thật là `GET /webhook` để verify và `POST /webhook` để nhận event.
- `/api/settings/webhook` chỉ là dashboard config/read endpoint có auth, không phải Meta callback URL.
- Backend route consolidation Phase 21 đang **Started**, chưa Done. Đã tách thêm prompts/settings/quick-reply-menus/channel-configs/campaigns/stats/admin-users read routes theo từng bước nhỏ.
- Dashboard feature split Phase 19 đang **Started**, chưa Done. Analytics/prompts/staff/appointments/content-packages/quick-replies/campaigns đã split; các page nặng còn lại cần prompt riêng.
- Prompt 21X đã PASS: bug `Bug_21C-3.md` được phân loại **MIXED_DEV_SERVER_OR_PORT + STALE_NEXT_DEV_CACHE**, xử lý bằng dừng server cũ, clean `.next`, rebuild, full smoke.
- Prompt 21Y đã PASS: docs/report được move vật lý sang cấu trúc theo nhóm, root `docs/` và root `report/` chỉ giữ `README.md`, link current docs/report đã được cập nhật và dashboard regression gate không phát hiện bug mới.
- Prompt 21B-5 đã PASS: `GET /api/admin-users` được tách khỏi `dashboard.js` sang repository/controller/routes; no-token 401, tenant token 403, platform token 200, dashboard regression gate PASS.
- Prompt 23A đã PASS: tạo ADR hybrid channel và roadmap Website Chatwoot docs-only; không sửa runtime source, không đổi Facebook `/webhook`, không khôi phục `/chatwoot-webhook*`.
- Public HTTPS staging sau 22B-SAFE từng PASS không dùng secret, nhưng Meta verify operator confirmation vẫn pending.
- Prompt 22C-SAFE đã dừng với **BLOCKED_META_VERIFY_CONFIRMATION_MISSING** vì phiên chưa có `META_VERIFY_OPERATOR_CONFIRMED=YES`; chưa gửi/chờ POST event thật.
- Production rollout thật **chưa chạy**. Cần backup DB, `prisma migrate deploy` release step và smoke production thật trước khi claim production ready.

## 3. Không được hiểu nhầm

- Không dùng Chatwoot cho Facebook.
- Không khôi phục `/chatwoot-webhook*` làm route runtime.
- Website Chatwoot nếu triển khai phải theo ADR riêng và endpoint mới, khuyến nghị `POST /integrations/website-chat/events`.
- Không dùng `/api/settings/webhook` làm callback URL trong Meta Developer.
- Không ghi production ready khi chưa có rollout production thật.
- Không ghi Meta connected/verified nếu chưa có verify challenge hoặc event thật từ Meta.
- Historical reports là audit trail, không phải source of truth hiện tại nếu mâu thuẫn với status/index mới.
- `webhook-urls-current.txt` là log local/stale, không dùng làm nguồn production truth.
- `start-all.bat`, `start_all.bat`, `stop-all.bat` còn nội dung Chatwoot legacy; không dùng các script này cho production.
- Khi phát hiện bug runtime trong phase hiện tại, phải xử lý root cause và smoke sạch trước khi mở feature split/refactor mới.
- Sau mọi dashboard refactor: bắt buộc clean `.next`, fresh dev server, full route smoke, static asset smoke và dev log scan.

## 4. Prompt tiếp theo

| Prompt | Mục tiêu |
|---|---|
| 21B-6 hoặc NO_SAFE_CANDIDATE | Chỉ tiếp tục backend read-only route consolidation nếu audit tìm được candidate nhỏ, không external/mutation/raw SQL/secret; nếu không thì dừng rõ. |
| 23B Website Chatwoot plan | Chốt schema/env/API contract cho Website Chatwoot planned channel; không code runtime nếu chưa được duyệt. |
| Dashboard split kế tiếp | Chỉ sau khi đọc `docs/status/BUG_TRACKER.md` và áp dụng rule 21Y: full route smoke + static asset smoke + dev log scan. |
| Meta verify operator checkpoint | Người vận hành giữ Ngrok session, nhập callback `/webhook`, dùng `FB_VERIFY_TOKEN` thật trong Meta Developer và xác nhận kết quả. |
| Meta POST event smoke prompt | Chỉ chạy sau khi người vận hành xác nhận `META_VERIFY_OPERATOR_CONFIRMED=YES`; mục tiêu là gửi/nhận 1 event thật và quan sát log đã redact. |
| Production rollout prompt | Chỉ chạy sau staging/Meta verification và POST event thật; mục tiêu là backup, migrate deploy, deploy và smoke production thật. |
## Cap nhat 23B - Website Chatwoot contract

Ngay cap nhat: 2026-07-15
Trang thai: **PASS / DOCS_ONLY**

- Contract moi: `docs/roadmap/WEBSITE_CHATWOOT_SCHEMA_ENV_API_CONTRACT.md`.
- Recommended data model: generic `TenantIntegration`.
- Feature flag de xuat: `WEBSITE_CHAT_ENABLED=false` mac dinh.
- Endpoint tuong lai: `POST /integrations/website-chat/events`.
- 23B khong sua source/schema/env/package.
- Facebook `/webhook` khong doi; `/chatwoot-webhook*` khong khoi phuc.
- Website Chatwoot van **NOT_STARTED runtime**.
## Cap nhat 21B-6-FINAL - No safe backend read-route candidate

Ngay cap nhat: 2026-07-15
Trang thai: **NO_SAFE_CANDIDATE**

- Sau 21B-5 va 23B, audit cuoi `backend/src/api/dashboard.js` khong tim thay route GET/read-only nho nao du an toan de tach tiep.
- Phase 21 backend route consolidation thong thuong chuyen sang **STARTED / HIGH_RISK_ONLY_REMAINING**.
- Prompt sau khong nen tiep tuc 21B thuong; neu can giam no backend, phai mo prompt rieng cho tung vung high-risk voi smoke/rollback rieng.
- Khong doi Facebook `/webhook`, khong code Website Chatwoot, khong khoi phuc `/chatwoot-webhook*`.
- Report moi: `report/phase-21/PROMPT_21B_6_FINAL_BACKEND_ROUTE_AUDIT_REPORT.md`.
