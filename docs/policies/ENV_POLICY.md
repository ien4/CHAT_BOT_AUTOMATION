# ENV POLICY - BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-09
Phạm vi: quy tắc cấu hình môi trường cho backend Express, dashboard Next.js, Docker/local script và các prompt refactor tiếp theo.

## 1. Nguyên tắc bắt buộc

- Không commit `.env`, `.env.*` thật, token, API key, webhook secret, database password hoặc URL có credential.
- Chỉ được commit file mẫu như `.env.example`.
- Không đưa secret vào dashboard `NEXT_PUBLIC_*` vì các biến này được bundle vào trình duyệt.
- Production không được dùng `localhost`, `127.0.0.1`, `host.docker.internal`, ngrok/cloudflared tạm thời hoặc placeholder `your-*`.
- Không in giá trị secret vào report/log. Khi cần ghi nhận, chỉ ghi tên biến và trạng thái thiếu/placeholder.
- Không chạy `prisma migrate`, `prisma db push`, `db push --accept-data-loss`, `docker compose up` hoặc `start-all.bat` khi chưa có prompt riêng và backup rõ ràng.

## 2. Backend env

File mẫu: `backend/.env.example`.

| Nhóm | Biến | Chính sách |
|---|---|---|
| Server | `PORT`, `NODE_ENV`, `APP_BASE_URL` | `APP_BASE_URL` phải là HTTPS public URL trong production. Local fallback chỉ được dùng khi không phải production. |
| Link dashboard | `DASHBOARD_URL`, `FRONTEND_URL` | Dùng cho link trong Telegram notification. Production phải dùng URL public. |
| Database | `DATABASE_URL`, `POSTGRES_PASSWORD` | Là secret. Không commit giá trị thật. Không dùng placeholder cho production. |
| Encryption/auth | `ENCRYPTION_KEY`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | `ENCRYPTION_KEY` cần 64 hex chars. `ADMIN_PASSWORD` production phải đặt mạnh, không dùng fallback. |
| Facebook | `FB_PAGE_ACCESS_TOKEN`, `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID` | Secret hoặc định danh nhạy cảm. Không in vào report. |
| Webhook rate limit | `MESSAGE_RATE_WINDOW_MS`, `MESSAGE_RATE_MAX`, `MESSAGE_BURST_WINDOW_MS`, `MESSAGE_BURST_MAX`, `MESSAGE_RATE_BLOCK_MS`, `MESSAGE_RATE_WARNING_COOLDOWN_MS` | Không phải secret. Có thể commit default trong `.env.example`. |
| LLM | `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `CLAUDE_API_KEY` | Secret. Chỉ cấu hình provider thật ở môi trường chạy. |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MANAGER_CHAT_ID`, `TELEGRAM_STATUS_GROUP_ID` | Token/chat id không đưa vào dashboard public env. |

Biến `CHATWOOT_*` là legacy/deprecated cho kiến trúc Facebook-through-Chatwoot sau Prompt 08A-08C và không còn thuộc target Facebook architecture. Không khôi phục `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_TEAM_ID`, `CHATWOOT_WEBHOOK_SECRET` để đưa Facebook qua Chatwoot hoặc để bật lại `/chatwoot-webhook*`. Nếu môi trường thật còn các biến này để rollback lịch sử, không commit và không dùng làm target Facebook mới.

## 2A. Website Chatwoot future env policy

Prompt 23A chấp nhận ADR ở mức kiến trúc cho **Website Chatwoot optional/planned channel**, nhưng chưa thêm env thật hoặc env example mới.

Nếu triển khai Website Chatwoot ở 23B+ thì phải phân biệt rõ:

| Nhóm | Chính sách |
|---|---|
| Facebook env | Vẫn dùng cho direct Meta webhook `GET/POST /webhook`; không đưa qua Chatwoot. |
| Website chat env | Chỉ phục vụ Website live-chat channel, endpoint mới và scope website-only. |
| Deprecated legacy Chatwoot env | Không dùng lại nguyên xi nếu gây nhầm với kiến trúc Facebook-through-Chatwoot cũ. |

Tên biến dự kiến nếu được duyệt ở prompt sau:

- `WEBSITE_CHAT_PROVIDER`
- `WEBSITE_CHAT_WEBHOOK_SECRET`
- `WEBSITE_CHAT_BASE_URL`
- `WEBSITE_CHAT_ACCOUNT_ID`
- `WEBSITE_CHAT_INBOX_ID`
- `WEBSITE_CHAT_API_TOKEN`

Quy tắc bắt buộc:

- Không commit giá trị thật.
- Không in token/secret/base URL nhạy cảm vào logs/report.
- Không đưa token/secret vào `NEXT_PUBLIC_*`.
- Không dùng biến Website Chatwoot để thay thế `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN` hoặc `FB_APP_SECRET`.
- Nếu thêm env example sau này, phải ghi chú rõ đây là **Website chat only**, không phải Facebook callback.

## 3. Dashboard env

File mẫu: `dashboard/.env.example`.

| Biến | Chính sách |
|---|---|
| `NEXT_PUBLIC_API_URL` | Public URL tới backend API. Local fallback hiện là `http://localhost:3001/api` trong `dashboard/src/lib/config/env.ts`. Production phải cấu hình URL public HTTPS. |

Không thêm `NEXT_PUBLIC_CHATWOOT_URL` hoặc public env nào liên quan Chatwoot. Dashboard public env không được chứa secret; mọi biến `NEXT_PUBLIC_*` đều được bundle vào browser và phải coi là dữ liệu công khai.

Mọi biến bắt đầu bằng `NEXT_PUBLIC_` phải được coi là dữ liệu công khai.

## 4. Fallback local

Fallback local chỉ được phép nằm trong helper config tập trung:

- Backend: `backend/src/infrastructure/services/config.js`.
- Dashboard: `dashboard/src/lib/config/env.ts`.

Không thêm fallback localhost mới rải trực tiếp trong page/component/route handler. Nếu cần URL mới, thêm vào helper config trước rồi import sử dụng.

## 5. Kiểm tra trước deploy

Trước production deploy cần kiểm tra:

- `.env` thật tồn tại trên server/CI nhưng không được Git track.
- Không có biến production nào còn `localhost`, `127.0.0.1`, `host.docker.internal`, `your-*`, `placeholder`, `changeme`, `admin123`.
- `APP_BASE_URL` trỏ đúng domain HTTPS dùng cho Facebook webhook.
- `NEXT_PUBLIC_API_URL` trỏ đúng backend API public.
- `ENCRYPTION_KEY`, `JWT_SECRET`, `ADMIN_PASSWORD`, token Facebook, token Telegram đều đã được đặt bằng giá trị thật.
- Không có `CHATWOOT_*` hoặc `NEXT_PUBLIC_CHATWOOT_URL` trong cấu hình target mới.
- Không dùng `start-all.bat` hoặc `prisma db push --accept-data-loss` cho dữ liệu thật.

## 6. Validation an toàn

Các lệnh an toàn đã dùng trong Prompt 04:

```powershell
node --check src/index.js
node --check src/db.js
node --check src/infrastructure/services/config.js
node --check src/infrastructure/persistence/prisma/client.js
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/db'; npx prisma validate
npx --no-install tsc --noEmit
npm run --if-present build
```

Các lệnh trên không chạy migration, không push schema và không khởi động Docker.

## 7. Việc còn lại cho prompt sau

- Backend vẫn còn fallback localhost trong một số file runtime cũ như `backend/src/api/dashboard.js` và log startup của `backend/src/index.js`. Prompt 04 chưa thay vì cần tránh đổi behavior/webhook URL.
- `start-all.bat`, `backend/Dockerfile`, `webhook-urls-current.txt` còn rủi ro local/deploy và cần prompt DevOps riêng.
- Prompt 05 nên ưu tiên tách backend API route/controller nhỏ từ `backend/src/api/dashboard.js`, giữ nguyên public route và thêm validation sau từng nhóm.
