# Report Index

Ngày cập nhật: 2026-07-14

Reports là audit trail theo từng prompt. Sau Prompt 21Y, root `report/` chỉ giữ README; report thật nằm trong thư mục phase/bugs/archive.

Nếu report cũ mâu thuẫn với `docs/status/PROJECT_PROGRESS_MASTER.md` hoặc `docs/index/CURRENT_STATUS_INDEX.md`, ưu tiên status/index mới.

## Nhóm đọc nhanh

| Nhóm | Index | Ghi chú |
|---|---|---|
| Prompts sớm 01-06/05R | `report/archive/early-prompts/` | Audit trail nền tảng trước phase hiện tại. |
| Phase 17 | `report/phase-17/README.md` | Tenant safety và No-Chatwoot architecture/runtime. |
| Phase 18 | `report/phase-18/README.md` | RAG/raw SQL hardening. |
| Phase 19 | `report/phase-19/README.md` | Dashboard feature split. |
| Phase 20 | `report/phase-20/README.md` | DevOps/deploy hardening. |
| Phase 21 | `report/phase-21/README.md` | Backend route consolidation, docs/status organization. |
| Phase 22 | `report/phase-22/README.md` | Public HTTPS, Ngrok, Meta verify/event readiness. |
| Runtime bugs | `report/bugs/README.md` | Chunk/cache/runtime bug reports. |

## Quy tắc thêm report mới

1. Đặt report vào thư mục phase/bugs đúng.
2. Cập nhật README của thư mục đó.
3. Cập nhật status docs nếu report thay đổi trạng thái hiện tại.
4. Không đặt report mới trực tiếp ở root `report/`.
