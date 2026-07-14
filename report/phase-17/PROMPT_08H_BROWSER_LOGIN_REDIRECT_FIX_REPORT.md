# PROMPT 08H — BROWSER LOGIN REDIRECT FIX REPORT

## 1. Mục tiêu

Sửa lỗi người dùng nhập đúng tài khoản nhưng không vào được Dashboard, đồng thời kiểm tra hồi quy auth flow bằng static validation, backend auth smoke và browser redirect smoke.

Phạm vi giữ hẹp: không sửa `.env`, không sửa Prisma schema/migrations, không đụng RAG/raw SQL, webhook, tenant handoff, package, Dockerfile hoặc scripts.

## 2. Triệu chứng từ screenshot

- Người dùng ở trang Login, nhập credential đúng nhưng vẫn không vào Dashboard.
- Trạng thái browser có dấu hiệu đứng lại ở `/login`, không thấy Dashboard render.
- Cần kiểm chứng bằng browser thật thay vì chỉ dựa vào typecheck/build.

## 3. Nguyên nhân thật

Nguyên nhân runtime chính là dashboard dev server cũ đang phục vụ `_next/static` chunk 404 sau khi build/dev state bị lệch. Vì chunk JS không tải được, React không hydrate trang Login; khi bấm submit, form rơi về native submit `/login?` và không gọi `/api/auth/login`.

Sau khi restart đúng dashboard dev server, hydration hoạt động lại và login đúng đi vào Dashboard.

Trong lúc audit cũng phát hiện một vấn đề source thật: global API interceptor xử lý mọi 401 bằng redirect về `/login`, kể cả 401 từ `/auth/login`. Vì vậy login sai credential có thể bị reload/redirect trước khi Login page hiển thị lỗi an toàn.

## 4. Source files changed

- `backend/src/index.js`: bỏ fallback seed admin bằng mật khẩu mẫu; khi cần tạo admin ban đầu thì bắt buộc có `ADMIN_PASSWORD`.
- `dashboard/src/app/login/page.tsx`: thêm guard đưa user đã đăng nhập về `/dashboard`; đổi login success sang `router.replace('/dashboard')`; disable submit khi auth provider đang hydrate.
- `dashboard/src/lib/api.ts`: không global redirect với 401 của `/auth/login`; protected 401 vẫn xóa `token`, `user`, `selectedTenantId` và về `/login`.
- `docs/status/PROJECT_PROGRESS.md`: cập nhật tiến độ Prompt 08H.
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`: cập nhật checklist auth/browser sau Prompt 08H.
- `docs/roadmap/REFACTOR_PLAN.md`: cập nhật kế hoạch và bước tiếp theo.
- `report/phase-17/PROMPT_08H_BROWSER_LOGIN_REDIRECT_FIX_REPORT.md`: báo cáo này.

## 5. Auth flow trước/sau

Trước:

- Nếu dashboard dev server bị stale chunk, Login không hydrate, form native-submit về `/login?`, không gọi backend auth.
- Login thành công dùng `router.push('/dashboard')`, có thể giữ `/login` trong browser history.
- Login sai credential bị global 401 interceptor reload/redirect, làm mất lỗi hiển thị trên form.
- Backend local/dev còn fallback seed admin bằng mật khẩu mẫu nếu thiếu `ADMIN_PASSWORD`.

Sau:

- Login page hydrate đúng sau restart server; form gọi `/api/auth/login`.
- Login thành công dùng `router.replace('/dashboard')`.
- User đã có session localStorage được đưa về `/dashboard` sau khi auth provider hydrate.
- Login sai credential vẫn ở `/login`, hiển thị lỗi an toàn, không lưu token.
- Seed admin không dùng mật khẩu mẫu ở bất kỳ môi trường nào.

## 6. Validation

Static/build validation đã chạy:

- Backend `node --check src/index.js`: PASS.
- Backend `node --check src/api/dashboard.js`: PASS.
- Backend `npx prisma validate`: PASS.
- Dashboard `npx --no-install tsc --noEmit`: PASS.
- Dashboard `npm run --if-present build`: PASS.
- `git diff --check`: PASS, chỉ có warning CRLF/LF của Git trên Windows.
- Scan credential/fallback: không còn sample credential, standalone token, fake token hoặc fallback auth trong `dashboard/src` và `backend/src`; chuỗi `admin123` còn lại chỉ là denylist weak secret trong config, không phải bypass/fallback.

Không in credential, token, JWT secret hoặc database URL trong output.

## 7. Backend auth smoke

Kết quả: PASS 8/8.

- `GET /health`: 200.
- `POST /api/auth/login` với credential hợp lệ: 200, có token và user.
- `POST /api/auth/login` với credential sai: 401.
- Token hợp lệ gọi `GET /api/prompts`: 200.
- Token hợp lệ gọi `GET /api/settings/handoff`: 200.
- Token hợp lệ gọi `GET /api/settings/telegram-destinations`: 200.
- `GET /webhook` thiếu verify hợp lệ: 403.
- `POST /chatwoot-webhook`: 404.

Smoke script chỉ đọc env cục bộ để chạy kiểm thử và không in giá trị nhạy cảm.

## 8. Browser redirect smoke

Kết quả: PASS.

- Hydration PASS: nút eye toggle đổi input password từ `password` sang `text`.
- Login đúng credential: URL chuyển sang `http://localhost:3002/dashboard`, có `token` và `user` trong localStorage, Dashboard render nội dung.
- Refresh Dashboard: vẫn ở `/dashboard`, không bị đá về `/login`.
- Logout: về `/login`, xóa `token` và `user`.
- Login sai credential: vẫn ở `/login`, không lưu token, hiển thị lỗi an toàn `Sai tài khoản hoặc mật khẩu`.
- Không còn `_next/static` chunk 404 trong smoke sau restart.
- Không ghi nhận console error trong browser smoke.

Dashboard dev server do Codex khởi động để smoke test đã được dừng sau khi kiểm thử. Backend local đang chạy sẵn từ trước không bị dừng.

## 9. Không thay đổi

- Không đọc/in nội dung thật của `backend/.env` hoặc `dashboard/.env.local`.
- Không stage/commit env file.
- Không sửa Prisma schema hoặc migrations.
- Không chạy `prisma db push`.
- Không sửa RAG/raw SQL.
- Không sửa webhook handlers.
- Không sửa tenant handoff.
- Không sửa package/dependencies.
- Không sửa Dockerfile, docker-compose hoặc start/stop scripts.
- Không push remote.

## 10. Remaining blockers

Không còn blocker cho mục tiêu Prompt 08H.

Điểm cần tu sửa sau, nhưng không thuộc phạm vi 08H:

- Token hiện vẫn lưu trong localStorage; nếu muốn hardening session sâu hơn cần prompt riêng.
- Dev workflow nên tránh chạy `next build` rồi giữ dev server cũ lâu dài; nếu thấy chunk 404 cần restart dev server.
- Prompt 09 vẫn cần audit RAG/raw SQL và tenant scope.

## 11. Final verdict

PASS

## 12. Next step

Prompt tiếp theo nên là Prompt 09: RAG/raw SQL hardening. Mục tiêu là audit tenant scope, parameterized query và các đường truy vấn knowledge/search, không trộn thêm refactor auth/session lớn vào cùng prompt.
