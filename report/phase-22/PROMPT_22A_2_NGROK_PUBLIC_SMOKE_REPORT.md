# PROMPT 22A-2 — NGROK PUBLIC SMOKE REPORT

Ngày thực hiện: 2026-07-13
Trạng thái: **PASS WITH WARNINGS — PUBLIC_SMOKE_BLOCKED_STAGING_BASE_URL_MISSING**

## 1. Mục tiêu

Khôi phục local DB/backend runtime an toàn, chạy local smoke cho direct webhook/dashboard read routes, sau đó chạy public HTTPS smoke qua Ngrok nếu có `STAGING_BASE_URL`. Không sửa source, không gọi Meta/Facebook API thật, không gửi POST event thật từ Meta, không dùng verify token thật và không production rollout.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không switch branch |
| Commit nền | `51699e7 Redact webhook event logs for staging` tồn tại |
| Working tree trước patch | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked env scan | Chỉ match `backend/.env.example`; env thật không tracked/staged |

Không mở/in env thật, token hoặc secret.

## 3. Context files read

- `report/phase-22/PROMPT_22A_1_WEBHOOK_LOG_REDACTION_REPORT.md`
- `docs/runbooks/META_WEBHOOK_STAGING_RUNBOOK.md`
- `docs/status/META_WEBHOOK_STAGING_READINESS.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/policies/QUALITY_GATE.md`
- `backend/.env.example`

## 4. Static validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

## 5. Local runtime restore

| Check | Kết quả |
|---|---|
| `docker version` | PASS, Docker client/server phản hồi |
| `docker ps -a --filter name=bbotech-pgvector-local` | PASS, container tồn tại và đang Up |
| DB port `5433` | PASS, `Test-NetConnection localhost:5433` true |
| Backend port `3001` | PASS, `Test-NetConnection localhost:3001` true |
| DB restore action | Không cần `docker start`; container đã Up |
| Backend restore action | Không start backend mới; dùng process đang chạy |
| `npx prisma migrate deploy` | PASS, 12 migrations, no pending migrations |

Không chạy `docker compose up`, không chạy `start-all.bat`, không tạo DB/container mới.

## 6. Local smoke

Smoke dùng admin tạm trong DB local, token giữ trong memory và không in token. Cleanup admin tạm xong.

| Endpoint | Kỳ vọng | Kết quả |
|---|---|---|
| `GET http://localhost:3001/health` | 200 | PASS |
| `GET http://localhost:3001/webhook` thiếu params | 403 | PASS |
| `POST http://localhost:3001/chatwoot-webhook` body `{}` | 404 | PASS |
| `POST /api/auth/login` admin tạm | 200 + token exists | PASS |
| `GET /api/settings/webhook` | 200, secret mask/null | PASS |
| `GET /api/prompts` | 200 | PASS |
| `GET /api/channel-configs` optional | 200 | PASS |
| `GET /api/quick-reply-menus` optional | 200 | PASS |
| `GET /api/campaigns` optional | 200 | PASS |
| Cleanup admin tạm | deleted 1 | PASS |

Không POST `/webhook` object `page`, không dùng verify token thật và không gọi external.

## 7. STAGING_BASE_URL validation

Kết quả: **BLOCKED_STAGING_BASE_URL_MISSING**.

Biến shell `STAGING_BASE_URL` không tồn tại trong process hiện tại, nên không có public base URL để smoke qua Ngrok.

## 8. Public HTTPS smoke via Ngrok

Kết quả: **NOT RUN — STAGING_BASE_URL missing**.

Không chạy:

- `GET $STAGING_BASE_URL/health`
- `GET $STAGING_BASE_URL/webhook`
- `POST $STAGING_BASE_URL/chatwoot-webhook`

Do không có base URL, chưa thể phân biệt ngrok offline/backend down/path rewrite/wrong base URL. Không gửi verify token thật, không gửi correct challenge, không POST object `page`, không gọi Meta/Facebook API.

## 9. Docs changed

- `docs/status/META_WEBHOOK_STAGING_READINESS.md`
- `docs/runbooks/META_WEBHOOK_STAGING_RUNBOOK.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `report/phase-22/PROMPT_22A_2_NGROK_PUBLIC_SMOKE_REPORT.md`

## 10. Không thay đổi

- Không sửa `backend/src/**`.
- Không sửa `dashboard/src/**`.
- Không sửa Prisma schema/migrations.
- Không sửa package/package-lock.
- Không sửa Dockerfile/start scripts/docker-compose.
- Không sửa `.env`, `.env.local`, `.next`, backup, temp/log.
- Không gọi Meta/Facebook API thật.
- Không gửi Meta POST event thật.
- Không dùng verify token thật.
- Không production rollout.

## 11. Remaining warnings

- `STAGING_BASE_URL` chưa được cung cấp nên public Ngrok smoke chưa chạy.
- Public HTTPS readiness chưa thể nâng lên `PUBLIC_SMOKE_PASS_NO_SECRET`.
- Meta Developer verification vẫn PENDING.
- Meta POST event thật vẫn PENDING.
- Production rollout vẫn PENDING.

## 12. Final verdict

**PASS WITH WARNINGS**

Local DB/backend runtime đã restored/ready và local smoke PASS. Public Ngrok smoke bị block vì thiếu `STAGING_BASE_URL`, nên không claim public staging ready, Meta verified, Meta connected hoặc production ready.

## 13. Next step

1. Người vận hành chạy `ngrok http 3001`.
2. Set biến shell: `$env:STAGING_BASE_URL="https://xxxx.ngrok-free.app"` không có trailing `/webhook`.
3. Chạy lại public smoke không dùng secret.
4. Nếu public smoke PASS, callback Meta Developer đúng là `$env:STAGING_BASE_URL/webhook`.
