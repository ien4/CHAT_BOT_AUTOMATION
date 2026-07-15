# PROJECT PHASE BOARD

Ngày cập nhật: 2026-07-14

| Phase | Tên | Trạng thái | Bằng chứng chính | Việc còn lại |
|---|---|---|---|---|
| 17 | No-Chatwoot architecture/runtime | DONE | `report/phase-17/` | Không khôi phục Chatwoot runtime. |
| 18 | RAG/raw SQL hardening | DONE | `report/phase-18/` | Giữ regression scan `$queryRawUnsafe`. |
| 19 | Dashboard feature split | STARTED | `report/phase-19/`, `report/bugs/` | Split page còn lại theo prompt riêng, bắt buộc full dashboard gate. |
| 20 | DevOps/deploy hardening | DONE WITH PENDING ROLLOUT | `report/phase-20/` | Production rollout thật chưa chạy. |
| 21 | Project/backend/docs structure | STARTED | `report/phase-21/` | `GET /api/admin-users` đã tách trong 21B-5; backend route consolidation còn nợ; docs/report physical move đã DONE trong 21Y. |
| 22 | Public HTTPS / Meta webhook readiness | BLOCKED | `report/phase-22/` | Chờ Meta UI verify confirmation và POST event thật. |
| 23 | Website Chatwoot Hybrid Channel | PLANNED / ADR_ACCEPTED | `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`, `report/phase-23/` | Còn schema/env plan, inbound skeleton, mock smoke, dashboard UI và staging real event; không dùng Chatwoot cho Facebook. |

## Quy tắc đọc

- Phase board này là bảng định hướng nhanh; chi tiết nằm trong `docs/status/PROJECT_STATUS_MASTER.md`.
- Nếu cần lịch sử prompt cụ thể, đọc report trong thư mục phase tương ứng.
- Nếu có mâu thuẫn, ưu tiên `docs/status/PROJECT_PROGRESS_MASTER.md` và `docs/index/CURRENT_STATUS_INDEX.md`.
## Cap nhat 23B

Ngay cap nhat: 2026-07-15

Phase 23 van **PLANNED / CONTRACT_ACCEPTED**: 23B da chot schema/env/API contract docs-only, khuyen nghi generic `TenantIntegration`, endpoint `POST /integrations/website-chat/events`, feature flag `WEBSITE_CHAT_ENABLED=false`. Runtime Website Chatwoot van NOT_STARTED; 23C chi inbound skeleton disabled/mocked neu duoc mo.
## Cap nhat 21B-6-FINAL

Ngay cap nhat: 2026-07-15

Phase 21 backend read-route consolidation thong thuong da tam dung voi verdict **NO_SAFE_CANDIDATE**. Phase 21 hien la **STARTED / HIGH_RISK_ONLY_REMAINING**: cac route GET con lai trong `backend/src/api/dashboard.js` deu thuoc auth core, conversations/PII, knowledge/RAG, providers/secret, content/action, appointments/staff/Telegram, handoff, Facebook/external, analytics raw SQL/query phuc tap, tenants core hoac webhook legacy info. Khong sua source; Facebook `/webhook` va Website Chatwoot status khong doi.
