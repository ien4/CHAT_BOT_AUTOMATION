# PROMPT 21Y — DOCS/REPORT PHYSICAL REORGANIZATION REPORT

Ngày thực hiện: 2026-07-14
Kết luận: **PASS**

## 1. Mục tiêu

Prompt 21Y yêu cầu tổ chức lại vật lý docs/report, tạo master progress cho prompt sau và chạy global dashboard regression gate để chứng minh việc move docs/report không làm phát sinh lỗi runtime.

## 2. Kết quả chính

| Hạng mục | Kết quả |
|---|---|
| Root `docs/` `.md` count | 1 |
| Root `docs/` file còn lại | `docs/README.md` |
| Root `report/` `.md` count | 1 |
| Root `report/` file còn lại | `report/README.md` |
| Master progress file | `docs/status/PROJECT_PROGRESS_MASTER.md` |
| Phase board file | `docs/status/PROJECT_PHASE_BOARD.md` |
| Source code changed? | Không |
| Backend/dashboard source changed? | Không |
| Schema/migration/package/env changed? | Không |
| Per-file compatibility stub created? | Không; current references đã được update, root README giữ vai trò entry point |

## 3. Docs/report đã tổ chức lại

Docs hiện nằm trong:

- `docs/status/`
- `docs/index/`
- `docs/roadmap/`
- `docs/runbooks/`
- `docs/policies/`
- `docs/architecture/`
- `docs/archive/`

Reports hiện nằm trong:

- `report/archive/early-prompts/`
- `report/bugs/`
- `report/phase-17/`
- `report/phase-18/`
- `report/phase-19/`
- `report/phase-20/`
- `report/phase-21/`
- `report/phase-22/`

Các README/index/status đã cập nhật để prompt sau đọc theo thứ tự:

1. `docs/status/PROJECT_PROGRESS_MASTER.md`
2. `docs/index/CURRENT_STATUS_INDEX.md`
3. `docs/status/PROJECT_STATUS_MASTER.md`
4. `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md`
5. `report/README.md`

## 4. Broken-link check

Scan toàn bộ `.md` trong `docs/` và `report/` theo pattern `docs/<path>.md` và `report/<path>.md`.

Kết quả sau khi tạo report 21Y:

- Tổng path references: 932.
- Broken live path: **0**.
- Các placeholder/historical old path đã đổi sang dạng không bị hiểu là link thật.
- Không phát hiện current docs/report link gãy.

## 5. Validation

| Gate | Kết quả |
|---|---|
| Dashboard `npm run typecheck` | PASS |
| Dashboard `npm run build` | PASS, 19 static pages generated |
| Backend `npm run quality` | PASS |
| Backend `npx prisma validate` | PASS |
| Root docs/report count | PASS |
| Diff scope guard | PASS, chỉ docs/report |

Ghi chú: backend `quality` và Prisma validate load `.env` local nhưng không in secret values. Không đọc/in env thật.

## 6. Dashboard regression gate

| Hạng mục | Kết quả |
|---|---|
| Port audit | `3002` có dashboard Next server cũ PID `24888`; `3019/3020/3021` rảnh |
| Stop server cũ | PASS, chỉ dừng PID `24888` thuộc workspace `dashboard` |
| Clean `.next` | PASS, verified path `dashboard/.next` rồi xóa |
| Rebuild sau clean | PASS |
| Fresh dev server | PASS, port `3019` |
| Full route smoke | PASS |
| Static asset smoke | PASS, 125 assets all 200 |
| Dev log scan | PASS, 0 hit |
| Stop smoke server | PASS, PID `9604`, port `3019` free sau stop |

Route smoke:

| Route | Status |
|---|---:|
| `/login` | 200 |
| `/dashboard` | 200 |
| `/dashboard/analytics` | 200 |
| `/dashboard/prompts` | 200 |
| `/dashboard/staff` | 200 |
| `/dashboard/appointments` | 200 |
| `/dashboard/content-packages` | 200 |
| `/dashboard/quick-replies` | 200 |
| `/dashboard/campaigns` | 200 |
| `/dashboard/channel-configs` | 200 |
| `/dashboard/conversations` | 200 |
| `/dashboard/knowledge` | 200 |
| `/dashboard/settings` | 200 |
| `/dashboard/tenants` | 200 |
| `/dashboard/handoff` | 200 |
| `/dashboard/__fake_21y__` | 404 hợp lệ |

Dev log không có:

- `Cannot find module './`
- `MODULE_NOT_FOUND`
- `Cannot read properties of undefined (reading 'call')`
- `webpack.cache.PackFileCacheStrategy`
- `ENOENT`
- `vendor-chunks`
- `_next/static` 404
- dashboard route 500

## 7. Bug dashboard

Không phát hiện bug dashboard mới trong Prompt 21Y.

`BUG-21C-SAFE` và `BUG-21C-3` vẫn ở trạng thái **RESOLVED**. Prompt 21Y xác nhận lại bằng fresh server, full route smoke, static asset smoke và dev log scan.

## 8. Phạm vi không đụng

- Không sửa backend source.
- Không sửa dashboard source.
- Không sửa Prisma schema/migration.
- Không sửa package/lock.
- Không sửa env.
- Không gọi external provider.
- Không gửi POST `/webhook`.
- Không chạy mutation/upload/write dashboard.
- Không stage `Bug_21C-3.md`, `.next`, logs hoặc temp files.

## 9. Điểm cần tu sửa

- Một số tài liệu lịch sử vẫn là audit trail dài và có bối cảnh cũ; prompt sau phải đọc current status trước khi tin nội dung lịch sử.
- Phase 21 backend route consolidation vẫn chưa Done; còn cần audit candidate nhỏ hoặc trả `NO_SAFE_CANDIDATE`.
- Phase 19 dashboard feature split vẫn chưa Done; các page rủi ro cao như settings/knowledge/handoff/tenants cần prompt riêng và gate runtime đầy đủ.
- Chưa có automated browser CI cho full route/static asset smoke; hiện gate vẫn chạy thủ công bằng script.
- Meta verify operator confirmation và Meta POST event thật vẫn pending.
- Production rollout thật chưa chạy.

## 10. Gợi ý tiếp theo

1. `21B-5-SAFE` nếu audit tìm được route backend GET/read-only nhỏ, không external/mutation/raw SQL/secret.
2. `NO_SAFE_CANDIDATE` nếu không còn route an toàn để tách trong prompt nhỏ.
3. Dashboard split kế tiếp chỉ khi đọc `docs/status/BUG_TRACKER.md` và áp dụng gate 21Y đầy đủ.
4. Meta verify operator checkpoint nếu người vận hành đã xác nhận Meta UI Verify and Save.
5. Production rollout prompt chỉ sau staging/Meta event thật.
