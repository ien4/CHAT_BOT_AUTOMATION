# DOCS / REPORT ORGANIZATION MAP

Ngày cập nhật: 2026-07-14

## 1. Vấn đề hiện tại

- Docs/report quá nhiều vì mỗi prompt để lại audit trail riêng.
- Historical reports giữ bằng chứng quan trọng nhưng gây rối nếu đọc như source of truth hiện tại.
- Current source of truth phải tách rõ khỏi tài liệu lịch sử/stale.
- Không được mass-move historical reports khi chưa update links/stubs vì sẽ làm gãy audit trail.

## 2. Cấu trúc đề xuất

```text
docs/
  status/
    PROJECT_STATUS_MASTER.md
    BUG_TRACKER.md
    DASHBOARD_ROUTE_SMOKE_MATRIX.md
  roadmap/
    REFACTOR_PLAN.md
    PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md
  runbooks/
    META_WEBHOOK_STAGING_RUNBOOK.md
    LOCAL_RUN_GUIDE.md
    PRODUCTION_ROLLOUT_CHECKLIST.md
  policies/
    ENV_POLICY.md
    DEPLOYMENT_POLICY.md
    QUALITY_GATE.md
  index/
    CURRENT_STATUS_INDEX.md
    HISTORICAL_DOCS_INDEX.md
  archive/
    legacy/stale docs only, not current truth

report/
  phase-19/
  phase-21/
  phase-22/
  bugs/
  archive/
```

Trong Prompt 21X, các file source of truth vẫn được tạo/giữ ở `docs/` root để tránh gãy link hiện tại. Các thư mục mới có README định hướng; việc move thật cần prompt riêng `21Y-DOCS-ARCHIVE-MOVE`.

## 3. File map

| File hiện tại | Vai trò | Nhóm mới | Move ngay? | Lý do |
|---|---|---|---|---|
| `docs/PROJECT_STATUS_MASTER.md` | Source of truth tổng trạng thái | `docs/status/` | Không | Tạo root trước để link đơn giản; move sau cần stub. |
| `docs/BUG_TRACKER.md` | Tracker bug runtime/status | `docs/status/` | Không | Root link trực tiếp từ current index. |
| `docs/DASHBOARD_ROUTE_SMOKE_MATRIX.md` | Matrix route/static asset smoke | `docs/status/` | Không | Dùng thường xuyên trong dashboard prompt. |
| `docs/CURRENT_STATUS_INDEX.md` | Entry point hiện tại | `docs/index/` | Không | Đang được nhiều report tham chiếu root path. |
| `docs/HISTORICAL_DOCS_INDEX.md` | Index docs/report lịch sử | `docs/index/` | Không | Chưa update toàn bộ references. |
| `docs/REFACTOR_PLAN.md` | Roadmap refactor | `docs/roadmap/` | Không | File đang là source history dài; move cần stub. |
| `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` | Plan/audit cấu trúc | `docs/roadmap/` | Không | Được report Phase 21 tham chiếu. |
| `docs/META_WEBHOOK_STAGING_RUNBOOK.md` | Runbook staging Meta | `docs/runbooks/` | Không | Để root path hiện tại cho report 22A/22B. |
| `docs/LOCAL_RUN_GUIDE.md` | Runbook local safe | `docs/runbooks/` | Không | Nhiều docs hiện trỏ root path. |
| `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` | Runbook rollout prod | `docs/runbooks/` | Không | Chưa move để tránh gãy link. |
| `docs/ENV_POLICY.md` | Policy env/secret | `docs/policies/` | Không | Được nhiều docs/report tham chiếu. |
| `docs/DEPLOYMENT_POLICY.md` | Policy deploy/migration | `docs/policies/` | Không | Giữ root path hiện tại. |
| `docs/QUALITY_GATE.md` | Policy quality gate | `docs/policies/` | Không | Giữ root path hiện tại. |
| `report/PROMPT_19*.md`, `report/PROMPT_21C*.md` | Phase 19 dashboard reports | `report/phase-19/` | Không | Tạo README index trước, chưa move files. |
| `report/PROMPT_21A*.md`, `report/PROMPT_21B*.md`, `report/PROMPT_21D*.md`, `report/PROMPT_21X*.md` | Phase 21 structure/docs reports | `report/phase-21/` | Không | Chưa update links/stubs. |
| `report/PROMPT_22*.md` | Phase 22 Meta/staging reports | `report/phase-22/` | Không | Chưa update links/stubs. |
| `report/PROMPT_21C_FIX*.md`, `report/PROMPT_21X*.md` | Runtime bug reports | `report/bugs/` | Không | Có cross-phase relevance; README index là đủ hiện tại. |

## 4. Quy tắc tổ chức

- Không mass-move historical reports nếu chưa update links.
- Ưu tiên tạo index + status hub trước.
- Chỉ move file nếu có compatibility stub hoặc đã update all current references.
- Follow-up prompt đề xuất: `21Y-DOCS-ARCHIVE-MOVE`.
