# PROJECT STATUS MASTER — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-14
Prompt gần nhất: **23A**

## 1. Tóm tắt hiện tại

- Product goal: nhận tin nhắn Facebook Messenger qua Meta Developer Webhook, xử lý trong backend Express custom bằng bot/AI/RAG/handoff, quản trị qua Dashboard Next.js nội bộ, lưu dữ liệu trong PostgreSQL/pgvector.
- Architecture goal: tiếp tục Clean Architecture theo bước nhỏ, không refactor ồ ạt và không đổi behavior khi chưa có runtime proof.
- Current Facebook target: **No-Chatwoot**. Facebook Messenger vẫn đi direct qua Express `GET/POST /webhook`.
- Website Chatwoot target: **proposed/planned only** theo ADR 23A; chưa có runtime, schema, env thật, package hoặc dashboard UI.
- Meta callback đúng là `GET /webhook` và `POST /webhook`.
- `/api/settings/webhook` là dashboard config/read endpoint có auth, **không** phải callback Meta.
- Production chưa ready: Meta verify challenge, Meta POST event thật và production rollout thật vẫn pending.
- Runtime dashboard hiện tại sau Prompt 21B-5: **PASS** với clean `.next`, fresh dev server, full route smoke, static asset smoke và dev log scan.
- Backend route consolidation sau Prompt 21B-5 đã tách thêm `GET /api/admin-users` an toàn.
- Hybrid channel decision sau Prompt 23A: Chatwoot không dùng cho Facebook, không khôi phục `/chatwoot-webhook*`; Website live-chat có thể dùng Chatwoot như integration riêng nếu triển khai theo ADR.
- Docs/report organization sau Prompt 21Y: **DONE**. Root `docs/` và root `report/` chỉ giữ `README.md`; tài liệu/report thật đã nằm trong các thư mục con theo nhóm.

## 2. Bảng trạng thái theo nhóm

| Nhóm | Trạng thái | Đã xử lý | Đang xử lý | Đang lên kế hoạch | Chưa xử lý | Blocker | Bước tiếp theo |
|---|---|---|---|---|---|---|---|
| Backend API / dashboard.js monolith | STARTED | Prompts/settings/quick-reply-menus/channel-configs/campaigns/stats/admin-users read routes đã tách từng bước | Route debt còn trong `backend/src/api/dashboard.js` | 21B-6 nếu có candidate read-only nhỏ | Mutation/external routes chưa tách | Không chọn route có external/mutation/raw SQL/secret nếu chưa có prompt riêng | Audit route map và chỉ chọn GET read-only an toàn; nếu không có thì `NO_SAFE_CANDIDATE`. |
| Dashboard feature split | STARTED | Analytics/prompts/staff/appointments/content-packages/quick-replies/campaigns đã split | Runtime stability rule 21X/21Y đang active | Page nhỏ còn lại nếu guard đủ | Settings/knowledge/handoff/tenants rủi ro cao | Mọi dashboard refactor phải full route + static asset smoke | Chỉ mở split mới sau khi bug tracker sạch. |
| Meta webhook staging | BLOCKED | Public Ngrok smoke không dùng secret đã PASS ở 22B | Chờ operator verify Meta UI | Meta POST event thật sau verify | Chưa có event thật | Thiếu `META_VERIFY_OPERATOR_CONFIRMED=YES` | Người vận hành verify callback `/webhook` bằng token thật. |
| Website Chatwoot hybrid channel | PLANNED / ADR_ACCEPTED | ADR 23A, roadmap Website Chatwoot | Chưa code | 23B schema/env/API plan | Runtime/schema/dashboard UI/smoke chưa có | Không được dùng Chatwoot cho Facebook hoặc khôi phục `/chatwoot-webhook*` | Chỉ tiếp tục bằng prompt 23B có phạm vi rõ. |
| Production rollout | NOT_STARTED | Policy/checklist đã có | Không có rollout đang chạy | Backup + `prisma migrate deploy` + smoke prod thật | Production deploy/smoke thật | Chưa xong staging + Meta event | Chạy prompt rollout riêng sau staging verified. |
| Security/auth | STARTED | Tenant guard P0/P1, detail guard, login auth, webhook log redaction | Một số route legacy/global cần phân loại tiếp | Audit route còn lại | Full pen-test chưa làm | Không có test auth toàn diện tự động | Tiếp tục theo checklist security sau route consolidation. |
| RAG/raw SQL | DONE | RAG, analytics, handoff raw SQL hardening đã hoàn tất | Không | Drift/backlog nếu phát sinh | Không | Không | Giữ regression scan `$queryRawUnsafe`. |
| DevOps/deployment | DONE WITH PENDING ROLLOUT | `db push --accept-data-loss` đã loại khỏi script executable; deploy policy/checklist đã có | Chưa rollout prod | Production release step | Production smoke thật | Cần backup + staging confidence | Dùng `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`. |
| Docs/report organization | DONE | 21Y đã move vật lý docs/report, update index/README/progress master và kiểm tra link | Không | Chỉ bảo trì khi thêm prompt/report mới | Không | Không | Report mới đặt vào phase đúng, update README/index liên quan. |
| Bugs/runtime stability | STARTED | BUG-21C-SAFE, BUG-21C-3 resolved; 21Y regression gate không phát hiện bug mới | Không có bug runtime dashboard mới | Add automated browser CI nếu có scope | Không có CI smoke tự động | Next dev cache có thể stale nếu dùng server cũ | Dừng server cũ, clean `.next`, full route + asset smoke sau mỗi dashboard refactor. |

## 3. Phase board

| Phase | Tên | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|---|
| Phase 17 | No-Chatwoot architecture/runtime | DONE | `report/phase-17/` | Target Facebook vẫn No-Chatwoot; không dùng Chatwoot làm trung gian Facebook. |
| Phase 18 | RAG/raw SQL hardening | DONE | `report/phase-18/` | Không thêm raw unsafe mới. |
| Phase 19 | Dashboard feature split | STARTED | `report/phase-19/`, `report/bugs/` | Sau 21X/21Y phải full route + asset smoke. |
| Phase 20 | DevOps/deploy hardening | DONE WITH PENDING ROLLOUT | `report/phase-20/` | Production rollout thật chưa chạy. |
| Phase 21 | Project structure/backend/docs | STARTED | `report/phase-21/` | Docs/report move DONE; `GET /api/admin-users` đã tách; backend monolith debt còn. |
| Phase 22 | Public HTTPS / Meta webhook readiness | BLOCKED | `report/phase-22/` | Chờ operator Meta verify confirmation. |
| Phase 23 | Website Chatwoot Hybrid Channel | PLANNED / ADR_ACCEPTED | `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`, `report/phase-23/` | Chưa code runtime; còn schema/env/API plan, skeleton, mock smoke, dashboard UI và staging event. |

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
| `23B_WEBSITE_CHATWOOT_SCHEMA_ENV_API_PLAN` | Chốt data model/env/API contract cho Website Chatwoot | ADR 23A đã accepted | Chưa sửa code runtime; cần audit schema/env policy | Có plan rõ, không đổi Facebook `/webhook`, không khôi phục legacy route |

## 7. Không được claim

- Không claim Meta verified nếu chưa có xác nhận operator từ Meta UI.
- Không claim POST event thật nếu chưa nhận/chứng minh event thật.
- Không claim production ready khi chưa backup, deploy và smoke production thật.
- Không dùng Chatwoot làm target cho Facebook.
- Không khôi phục `/chatwoot-webhook*`.
- Không claim Website Chatwoot đã hoạt động; hiện chỉ là planned optional channel.
- Không sửa source chỉ vì docs/report được move.
## Cap nhat 23B - Website Chatwoot contract

Ngay cap nhat: 2026-07-15
Trang thai: **PASS / DOCS_ONLY**

- 23B da chot contract schema/env/API o muc tai lieu.
- Recommended data model: generic `TenantIntegration`, additive trong prompt sau neu duoc duyet.
- Feature flag de xuat: `WEBSITE_CHAT_ENABLED=false` mac dinh.
- Endpoint: `POST /integrations/website-chat/events`.
- Khong sua runtime source, schema/migration, env file, env example hoac package.
- Facebook `/webhook` giu nguyen; `/chatwoot-webhook*` khong khoi phuc.
- Website Chatwoot runtime van **NOT_STARTED**.
## Cap nhat 21B-6-FINAL - Backend route audit

Ngay cap nhat: 2026-07-15
Trang thai: **NO_SAFE_CANDIDATE**

- Phase 21 backend read-route consolidation thong thuong da toi diem dung.
- Cac route GET da tach truoc do van giu: prompts/settings/quick-reply-menus/channel-configs/campaigns/stats/admin-users.
- Route GET con lai trong `backend/src/api/dashboard.js` khong dat tieu chi "nho, read-only, khong PII/secret/external/raw SQL/core".
- Phase 21 hien la **STARTED / HIGH_RISK_ONLY_REMAINING**. Chi mo prompt rieng neu can xu ly conversations, knowledge, providers, handoff, Facebook, analytics, tenants, auth core hoac domain co mutation/action.
- Khong sua source/schema/env/package/dashboard/webhook trong 21B-6-FINAL.
- Phase 23 giu **PLANNED / NOT_STARTED runtime**; Website Chatwoot chua code va Facebook `/webhook` khong doi.
