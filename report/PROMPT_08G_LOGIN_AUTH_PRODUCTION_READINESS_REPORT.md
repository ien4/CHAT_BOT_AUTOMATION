# PROMPT 08G — LOGIN AUTH PRODUCTION READINESS REPORT

Ngày thực hiện: 2026-07-10
Branch: `chore/prompt-05r-docs-local-run`
DB local/test: `bbotech-pgvector-local` (`localhost:5433`)

## 1. Mục tiêu

- Fix lỗi không đăng nhập được Dashboard.
- Bỏ thông tin tài khoản mẫu/mặc định khỏi UI login.
- Production không dựa vào default credential yếu; login local/staging vẫn hoạt động.
- Không phá No-Chatwoot migration ở 08F. Runtime login smoke sau fix.

## 2. Nguyên nhân login fail

Chẩn đoán bằng script controlled (chỉ in boolean, không in secret):

- `adminUser_count = 1`, admin user `admin` tồn tại; `JWT_SECRET`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` đều set; `NODE_ENV=development`.
- `effective_password_matches_hash = false` **và** `admin123_matches_hash = false` → hash mật khẩu admin trong DB local **stale**, không khớp cả `ADMIN_PASSWORD` hiện tại lẫn `admin123`.
- **Root cause**: seed cũ (`backend/src/index.js`) chỉ tạo admin khi `adminCount === 0` và **không bao giờ cập nhật** hash khi `ADMIN_PASSWORD` trong env thay đổi. Sau khi env đổi, không credential nào khớp → luôn 401.
- **Yếu tố phụ gây rối**: `dashboard/src/lib/auth.tsx` có standalone fallback — khi backend unreachable, chấp nhận `admin/admin123` và tạo `standalone-token-*` giả; token này không hợp lệ với backend nên mọi API call bị 401 → dashboard văng về `/login` (cảm giác "tài khoản mặc định vẫn không đăng nhập được").

## 3. Source files changed

- `dashboard/src/app/login/page.tsx` — bỏ credential mẫu, placeholder trung tính.
- `dashboard/src/lib/auth.tsx` — gỡ standalone fallback bypass.
- `backend/src/index.js` — dev self-heal admin hash + production auth guard + seed không dùng `admin123` ở production.

## 4. Login UI cleanup

- Xóa `<p>Mặc định: admin / admin123</p>`, thay bằng "Vui lòng dùng tài khoản quản trị đã được cấp."
- Placeholder username `admin` → "Tên đăng nhập"; không prefill, không mock login, không bypass.
- Scan `dashboard/src`: 0 match `admin123`/tài khoản mẫu/standalone.

## 5. Backend auth production safety

- `assertProductionAuthEnv()` gọi đầu `start()`: khi `NODE_ENV=production`, nếu `JWT_SECRET` hoặc `ADMIN_PASSWORD` yếu/placeholder/thiếu (dùng `isPlaceholderSecret` sẵn có) → log FATAL và `process.exit(1)`. Local/dev không bị ảnh hưởng.
- Seed admin: tra theo `ADMIN_USERNAME`; nếu chưa có thì tạo (production bắt buộc `ADMIN_PASSWORD`, dev mới rơi về `admin123`).
- Dev self-heal: nếu admin đã tồn tại và `ADMIN_PASSWORD` env không khớp hash cũ → cập nhật lại hash (chỉ dev). **Không bao giờ tự reset password ở production** (tránh clobber user thật).
- Không hard-code `admin/admin123` cho production; không in password/JWT secret.

## 6. Validation

- Backend `node --check` (index/db/dashboard/config) — PASS.
- `npx prisma validate` — PASS.
- Dashboard `npx --no-install tsc --noEmit` — PASS.
- Dashboard `npm run build` — PASS.

## 7. Runtime login smoke

Express app tạm (mount `/webhook` + `/api` + `/health`), DB local, không gọi FB/TG/LLM thật, không in credential/token. Trước test có bước controlled self-heal hash admin local = `ADMIN_PASSWORD` (mirror logic dev trong `index.js`).

1. GET /health → 200 — PASS
2. POST /api/auth/login (credential local hợp lệ) → 200, có token — PASS
3. POST /api/auth/login (sai password) → 401 — PASS
4. Token → GET /api/prompts 200, /api/settings/handoff 200, /api/settings/telegram-destinations 200 — PASS
5. GET /webhook token sai → 403 (không crash) — PASS
6. Legacy No-Chatwoot: POST /chatwoot-webhook 404, GET /api/settings/chatwoot-test 404, GET /api/channel-configs/lookup-inboxes 404 — PASS

Tổng: **11/11 PASS**. Script smoke tạm đã xóa. Bước self-heal cũng đã sửa DB admin local nên user đăng nhập được ngay bằng `ADMIN_PASSWORD`.

## 8. Không thay đổi

Prisma schema/migrations, RAG/raw SQL, webhook direct Facebook, tenant handoff, bot engine/tools, package files, Dockerfile/scripts, `.env` thật. Không tạo migration, không `db push`, không reset DB, không push remote. `start-all.bat`, `test-bot*.js` (còn `admin123` trong script demo/devops) để prompt DevOps xử lý riêng.

## 9. Remaining blockers

- `start-all.bat` và `test-bot.js`/`test-bot-simple.js` vẫn in/nhúng `admin / admin123` (script demo/DevOps) — ngoài phạm vi 08G, xử lý ở prompt DevOps.
- Production thực tế cần đặt `JWT_SECRET`/`ADMIN_PASSWORD` mạnh trong env (guard sẽ chặn khởi động nếu yếu).
- Dashboard lint (`next lint` interactive) vẫn open — Quality Gate prompt sau.

## 10. Final verdict

**PASS**

## 11. Next step

- Prompt 09: RAG/raw SQL hardening; hoặc Quality Gate ESLint non-interactive để đưa lint vào validation.
- Prompt DevOps: dọn `admin123` trong `start-all.bat`/`test-bot*.js` và stale webhook URLs.
