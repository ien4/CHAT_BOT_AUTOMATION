# CURRENT STATUS INDEX

Ngày cập nhật: 2026-07-12

Tài liệu này là điểm vào hiện tại trước khi đọc các docs hoặc report cũ. Nếu một tài liệu khác mâu thuẫn với file này, ưu tiên file này và các tài liệu trong bảng "Nguồn sự thật hiện tại".

## 1. Nguồn sự thật hiện tại

| Chủ đề | File nên đọc | Vai trò |
|---|---|---|
| Tổng tiến độ dự án | `docs/PROJECT_PROGRESS.md` | Trạng thái mới nhất theo prompt, phase đang Started/Done, validation gần nhất. |
| Checklist audit/quality | `docs/FEATURE_AUDIT_CHECKLIST.md` | Bảng kiểm tính năng, rủi ro, smoke và kết quả audit theo phase. |
| Refactor roadmap | `docs/REFACTOR_PLAN.md` | Kế hoạch refactor tiếp theo và giới hạn an toàn theo phase. |
| Project structure consolidation | `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` | Bản đồ cấu trúc backend/dashboard/docs và nợ còn lại của Phase 21. |
| Facebook webhook readiness | `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md` | Trạng thái source/local/staging/Meta/production của direct Facebook webhook. |
| Meta webhook staging readiness | `docs/META_WEBHOOK_STAGING_READINESS.md` | Checklist public HTTPS staging, prerequisite, smoke plan và bước verify Meta thủ công. |
| Meta webhook staging runbook | `docs/META_WEBHOOK_STAGING_RUNBOOK.md` | Các bước public smoke, verify Meta thủ công, test POST event thật và rollback staging. |
| Deployment policy | `docs/DEPLOYMENT_POLICY.md` | Chính sách deploy, migration release step và No-Chatwoot webhook target. |
| Production rollout checklist | `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` | Checklist backup, migrate deploy, smoke production và rollback. |
| Env policy | `docs/ENV_POLICY.md` | Quy tắc env/secret, biến production/local và biến legacy không dùng lại. |
| Architecture overview | `docs/ARCHITECTURE.md` | Tổng quan shell/layer lịch sử; đọc kèm file này vì một số đoạn cũ còn nhắc Chatwoot như bối cảnh quá khứ. |
| Quality gate | `docs/QUALITY_GATE.md` | Lệnh validation hiện tại cho backend/dashboard. |
| Local run guide | `docs/LOCAL_RUN_GUIDE.md` | Cách chạy local an toàn; không dùng `start-all.bat` cho production. |
| Historical reports | `report/PROMPT_*.md`, `docs/HISTORICAL_DOCS_INDEX.md` | Audit trail theo prompt, không phải source of truth hiện tại nếu có mâu thuẫn. |

## 2. Trạng thái kiến trúc hiện tại

- Target hiện tại là **No-Chatwoot**.
- Meta/Facebook callback thật là `GET /webhook` để verify và `POST /webhook` để nhận event.
- `/api/settings/webhook` chỉ là dashboard config/read endpoint có auth, không phải Meta callback URL.
- Public HTTPS staging hiện là **STAGING_URL_MISSING** sau Prompt 22A: chưa có `STAGING_BASE_URL` hoặc public URL thật, nên chưa claim staging ready.
- Webhook log redaction hiện là **SOURCE_HARDENED_PENDING_REAL_EVENT** sau Prompt 22A-1: source không log message text/full sender id/full recipient id/raw body trong `handler.js`, nhưng chưa có POST event thật để quan sát staging log.
- Backend route consolidation Phase 21 đang **Started**, chưa Done. Đã tách thêm prompts/settings/quick-reply-menus/channel-configs/campaigns read routes theo từng bước nhỏ.
- Dashboard feature split Phase 19 đang **Started**, chưa Done. Analytics/prompts/staff/appointments đã split; các page nặng còn lại cần prompt riêng.
- Production rollout thật **chưa chạy**. Cần backup DB, `prisma migrate deploy` release step và smoke production thật trước khi claim production ready.

## 3. Không được hiểu nhầm

- Không dùng Chatwoot làm target mới.
- Không khôi phục `/chatwoot-webhook*` làm route runtime.
- Không dùng `/api/settings/webhook` làm callback URL trong Meta Developer.
- Không ghi production ready khi chưa có rollout production thật.
- Không ghi Meta connected/verified nếu chưa có verify challenge hoặc event thật từ Meta.
- Historical reports và root docs cũ giữ bằng chứng quá khứ, không phải source of truth hiện tại.
- `webhook-urls-current.txt` là log local/stale, không dùng làm nguồn production truth.
- `start-all.bat`, `start_all.bat`, `stop-all.bat` còn nội dung Chatwoot legacy; không dùng các script này cho production.

## 4. Prompt tiếp theo

| Prompt | Mục tiêu |
|---|---|
| 21B-4 | Tiếp tục backend read-only route consolidation nếu audit tìm được candidate nhỏ, không external/mutation/raw SQL/secret. |
| 21C | Dashboard `content-packages` split nếu action migrate/external bị khóa rõ. |
| Meta public smoke prompt | Chạy khi có `STAGING_BASE_URL`; chỉ smoke `/health`, `/webhook` thiếu params 403, `/chatwoot-webhook` 404. |
| Production rollout prompt | Chỉ chạy sau staging/Meta verification; mục tiêu là backup, migrate deploy, deploy và smoke production thật. |
