# LOCAL RUN GUIDE — BBOTECH BOT AUTOMATION

Ngày lập: 2026-07-08 (Prompt 05R)
Phạm vi: hướng dẫn chạy local an toàn + điều kiện cần cho runtime smoke test. Không in secret, không chạy migration/db push/Docker/start-all.

## 1. Trạng thái hiện tại

| Hạng mục | Kết quả (kiểm tra read-only Prompt 05R) |
|---|---|
| Node / npm | `node v22.18.0`, `npm 11.6.0` — đã có |
| Backend dependencies | `backend/node_modules` **EXISTS** — đã cài |
| Dashboard dependencies | `dashboard/node_modules` **EXISTS** — đã cài |
| `backend/.env` | **MISSING** — chưa có (chỉ kiểm tra tồn tại, không mở nội dung) |
| `dashboard/.env` / `.env.local` | **MISSING** — chưa có |
| `backend/.env.example` | Có |
| `dashboard/.env.example` | Có |
| DB local/test | **Chưa xác nhận** — không có `.env` nên không có `DATABASE_URL`; chưa xác nhận PostgreSQL local/test đang chạy |
| Dashboard build | PASS (`next build` trong Prompt 05R) |
| Backend static validation | PASS (`node --check` tất cả file trọng yếu + `prisma validate` dummy) |

**Kết luận readiness:** Chưa đủ điều kiện chạy runtime smoke test vì thiếu `.env` local/test và chưa có DB local/test được xác nhận. Xem mục 3.

## 2. Cách chạy local an toàn — khuyến nghị

- **KHÔNG dùng `start-all.bat`.** Script này chạy `npm install`, `npx prisma db push --accept-data-loss` (có thể mất dữ liệu), khởi động cloudflared/ngrok, tham chiếu thư mục `chatwoot/` (không tồn tại ở root) và có hard-code path `C:\Users\Admin\cloudflared.exe`.
- **KHÔNG dùng `docker compose up`** trong prompt này (compose nạp `./backend/.env` và backend container tự chạy `prisma migrate deploy`).
- Chạy thủ công từng service bằng script npm thật (mục 5) sau khi đã chuẩn bị env local/test (mục 3).
- Chỉ trỏ `DATABASE_URL` tới **database local/test**, tuyệt đối không phải production.

## 3. Cần người dùng chuẩn bị thủ công

- [ ] Tạo/copy `backend/.env` từ `backend/.env.example`
- [ ] Tạo/copy `dashboard/.env.local` hoặc `.env` từ `dashboard/.env.example`
- [ ] Có database local/test an toàn, **không phải production**
- [ ] Có `DATABASE_URL` local/test trong `backend/.env`
- [ ] Có `JWT_SECRET` local/test
- [ ] Có `ENCRYPTION_KEY` local/test (64 hex chars) nếu flow cần decrypt tenant credential
- [ ] Đặt `ADMIN_USERNAME` / `ADMIN_PASSWORD` local/test (không dùng `admin123` production)
- [ ] KHÔNG dùng token production (Facebook/Chatwoot/Telegram/LLM) cho môi trường test
- [ ] KHÔNG chạy migration/db push khi chưa xác nhận DB là local/test

Lưu ý DB: 3 route smoke test cần trạng thái sau —
- `GET /api/settings/webhook`: chỉ cần server chạy + auth token hợp lệ (đọc env FB_*, **không cần DB**).
- `GET /api/settings/telegram-destinations`: cần DB (`telegramDestination.findMany`).
- `GET /api/prompts`: cần DB (`promptTemplate.findMany`) + tenant scope.

Vì `backend/src/index.js` có seed default admin/provider khi start, việc start backend sẽ ghi vào DB đang trỏ tới. Chỉ chấp nhận điều này trên **DB local/test**.

## 4. Lệnh validation an toàn

Backend:
- `cd backend`
- `node --check src/index.js`
- `node --check src/api/dashboard.js`
- `npx prisma validate` — với `DATABASE_URL` local/test hoặc dummy (`postgresql://user:pass@localhost:5432/db`) nếu chỉ validate schema

Dashboard:
- `cd dashboard`
- `npx --no-install tsc --noEmit`
- `npm run build`

Các lệnh trên **không** migrate, **không** db push, **không** connect DB production.

## 5. Lệnh chạy local đề xuất

Chỉ chạy sau khi hoàn tất checklist mục 3. Đây là lệnh, không tự chạy trong prompt này khi chưa đủ điều kiện.

Backend (port dự kiến **3001**, theo `backend/.env.example` `PORT=3001`):
- `cd backend`
- `npm run dev` (tương đương `node src/index.js`)

Dashboard (port **3002**, theo `dashboard/package.json` `next dev -p 3002`):
- `cd dashboard`
- `npm run dev`

## 6. Smoke test route đã tách

Base URL local dự kiến: `http://localhost:3001`. Public path mount dưới `/api`:

- `GET /api/settings/webhook`
- `GET /api/settings/telegram-destinations`
- `GET /api/prompts`

Cả 3 route dùng `authMiddleware` → cần **auth token hợp lệ** (JWT) ở header `Authorization`.
- Lấy token qua login endpoint local với credential local/test (không hard-code token vào docs, không in token đầy đủ vào report/log).
- Không bypass auth.

Kỳ vọng runtime (để so sánh khi chạy được):
- Không có token → trả lỗi auth (ví dụ 401), không crash.
- Có token hợp lệ:
  - `/api/settings/webhook` → 200, JSON `{ verifyToken, pageAccessToken, appSecret, webhookUrl }` (giá trị đã mask `***configured***` hoặc `null`).
  - `/api/settings/telegram-destinations` → 200, JSON `{ destinations: [...], envFallback: {...} }`.
  - `/api/prompts` → 200, JSON array các prompt template.

## 7. Những lệnh KHÔNG được chạy bừa

- `start-all.bat`
- `docker compose up`
- `prisma db push`
- `prisma db push --accept-data-loss`
- `prisma migrate`
- Script test ghi dữ liệu thật (`test-bot.js`, `test-bot-simple.js`) trên DB production
