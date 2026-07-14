# DOCS / REPORT ORGANIZATION MAP

Ngày cập nhật: 2026-07-14
Prompt gần nhất: **21Y**
Trạng thái: **DONE**

## 1. Kết quả 21Y

- Đã move vật lý docs/report bằng `git mv` thay vì chỉ tạo README định hướng.
- Root `docs/` chỉ giữ `README.md`.
- Root `report/` chỉ giữ `README.md`.
- Tạo `docs/status/PROJECT_PROGRESS_MASTER.md` để prompt sau có nguồn tiến độ ngắn gọn.
- Tạo `docs/status/PROJECT_PHASE_BOARD.md` để đọc phase nhanh.
- Tạo README cho các nhóm docs/report chính.
- Cập nhật các tham chiếu current docs/report theo path mới.
- Không sửa backend/dashboard source, schema/migration/package/env do yêu cầu chỉ là docs/report và regression gate.

## 2. Cấu trúc hiện tại

```text
docs/
  README.md
  architecture/
    README.md
    ARCHITECTURE.md
    FEATURE_INVENTORY.md
    NO_CHATWOOT_DIRECT_ARCHITECTURE_CONTEXT.md
  archive/
    README.md
    unclassified/
      appointment-modify-spec.md
  index/
    README.md
    CURRENT_STATUS_INDEX.md
    DOCS_REPORT_ORGANIZATION_MAP.md
    HISTORICAL_DOCS_INDEX.md
  policies/
    README.md
    DEPLOYMENT_POLICY.md
    ENV_POLICY.md
    QUALITY_GATE.md
  roadmap/
    README.md
    NO_CHATWOOT_SCHEMA_ENV_CLEANUP_PLAN.md
    PHASE_19_DASHBOARD_FEATURE_SPLIT_PLAN.md
    PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md
    REFACTOR_PLAN.md
  runbooks/
    README.md
    LOCAL_RUN_GUIDE.md
    META_WEBHOOK_STAGING_RUNBOOK.md
    PRODUCTION_ROLLOUT_CHECKLIST.md
  status/
    README.md
    BUG_TRACKER.md
    DASHBOARD_ROUTE_SMOKE_MATRIX.md
    FEATURE_AUDIT_CHECKLIST.md
    META_WEBHOOK_STAGING_READINESS.md
    PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md
    PROJECT_PROGRESS.md
    PROJECT_PROGRESS_MASTER.md
    PROJECT_PHASE_BOARD.md
    PROJECT_STATUS_MASTER.md
```

```text
report/
  README.md
  archive/
    early-prompts/
    unclassified/
  bugs/
  phase-17/
  phase-18/
  phase-19/
  phase-20/
  phase-21/
  phase-22/
```

## 3. File map docs chính

| Trước 21Y | Sau 21Y | Vai trò |
|---|---|---|
| Root docs: `PROJECT_STATUS_MASTER.md` | `docs/status/PROJECT_STATUS_MASTER.md` | Source of truth trạng thái tổng. |
| Root docs: `PROJECT_PROGRESS.md` | `docs/status/PROJECT_PROGRESS.md` | Audit trail tiến độ dài. |
| New | `docs/status/PROJECT_PROGRESS_MASTER.md` | Progress master ngắn cho prompt sau. |
| New | `docs/status/PROJECT_PHASE_BOARD.md` | Phase board ngắn. |
| Root docs: `FEATURE_AUDIT_CHECKLIST.md` | `docs/status/FEATURE_AUDIT_CHECKLIST.md` | Checklist audit/quality. |
| Root docs: `BUG_TRACKER.md` | `docs/status/BUG_TRACKER.md` | Bug tracker runtime. |
| Root docs: `DASHBOARD_ROUTE_SMOKE_MATRIX.md` | `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md` | Route/static/dev-log smoke matrix. |
| Root docs: `CURRENT_STATUS_INDEX.md` | `docs/index/CURRENT_STATUS_INDEX.md` | Entry point hiện tại. |
| Root docs: `HISTORICAL_DOCS_INDEX.md` | `docs/index/HISTORICAL_DOCS_INDEX.md` | Index lịch sử. |
| Root docs: `DOCS_REPORT_ORGANIZATION_MAP.md` | `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md` | Map này. |
| Root docs: `REFACTOR_PLAN.md` | `docs/roadmap/REFACTOR_PLAN.md` | Refactor roadmap. |
| Root docs: `PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` | `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` | Structure/consolidation plan. |
| Root docs: `LOCAL_RUN_GUIDE.md` | `docs/runbooks/LOCAL_RUN_GUIDE.md` | Local runbook. |
| Root docs: `ENV_POLICY.md` | `docs/policies/ENV_POLICY.md` | Env/secret policy. |
| Root docs: `ARCHITECTURE.md` | `docs/architecture/ARCHITECTURE.md` | Architecture overview. |

## 4. Report map chính

| Nhóm | Thư mục |
|---|---|
| Prompts 01-06 và 05R | `report/archive/early-prompts/` |
| Tenant/No-Chatwoot Phase 17 | `report/phase-17/` |
| RAG/raw SQL Phase 18 | `report/phase-18/` |
| Dashboard feature split Phase 19 | `report/phase-19/` |
| DevOps/deploy Phase 20 | `report/phase-20/` |
| Project/backend/docs Phase 21 | `report/phase-21/` |
| Meta webhook staging Phase 22 | `report/phase-22/` |
| Runtime bug reports | `report/bugs/` |

## 5. Compatibility decision

Không tạo per-file stub cho từng file cũ vì toàn bộ current docs/report references theo mẫu `docs/<path>.md` và `report/<path>.md` đã được cập nhật sang path mới trong phạm vi `docs/` và `report/`. Root README đóng vai trò entry point compatibility cho người đọc.

Nếu prompt sau thêm report mới:

1. Đặt file vào thư mục phase đúng.
2. Cập nhật README của phase đó.
3. Cập nhật `docs/status/PROJECT_PROGRESS_MASTER.md` nếu ảnh hưởng trạng thái hiện tại.
4. Chạy broken-link check cho `docs/` và `report/`.
