# DEPLOYMENT POLICY — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-10 (Prompt 10B)

Tài liệu chính sách deploy an toàn cho public server/domain. Bắt buộc đọc trước khi rollout.

## 1. Nguyên tắc cốt lõi

- **KHÔNG** `prisma db push` trên bất kỳ DB nào có dữ liệu thật.
- **KHÔNG** `prisma db push --accept-data-loss` ở bất kỳ đâu (dev lẫn prod).
- **KHÔNG** auto-migrate trong container runtime startup (nhiều replica có thể migrate đồng thời).
- Mọi thay đổi schema production đi qua **`prisma migrate deploy`** trong một **release/predeploy step riêng**, chạy đúng **một lần**.
- Luôn **backup DB trước migration** production.
- `NODE_ENV=production` bắt buộc ở prod; auth guard (`assertProductionAuthEnv`) fail-fast khi `JWT_SECRET`/`ADMIN_PASSWORD` yếu/thiếu.

## 2. Local vs Production

| Khía cạnh | Local (dev) | Production |
|---|---|---|
| Bootstrap | `start-all.bat` (LOCAL ONLY) | KHÔNG dùng `start-all.bat` |
| Schema sync | `npx prisma migrate deploy` (đã bỏ `db push`) | `prisma migrate deploy` trong release step riêng |
| Migration lúc startup | Không | Không (đã tách khỏi `backend/Dockerfile` CMD) |
| Seed | thủ công, không phá dữ liệu | không seed tự động vào prod |
| Tunnel | cloudflared/ngrok tạm | domain/reverse proxy thật |

## 3. Migration workflow (production)

Container runtime chỉ chạy app (`CMD ["node", "src/index.js"]`). Migration chạy tách biệt:

```
# release/predeploy step (chạy 1 lần, sau khi đã backup)
docker compose run --rm backend npx prisma migrate deploy
```

- Không bao giờ đưa `migrate deploy` vào CMD của container app.
- Không `migrate dev` trên production (yêu cầu shadow DB, có thể sinh drift).

## 4. Webhook / Domain (No-Chatwoot direct)

- Kiến trúc đích là **No-Chatwoot**: Facebook gửi **trực tiếp** về backend.
- Endpoint webhook thật:
  - **`GET /webhook`** — Facebook verify (hub.challenge + verify token).
  - **`POST /webhook`** — nhận message events.
- **KHÔNG** phải `/api/settings/webhook` (đó chỉ là route cấu hình dashboard).
- **KHÔNG** còn dùng `/chatwoot-webhook*` (đã gỡ ở Prompt 08B).
- `webhook-urls-current.txt` là **log local/stale**, không dùng làm nguồn production.

## 5. Env production bắt buộc

- `DATABASE_URL` (không log đầy đủ, không commit).
- `JWT_SECRET` mạnh (guard fail-fast nếu yếu).
- `ADMIN_PASSWORD` mạnh (không `admin123`).
- Provider keys (Gemini/Jina/…): chỉ đặt qua secret manager/env prod, không commit.
- Không commit `.env` / `.env.local` (đã gitignored).

## 6. Rollback

- **DB**: restore từ backup `pg_dump -Fc` gần nhất bằng `pg_restore` (xem PRODUCTION_ROLLOUT_CHECKLIST).
- **App**: redeploy image/tag trước đó.
- Migration là forward-only; rollback DB = restore backup, không tự viết down-migration ad-hoc trên prod.

## 7. Tham chiếu

- Checklist thao tác: `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`.
- Env policy: `docs/policies/ENV_POLICY.md`.
- Local run: `docs/runbooks/LOCAL_RUN_GUIDE.md`.
