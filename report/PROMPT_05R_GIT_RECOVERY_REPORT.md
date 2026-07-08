# PROMPT 05R — GIT RECOVERY REPORT

Ngày thực hiện: 2026-07-08
Kết luận: **PASS — docs/report 05R committed locally** (trên branch riêng, chưa push).

## 1. Mục tiêu

Khôi phục an toàn phần Git của Prompt 05R sau khi bị dừng: rà trạng thái Git, xác minh file docs/report 05R, đảm bảo không có source runtime bị sửa, stage đúng danh sách file cụ thể (không `git add .`), commit local trên branch riêng (không đụng `master`), không push `main`/`master`, không chạy app/migration/db push/Docker/start-all.

## 2. Lý do cần recovery

Prompt 05R đã tạo đầy đủ docs/report và chạy static validation (PASS), nhưng khi Claude Code hỏi stage/commit thì **user chọn No**, nên quy trình bị dừng ngay trước bước commit. Các file 05R vẫn nằm trong working tree (3 modified + 3 untracked) chưa được đưa vào Git. Prompt 05R-FIX này chỉ xử lý Git, không refactor.

## 3. File đã đọc

- `report/PROMPT_05R_FEATURE_INVENTORY_LOCAL_RUN_RUNTIME_SMOKE_REPORT.md` — kết luận `BLOCKED — needs local/test env`.
- `docs/FEATURE_INVENTORY.md` — liệt kê 9 nhóm chức năng, không mục nào runtime PASS.
- `docs/LOCAL_RUN_GUIDE.md` — có checklist chuẩn bị `backend/.env`, `dashboard/.env.local`, DB local/test.
- `docs/PROJECT_PROGRESS.md` — đã ghi Prompt 05R blocked, không đánh dấu runtime PASS.
- `docs/FEATURE_AUDIT_CHECKLIST.md` — runtime smoke 3 route = BLOCKED.
- `docs/REFACTOR_PLAN.md` — ghi cần chạy lại Prompt 05R sau khi có env/DB.

Nội dung các file đã đúng và đủ, không cần cập nhật thêm trong prompt này.

## 4. Git preflight

| Hạng mục | Kết quả |
|---|---|
| Branch ban đầu | `master` |
| `git status` ban đầu | 3 modified (`docs/FEATURE_AUDIT_CHECKLIST.md`, `docs/PROJECT_PROGRESS.md`, `docs/REFACTOR_PLAN.md`) + 3 untracked (`docs/FEATURE_INVENTORY.md`, `docs/LOCAL_RUN_GUIDE.md`, `report/PROMPT_05R_..._REPORT.md`) |
| Commit Prompt 05C `5e51bf7eea53305b4800c1449f4dc60caf885f46` | Tồn tại (`git cat-file -t` → `commit`) |
| Working tree trước khi stage | Chỉ có docs/report; không có source runtime change |

## 5. File 05R đã xác minh

Tất cả tồn tại và hợp lệ:

- `docs/FEATURE_INVENTORY.md` — OK
- `docs/LOCAL_RUN_GUIDE.md` — OK
- `report/PROMPT_05R_FEATURE_INVENTORY_LOCAL_RUN_RUNTIME_SMOKE_REPORT.md` — OK
- `docs/PROJECT_PROGRESS.md` — OK
- `docs/FEATURE_AUDIT_CHECKLIST.md` — OK
- `docs/REFACTOR_PLAN.md` — OK

## 6. Diff safety check

- File thay đổi: chỉ 6 file docs/report (`git diff --name-status`: 3 M docs; 3 untracked docs/report).
- Có source runtime đổi không: **KHÔNG** (`backend/src/**`, `dashboard/src/**`, `backend/prisma/**`, Dockerfile, scripts đều không thay đổi).
- Có `.env`/node_modules/.next/logs/uploads/package files staged không: **KHÔNG**.
- `git diff --cached --check`: sạch (exit 0). Chỉ có cảnh báo LF→CRLF vô hại của Git trên Windows.

## 7. Branch safety

- Branch ban đầu là `master` → theo guardrail, đã tạo branch riêng trước khi commit.
- Branch mới: **`chore/prompt-05r-docs-local-run`** (tạo bằng `git switch -c`, chưa từng tồn tại nên không cần suffix ngày).
- `git remote -v`: **không có remote nào cấu hình**.
- Có push không: **KHÔNG** (không có remote + user chưa yêu cầu push). Không push `main`/`master`, không force push.

## 8. Commit result

| Hạng mục | Giá trị |
|---|---|
| Commit hash mới | `2bf4386` |
| Commit message | `Add prompt 05R feature inventory and local run guide` |
| Số file | 6 files changed, 474 insertions(+), 12 deletions(-) |
| Working tree sau commit | Clean (`## chore/prompt-05r-docs-local-run`) — không còn thay đổi chưa commit của 6 file 05R |

Ghi chú: file `report/PROMPT_05R_GIT_RECOVERY_REPORT.md` này được tạo sau commit trên nên hiện là untracked (không nằm trong commit `2bf4386`).

## 9. Runtime smoke status

- Runtime smoke test 3 route (`GET /api/settings/webhook`, `GET /api/settings/telegram-destinations`, `GET /api/prompts`) **vẫn BLOCKED** vì thiếu `backend/.env` local/test và DB local/test.
- Prompt này **không** chạy app server/API.
- **Không** chạy migration/db push/Docker/start-all.

## 10. Next step

- Người dùng chuẩn bị `backend/.env` từ `backend/.env.example` (`DATABASE_URL` local/test, `JWT_SECRET`, `ADMIN_USERNAME/ADMIN_PASSWORD` local/test, `ENCRYPTION_KEY` nếu cần).
- Người dùng chuẩn bị `dashboard/.env.local` từ `dashboard/.env.example`.
- Người dùng chuẩn bị PostgreSQL local/test (không production).
- Sau đó chạy lại Prompt 05R Phase 5 để runtime smoke test 3 route đã tách.

## 11. Final verdict

**PASS — docs/report 05R committed locally** (branch `chore/prompt-05r-docs-local-run`, commit `2bf4386`, chưa push remote).
