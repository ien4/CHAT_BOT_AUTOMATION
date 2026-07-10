# PRODUCTION ROLLOUT CHECKLIST — BBOTECH BOT AUTOMATION

Ngày cập nhật: 2026-07-10 (Prompt 10B)

Checklist thao tác từng bước khi rollout production. Đọc kèm `docs/DEPLOYMENT_POLICY.md`.

## A. Pre-deploy (chuẩn bị)

- [ ] Xác nhận `NODE_ENV=production` ở môi trường đích.
- [ ] Env bắt buộc đã set qua secret manager: `DATABASE_URL`, `JWT_SECRET` (mạnh), `ADMIN_PASSWORD` (mạnh, không `admin123`), provider keys.
- [ ] Không có `.env`/`.env.local` bị commit (đã gitignored).
- [ ] Đã review migration mới trong `backend/prisma/migrations/` (không có `db push`, không drop ngoài ý muốn).

## B. Backup DB (bắt buộc trước migration)

- [ ] `pg_dump -Fc` DB production → file `.dump` an toàn (không commit, `backups/` gitignored):
  ```
  pg_dump -U <user> -d <db> -Fc > backups/prod-before-<change>-<timestamp>.dump
  ```
- [ ] Verify backup: file tồn tại, size > 0, `pg_restore -l <file>` đọc được TOC.

## C. Migration (release step riêng, chạy 1 lần)

- [ ] KHÔNG `prisma db push`. KHÔNG `--accept-data-loss`.
- [ ] Chạy:
  ```
  docker compose run --rm backend npx prisma migrate deploy
  ```
- [ ] Xác nhận output "All migrations have been successfully applied".
- [ ] Không chạy migration trong container app startup (đã tách khỏi Dockerfile CMD).

## D. Deploy app

- [ ] Build & deploy image mới (backend `CMD ["node","src/index.js"]`, không tự migrate).
- [ ] Dashboard build production (`NEXT_PUBLIC_API_URL` trỏ domain thật).

## E. Health & smoke (sau deploy)

- [ ] `GET /health` → 200.
- [ ] Login platform admin → 200, token hợp lệ (không log token).
- [ ] `GET /api/prompts` (có token) → 200.
- [ ] `GET /api/settings/handoff` (có token) → 200.
- [ ] `GET /webhook` thiếu/sai verify token → 403.
- [ ] `POST /chatwoot-webhook` → 404 (đã gỡ Chatwoot).

## F. Webhook / Domain

- [ ] Facebook Meta Callback URL trỏ tới **`https://<domain>/webhook`** (direct, No-Chatwoot).
- [ ] Verify token khớp env.
- [ ] `GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` trả challenge đúng.
- [ ] KHÔNG dùng URL trong `webhook-urls-current.txt` (local/stale).

## G. Rollback (nếu lỗi)

- [ ] App: redeploy image/tag trước đó.
- [ ] DB: restore backup:
  ```
  pg_restore -U <user> -d <db> --clean --if-exists <backup.dump>
  ```
- [ ] Verify health + smoke lại mục E.

## H. Post-deploy

- [ ] Theo dõi log lỗi 15–30 phút đầu.
- [ ] Ghi lại migration đã apply + backup path (không commit backup).
