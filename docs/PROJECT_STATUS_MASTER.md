# PROJECT STATUS MASTER — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-14

## 1. Tóm tắt hiện tại

- Product goal: nhận tin nhắn Facebook Messenger qua Meta Developer Webhook, xử lý trong backend Express custom bằng bot/AI/RAG/handoff, quản trị qua Dashboard Next.js nội bộ, lưu dữ liệu trong PostgreSQL/pgvector.
- Architecture goal: tiếp tục Clean Architecture theo bước nhỏ, không refactor ồ ạt và không đổi behavior khi chưa có runtime proof.
- Current target: **No-Chatwoot**.
- Meta callback đúng là `GET /webhook` và `POST /webhook`.
- `/api/settings/webhook` là dashboard config/read endpoint có auth, **không** phải callback Meta.
- Production chưa ready: Meta verify challenge, Meta POST event thật và production rollout thật vẫn pending.
- Runtime dashboard hiện tại sau Prompt 21X: **PASS** với clean `.next`, fresh dev server `127.0.0.1:3019`, full route smoke, static asset smoke và dev log scan.

## 2. Bảng trạng thái theo nhóm

| Nhóm | Trạng thái | Đã xử lý | Đang xử lý | Đang lên kế hoạch | Chưa xử lý | Blocker | Bước tiếp theo |
|---|---|---|---|---|---|---|---|
| Backend API / dashboard.js monolith | STARTED | Prompts/settings/quick-reply-menus/channel-configs/campaigns/stats read routes đã tách từng bước | Route debt còn trong `backend/src/api/dashboard.js` | 21B-5 nếu có candidate read-only nhỏ | Mutation/external routes chưa tách | Không chọn route có external/mutation/raw SQL/secret nếu chưa có prompt riêng | Audit route map và chỉ chọn GET read-only an toàn. |
| Dashboard feature split | STARTED | Analytics/prompts/staff/appointments/content-packages/quick-replies/campaigns đã split | Runtime stability rule đã nâng sau 21X | Page nhỏ còn lại nếu guard đủ | Settings/knowledge/handoff/tenants rủi ro cao | Mọi dashboard refactor phải full route + static asset smoke | Chỉ mở split mới sau khi bug tracker sạch. |
| Meta webhook staging | BLOCKED | Public Ngrok smoke không dùng secret đã PASS ở 22B | Chờ operator verify Meta UI | Meta POST event thật sau verify | Chưa có event thật | Thiếu `META_VERIFY_OPERATOR_CONFIRMED=YES` | Người vận hành verify callback `/webhook` bằng token thật. |
| Production rollout | NOT_STARTED | Policy/checklist đã có | Không có rollout đang chạy | Backup + `prisma migrate deploy` + smoke prod thật | Production deploy/smoke thật | Chưa xong staging + Meta event | Chạy prompt rollout riêng sau staging verified. |
| Security/auth | STARTED | Tenant guard P0/P1, detail guard, login auth, webhook log redaction | Một số route legacy/global cần phân loại tiếp | Audit route còn lại | Full pen-test chưa làm | Không có test auth toàn diện tự động | Tiếp tục theo checklist security sau route consolidation. |
| RAG/raw SQL | DONE | RAG, analytics, handoff raw SQL hardening đã hoàn tất | Không | Drift/backlog nếu phát sinh | Không | Không | Giữ regression scan `$queryRawUnsafe`. |
| DevOps/deployment | DONE WITH PENDING ROLLOUT | `db push --accept-data-loss` đã loại khỏi script executable; deploy policy/checklist đã có | Chưa rollout prod | Production release step | Production smoke thật | Cần backup + staging confidence | Dùng `docs/PRODUCTION_ROLLOUT_CHECKLIST.md`. |
| Docs/report organization | STARTED | 21D tạo current/historical index; 21X tạo status master, bug tracker, route matrix, organization map và report indexes | Chưa move historical docs/report | 21Y docs archive move | Historical reports vẫn nằm root `report/` | Không mass-move nếu chưa update links/stubs | Dùng index trước, move sau bằng prompt riêng. |
| Bugs/runtime stability | STARTED | BUG-21C-SAFE và BUG-21C-3 đều resolved bằng cache/process proof | Dashboard smoke rule mới active | Add regression checklist vào mọi dashboard prompt | Không có automated browser CI | Next dev cache có thể stale nếu dùng server cũ | Dừng server cũ, clean `.next`, full route + asset smoke sau mỗi dashboard refactor. |

## 3. Phase board

| Phase | Tên | Trạng thái | Prompt/commit gần nhất | Bằng chứng | Ghi chú |
|---|---|---|---|---|---|
| Phase 17 | No-Chatwoot architecture/runtime | DONE | `95b6eeb`, `9851bd1`, `2be8e89` | Reports 08A-08H | Target hiện tại vẫn No-Chatwoot. |
| Phase 18 | RAG/raw SQL hardening | DONE | `481d050`, `6cc7e84`, `19a06d6` | Reports 09/09B/09C/10A | Không thêm raw unsafe mới. |
| Phase 19 | Dashboard feature split | STARTED | `366b72d Split dashboard campaigns feature` | Reports 19A-D, 21C, 21C-2, 21C-3, 21X | Sau 21X phải full route + asset smoke. |
| Phase 20 | DevOps/deploy hardening | DONE | `588b9be` | Report 10B, deployment policy | Production rollout thật chưa chạy. |
| Phase 21 | Project structure consolidation | STARTED | `340d854`, `366b72d` | Reports 21A/21B/21C/21D/21X | Backend monolith và dashboard page debt còn. |
| Phase 22 | Public HTTPS / Meta webhook readiness | BLOCKED | `80a8652` | Reports 22A/22B/22C | Chờ operator Meta verify confirmation. |
| Runtime bugs | Dashboard chunk/cache stability | STARTED | Prompt 21X | `docs/BUG_TRACKER.md`, `docs/DASHBOARD_ROUTE_SMOKE_MATRIX.md` | Hiện PASS; giữ tracker cho prompt sau. |
| Docs organization | Status hub/report map | STARTED | Prompt 21X | `docs/DOCS_REPORT_ORGANIZATION_MAP.md`, `report/README.md` | Chưa move historical files. |

## 4. Dashboard route health hiện tại

Xem `docs/DASHBOARD_ROUTE_SMOKE_MATRIX.md`.

## 5. Bug tracker hiện tại

Xem `docs/BUG_TRACKER.md`.

## 6. Next 3 prompt đề xuất

| Prompt | Mục tiêu | Vì sao chọn | Điều kiện bắt đầu | Điều kiện PASS |
|---|---|---|---|---|
| `21Y-DOCS-ARCHIVE-MOVE` | Move/copy docs/report vào cấu trúc đề xuất với stubs/links | 21X mới tạo index, chưa move để tránh gãy link | Working tree sạch, có map file hiện tại | Link current docs không gãy, stubs rõ, validation docs sạch |
| `21B-5-SAFE` hoặc `NO_SAFE_CANDIDATE` | Tiếp tục backend route consolidation read-only nhỏ | Phase 21 còn monolith debt | Audit chứng minh route GET-only, không external/mutation/raw SQL/secret | Backend quality, Prisma validate, regression smoke route pass |
| `META_VERIFY_OPERATOR_CHECKPOINT` | Ghi nhận Meta UI Verify and Save và chuẩn bị POST event thật | Phase 22 đang blocked | Người vận hành xác nhận `META_VERIFY_OPERATOR_CONFIRMED=YES` | Không in secret, callback `/webhook` verified, docs status cập nhật |

## 7. Không được claim

- Không claim Meta verified nếu chưa có xác nhận operator từ Meta UI.
- Không claim POST event thật nếu chưa nhận/chứng minh event thật.
- Không claim production ready khi chưa backup, deploy và smoke production thật.
- Không dùng Chatwoot target.
