# PROJECT PHASE BOARD

Ngày cập nhật: 2026-07-14

| Phase | Tên | Trạng thái | Bằng chứng chính | Việc còn lại |
|---|---|---|---|---|
| 17 | No-Chatwoot architecture/runtime | DONE | `report/phase-17/` | Không khôi phục Chatwoot runtime. |
| 18 | RAG/raw SQL hardening | DONE | `report/phase-18/` | Giữ regression scan `$queryRawUnsafe`. |
| 19 | Dashboard feature split | STARTED | `report/phase-19/`, `report/bugs/` | Split page còn lại theo prompt riêng, bắt buộc full dashboard gate. |
| 20 | DevOps/deploy hardening | DONE WITH PENDING ROLLOUT | `report/phase-20/` | Production rollout thật chưa chạy. |
| 21 | Project/backend/docs structure | STARTED | `report/phase-21/` | Backend route consolidation còn nợ; docs/report physical move đã DONE trong 21Y. |
| 22 | Public HTTPS / Meta webhook readiness | BLOCKED | `report/phase-22/` | Chờ Meta UI verify confirmation và POST event thật. |

## Quy tắc đọc

- Phase board này là bảng định hướng nhanh; chi tiết nằm trong `docs/status/PROJECT_STATUS_MASTER.md`.
- Nếu cần lịch sử prompt cụ thể, đọc report trong thư mục phase tương ứng.
- Nếu có mâu thuẫn, ưu tiên `docs/status/PROJECT_PROGRESS_MASTER.md` và `docs/index/CURRENT_STATUS_INDEX.md`.
