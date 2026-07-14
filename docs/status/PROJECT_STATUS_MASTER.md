# PROJECT STATUS MASTER — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-14
Prompt gần nhất: **21B-5**

## 1. Tóm tắt hiện tại

- Product goal: nhận tin nhắn Facebook Messenger qua Meta Developer Webhook, xử lý trong backend Express custom bằng bot/AI/RAG/handoff, quản trị qua Dashboard Next.js nội bộ, lưu dữ liệu trong PostgreSQL/pgvector.
- Architecture goal: tiếp tục Clean Architecture theo bước nhỏ, không refactor ồ ạt và không đổi behavior khi chưa có runtime proof.
- Current target: **No-Chatwoot**.
- Meta callback đúng là `GET /webhook` và `POST /webhook`.
- `/api/settings/webhook` là dashboard config/read endpoint có auth, **không** phải callback Meta.
- Production chưa ready: Meta verify challenge, Meta POST event thật và production rollout thật vẫn pending.
- Runtime dashboard hiện tại sau Prompt 21B-5: **PASS** với clean `.next`, fresh dev server, full route smoke, static asset smoke và dev log scan.
- Backend route consolidation sau Prompt 21B-5 đã tách thêm `GET /api/admin-users` an toàn.
- Docs/report organization sau Prompt 21Y: **DONE**. Root `docs/` và root `report/` chỉ giữ `README.md`; tài liệu/report thật đã nằm trong các thư mục con theo nhóm.

## 2. Bảng trạng thái theo nhóm

| Nhóm | Trạng thái | Đã xử lý | Đang xử lý | Đang lên kế hoạch | Chưa xử lý | Blocker | Bước tiếp theo |
|---|---|---|---|---|---|---|---|
| Backend API / dashboard.js monolith | STARTED | Prompts/settings/quick-reply-menus/channel-configs/campaigns/stats/admin-users read routes đã tách từng bước | Route debt còn trong `backend/src/api/dashboard.js` | 21B-6 nếu có candidate read-only nhỏ | Mutation/external routes chưa tách | Không chọn route có external/mutation/raw SQL/secret nếu chưa có prompt riêng | Audit route map và chỉ chọn GET read-only an toàn; nếu không có thì `NO_SAFE_CANDIDATE`. |
| Dashboard feature split | STARTED | Analytics/prompts/staff/appointments/content-packages/quick-replies/campaigns đã split | Runtime stability rule 21X/21Y đang active | Page nhỏ còn lại nếu guard đủ | Settings/knowledge/handoff/tenants rủi ro cao | Mọi dashboard refactor phải full route + static asset smoke | Chỉ mở split mới sau khi bug tracker sạch. |
| Meta webhook staging | BLOCKED | Public Ngrok smoke không dùng secret đã PASS ở 22B | Chờ operator verify Meta UI | Meta POST event thật sau verify | Chưa có event thật | Thiếu `META_VERIFY_OPERATOR_CONFIRMED=YES` | Người vận hành verify callback `/webhook` bằng token thật. |
| Production rollout | NOT_STARTED | Policy/checklist đã có | Không có rollout đang chạy | Backup + `prisma migrate deploy` + smoke prod thật | Production deploy/smoke thật | Chưa xong staging + Meta event | Chạy prompt rollout riêng sau staging verified. |
| Security/auth | STARTED | Tenant guard P0/P1, detail guard, login auth, webhook log redaction | Một số route legacy/global cần phân loại tiếp | Audit route còn lại | Full pen-test chưa làm | Không có test auth toàn diện tự động | Tiếp tục theo checklist security sau route consolidation. |
| RAG/raw SQL | DONE | RAG, analytics, handoff raw SQL hardening đã hoàn tất | Không | Drift/backlog nếu phát sinh | Không | Không | Giữ regression scan `$queryRawUnsafe`. |
| DevOps/deployment | DONE WITH PENDING ROLLOUT | `db push --accept-data-loss` đã loại khỏi script executable; deploy policy/checklist đã có | Chưa rollout prod | Production release step | Production smoke thật | Cần backup + staging confidence | Dùng `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`. |
| Docs/report organization | DONE | 21Y đã move vật lý docs/report, update index/README/progress master và kiểm tra link | Không | Chỉ bảo trì khi thêm prompt/report mới | Không | Không | Report mới đặt vào phase đúng, update README/index liên quan. |
| Bugs/runtime stability | STARTED | BUG-21C-SAFE, BUG-21C-3 resolved; 21Y regression gate không phát hiện bug mới | Không có bug runtime dashboard mới | Add automated browser CI nếu có scope | Không có CI smoke tự động | Next dev cache có thể stale nếu dùng server cũ | Dừng server cũ, clean `.next`, full route + asset smoke sau mỗi dashboard refactor. |

## 3. Phase board

| Phase | Tên | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|---|
| Phase 17 | No-Chatwoot architecture/runtime | DONE | `report/phase-17/` | Target hiện tại vẫn No-Chatwoot. |
| Phase 18 | RAG/raw SQL hardening | DONE | `report/phase-18/` | Không thêm raw unsafe mới. |
| Phase 19 | Dashboard feature split | STARTED | `report/phase-19/`, `report/bugs/` | Sau 21X/21Y phải full route + asset smoke. |
| Phase 20 | DevOps/deploy hardening | DONE WITH PENDING ROLLOUT | `report/phase-20/` | Production rollout thật chưa chạy. |
| Phase 21 | Project structure/backend/docs | STARTED | `report/phase-21/` | Docs/report move DONE; `GET /api/admin-users` đã tách; backend monolith debt còn. |
| Phase 22 | Public HTTPS / Meta webhook readiness | BLOCKED | `report/phase-22/` | Chờ operator Meta verify confirmation. |

## 4. Dashboard route health hiện tại

Xem `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md`.

Trạng thái sau 21B-5: full route smoke PASS, static asset smoke PASS, dev log scan sạch. Không phát hiện bug source/dashboard mới sau backend route consolidation.

## 5. Bug tracker hiện tại

Xem `docs/status/BUG_TRACKER.md`.

Trạng thái ngắn: không có bug dashboard mới sau 21Y. Các bug stale chunk/cache trước đó đã resolved bằng process/cache proof, không bằng source patch.

## 6. Next prompt đề xuất

| Prompt | Mục tiêu | Vì sao chọn | Điều kiện bắt đầu | Điều kiện PASS |
|---|---|---|---|---|
| `21B-6-SAFE` hoặc `NO_SAFE_CANDIDATE` | Tiếp tục backend route consolidation read-only nhỏ hoặc dừng rõ nếu không có candidate | Phase 21 còn monolith debt | Audit chứng minh route GET-only, không external/mutation/raw SQL/secret | Backend quality, Prisma validate, regression smoke route pass |
| Dashboard split kế tiếp | Tách page nhỏ còn lại | Phase 19 còn nợ | Đọc bug tracker, clean `.next`, fresh server, smoke rule 21Y | Full route smoke, static asset smoke, dev log scan sạch |
| `META_VERIFY_OPERATOR_CHECKPOINT` | Ghi nhận Meta UI Verify and Save và chuẩn bị POST event thật | Phase 22 đang blocked | Người vận hành xác nhận `META_VERIFY_OPERATOR_CONFIRMED=YES` | Không in secret, callback `/webhook` verified, docs status cập nhật |

## 7. Không được claim

- Không claim Meta verified nếu chưa có xác nhận operator từ Meta UI.
- Không claim POST event thật nếu chưa nhận/chứng minh event thật.
- Không claim production ready khi chưa backup, deploy và smoke production thật.
- Không dùng Chatwoot target.
- Không sửa source chỉ vì docs/report được move.
