# BBOTECH Bot Automation Docs

Ngày cập nhật: 2026-07-14

Đây là điểm vào chính sau Prompt 21Y. Root `docs/` chỉ giữ README; tài liệu thật được chia theo nhóm để prompt sau không phải dò từng file rời rạc.

## Đọc trước

| Nhu cầu | File |
|---|---|
| Trạng thái hiện tại ngắn gọn | `docs/index/CURRENT_STATUS_INDEX.md` |
| Master progress cho prompt sau | `docs/status/PROJECT_PROGRESS_MASTER.md` |
| Status hub chi tiết | `docs/status/PROJECT_STATUS_MASTER.md` |
| Phase board | `docs/status/PROJECT_PHASE_BOARD.md` |
| Bug runtime hiện tại | `docs/status/BUG_TRACKER.md` |
| Dashboard smoke matrix | `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md` |
| Bản đồ docs/report | `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md` |
| Local runbook | `docs/runbooks/LOCAL_RUN_GUIDE.md` |
| Quality gate | `docs/policies/QUALITY_GATE.md` |

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `docs/status/` | Source of truth hiện tại, tiến độ, bug tracker, route health. |
| `docs/index/` | Index và bản đồ tài liệu/report. |
| `docs/roadmap/` | Kế hoạch refactor, consolidation và roadmap. |
| `docs/runbooks/` | Hướng dẫn chạy local, staging, rollout. |
| `docs/policies/` | Chính sách env, deploy, quality gate. |
| `docs/architecture/` | Tổng quan kiến trúc và inventory. |
| `docs/archive/` | Tài liệu cũ/chưa phân loại, không phải source of truth hiện tại. |

## Quy tắc cho prompt sau

- Ưu tiên `docs/status/PROJECT_PROGRESS_MASTER.md` và `docs/index/CURRENT_STATUS_INDEX.md`.
- Nếu docs/report lịch sử mâu thuẫn với status hiện tại, ưu tiên status/index mới nhất.
- Không sửa source chỉ vì docs được move. Prompt 21Y chỉ tổ chức docs/report và regression gate.
- Không claim Meta verified, POST event thật hoặc production ready nếu chưa có bằng chứng runtime tương ứng.
