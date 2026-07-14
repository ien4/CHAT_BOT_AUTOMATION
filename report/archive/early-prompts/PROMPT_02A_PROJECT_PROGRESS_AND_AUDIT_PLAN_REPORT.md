# PROMPT 02A - PROJECT PROGRESS AND AUDIT PLAN REPORT

Ngày thực hiện: 2026-07-07  
Ngôn ngữ: Tiếng Việt  
Phạm vi: tạo tài liệu tiến độ, checklist audit tính năng và roadmap tiếp theo. Không refactor source runtime.

## 1. Mục tiêu

Prompt 02A được thực hiện để tạo một nguồn theo dõi trung tâm cho dự án sau khi:

- Prompt 01 đã hoàn thành audit kiến trúc read-only.
- Prompt 02 bị chặn vì workspace chưa có `.git`, chưa có checkpoint an toàn và thiếu dependency local.

Mục tiêu cụ thể:

1. Đọc lại các report, docs và file cấu hình quan trọng.
2. Chạy scan read-only theo yêu cầu.
3. Tạo file tiến độ trung tâm trong `docs/status/PROJECT_PROGRESS.md`.
4. Tạo checklist audit tính năng trong `docs/status/FEATURE_AUDIT_CHECKLIST.md`.
5. Tạo report Prompt 02A trong `report/`.
6. Không sửa source runtime, không chạy migration, không chạy app.

## 2. File đã đọc hoặc kiểm tra

Các file/tài liệu đã được dùng làm nguồn:

| Nhóm | File |
|---|---|
| Report trước | `report/archive/early-prompts/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md` |
| Report trước | `report/archive/early-prompts/PROMPT_02_BLOCKED_NEED_GIT_CHECKPOINT.md` |
| Roadmap/progress cũ | `ROADMAP.md` |
| Roadmap/progress cũ | `MULTITENANT_PROGRESS.md` |
| Docs | `docs/archive/unclassified/appointment-modify-spec.md` |
| Backend config | `backend/package.json` |
| Dashboard config | `dashboard/package.json` |
| Prisma | `backend/prisma/schema.prisma` |
| Env example | `backend/.env.example` |
| DevOps | `docker-compose.yml` |
| DevOps | `start-all.bat` |
| DevOps | `stop-all.bat` |

Ghi chú bảo mật: không đọc `.env` thật, chỉ đọc `.env.example` và chỉ ghi nhận tên biến môi trường ở mức audit.

## 3. File đã tạo hoặc cập nhật

| File | Trạng thái | Nội dung |
|---|---|---|
| `docs/status/PROJECT_PROGRESS.md` | Tạo mới | Tiến độ trung tâm, nguyên tắc bảo vệ, checklist trước refactor, roadmap Phase A-I, lịch sử prompt, bước tiếp theo Prompt 02B. |
| `docs/status/FEATURE_AUDIT_CHECKLIST.md` | Tạo mới | Bảng kiểm tính năng theo nhóm A-G: backend core, messaging/webhook, bot/AI, RAG, multi-tenant, dashboard, DevOps/deploy. |
| `report/archive/early-prompts/PROMPT_02A_PROJECT_PROGRESS_AND_AUDIT_PLAN_REPORT.md` | Tạo mới | Báo cáo việc đã làm trong Prompt 02A và kết luận trạng thái. |

## 4. Source code runtime có bị thay đổi không?

Không.

Prompt 02A chỉ tạo file tài liệu/report. Không sửa:

- `backend/src`
- `dashboard/src`
- `backend/prisma/schema.prisma`
- `docker-compose.yml`
- batch scripts
- package files
- `.env`

Không chạy:

- `prisma db push`
- `prisma migrate`
- `docker compose up`
- `start-all.bat`
- test scripts ghi dữ liệu
- app server

## 5. Trạng thái hiện tại của dự án

| Hạng mục | Kết quả |
|---|---|
| Git repository | Chưa có `.git`; `git status --short --branch` báo không phải git repository. |
| Backend dependencies | `backend/node_modules` chưa tồn tại. |
| Dashboard dependencies | `dashboard/node_modules` chưa tồn tại. |
| Source architecture | Backend có nhiều module nhưng file `backend/src/api/dashboard.js` còn rất lớn. |
| Dashboard | Có nhiều trang quản trị; một số flow dùng `fetch` trực tiếp và hard-code localhost. |
| Database/Prisma | Có Prisma schema và pgvector; chưa chạy validate trong Prompt 02A. |
| Dev scripts | `start-all.bat` có thao tác rủi ro cao: `prisma db push --accept-data-loss`. |

## 6. Checklist quan trọng đã tạo

Checklist chính nằm trong:

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`

Các nhóm đã được map:

| Nhóm | Nội dung |
|---|---|
| A | Backend core |
| B | Messaging và webhook |
| C | Bot và AI |
| D | RAG và knowledge base |
| E | Multi-tenant |
| F | Dashboard |
| G | DevOps, deploy và vận hành local |

Mỗi nhóm có các cột: trạng thái hiện tại, file liên quan, rủi ro bug ẩn, kiểm tra an toàn, ưu tiên và ghi chú.

## 7. Rủi ro P0 nổi bật

| Rủi ro | Lý do cần ưu tiên |
|---|---|
| Không có git checkpoint | Không thể refactor an toàn nếu không có điểm quay lui. |
| Thiếu dependency local | Chưa thể chạy validation/build để biết lỗi baseline. |
| `$queryRawUnsafe` | Xuất hiện trong dashboard API, RAG, tenant handoff và seed script; cần audit input người dùng. |
| Hard-code localhost | Xuất hiện trong dashboard, scripts và webhook URL; gây lỗi deploy. |
| Tenant scope | Multi-tenant có nhiều flow nhạy cảm: channel config, handoff, conversations, knowledge. |
| `db push --accept-data-loss` | Có thể làm mất dữ liệu nếu chạy sai môi trường. |
| Default credential | Admin fallback và provider placeholder cần khóa lại trước production. |

## 8. Roadmap đã đề xuất

Roadmap tổng thể nằm trong `docs/status/PROJECT_PROGRESS.md`, gồm các phase:

| Phase | Mục tiêu |
|---|---|
| A | Safety foundation |
| B | Config hardening |
| C | Backend route split |
| D | Service/repository layer |
| E | Tenant safety audit |
| F | RAG/database hardening |
| G | Dashboard API cleanup |
| H | DevOps cleanup |
| I | CI/test expansion |

Điểm bắt buộc: Phase A phải hoàn thành trước mọi refactor source.

## 9. Kết quả scan read-only

Các lệnh scan đã thực hiện theo hướng chỉ đọc:

| Scan | Kết quả chính |
|---|---|
| `git status --short --branch` | Không phải git repository. |
| Kiểm tra `.git` | Không tồn tại. |
| Kiểm tra `backend/node_modules` | Không tồn tại. |
| Kiểm tra `dashboard/node_modules` | Không tồn tại. |
| Liệt kê cây file quan trọng | Có `backend`, `dashboard`, `docs`, `report`, scripts và roadmap. |
| Scan localhost/path cứng | Có trong `start-all.bat`, `webhook-urls-current.txt`, backend logs/fallback, dashboard API/settings/campaigns/tenants. |
| Scan migration/raw SQL/TODO | Có `db push --accept-data-loss`, `prisma migrate deploy`, nhiều `$queryRawUnsafe`; không lấy lockfile làm nguồn chính. |
| Scan `process.env` | Env xuất hiện ở backend/chatwoot/webhook/notifications/dashboard/settings. |
| Scan `fetch/axios/api` dashboard | Dashboard chủ yếu dùng `dashboard/src/lib/api.ts`, nhưng `settings/page.tsx` có fetch trực tiếp và hard-code localhost. |
| Scan `require` backend | Backend đang dùng CommonJS rộng rãi; nhiều dynamic require trong handler/tool paths. |

## 10. Final verdict

PASS WITH WARNINGS.

Prompt 02A đã hoàn thành đúng phạm vi tài liệu và không sửa source runtime. Tuy nhiên dự án vẫn chưa sẵn sàng để refactor source vì:

- Chưa có `.git`.
- Chưa có checkpoint.
- Chưa có `node_modules`.
- Chưa có baseline validation.
- Có nhiều rủi ro P0 cần được kiểm tra trước khi đổi code.

## 11. Bước tiếp theo

Prompt tiếp theo nên là:

`PROMPT 02B - SAFETY FOUNDATION + BASELINE VALIDATION BEFORE REFACTOR`

Mục tiêu Prompt 02B:

1. Tạo hoặc xác nhận git checkpoint.
2. Cài dependency backend/dashboard nếu được phép.
3. Chạy validation an toàn, không phá dữ liệu.
4. Ghi lỗi baseline vào report.
5. Cập nhật `docs/status/PROJECT_PROGRESS.md`.

Không nên bắt đầu refactor source cho đến khi Prompt 02B hoàn thành.
