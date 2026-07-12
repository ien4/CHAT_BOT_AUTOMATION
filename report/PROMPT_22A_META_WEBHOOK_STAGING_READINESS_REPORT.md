# PROMPT 22A - META WEBHOOK STAGING READINESS REPORT

Ngày thực hiện: 2026-07-12  
Trạng thái: **PASS WITH WARNINGS**

## 1. Mục tiêu

Audit repo/docs/source để chuẩn bị public HTTPS staging cho Meta Developer Webhook direct `https://<domain>/webhook`. Prompt này không refactor runtime, không đổi behavior, không sửa schema/migration/package/dashboard, không gọi Meta/Facebook/Telegram/Gemini/Jina/LLM thật, không đọc/in env thật và không production rollout.

## 2. Preflight git + secret safety

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không phải main/master |
| HEAD nền | `3b20de3 Clarify current docs and legacy status` tồn tại |
| Remote | Không có remote output |
| Working tree trước patch | Sạch, chỉ ignored `.claude/`, `backend/.env`, `node_modules/`, backups, `dashboard/.env.local`, `.next`, `tmp-runtime/` |
| Ignore env thật | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked env scan | Lệnh prompt match `backend/.env.example` do pattern rộng; không có `.env`/`.env.local` thật tracked/staged |

Không mở/in `.env`, `.env.local`, token hoặc secret thật.

## 3. Context đã đọc/đối chiếu

- `docs/CURRENT_STATUS_INDEX.md`
- `docs/HISTORICAL_DOCS_INDEX.md`
- `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/DEPLOYMENT_POLICY.md`
- `docs/PRODUCTION_ROLLOUT_CHECKLIST.md`
- `docs/ENV_POLICY.md`
- `docs/QUALITY_GATE.md`
- `report/PROMPT_21D_DOCS_LEGACY_CLEANUP_REPORT.md`
- `report/PROMPT_21R_LOCAL_RUNTIME_WEBHOOK_SMOKE_REPORT.md`
- `report/PROMPT_21S_PROJECT_GOALS_FACEBOOK_WEBHOOK_STATUS_REPORT.md`
- `backend/.env.example`
- `dashboard/.env.example`
- `backend/src/index.js`
- `backend/src/webhook/handler.js`
- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`

## 4. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

Ghi chú: Prisma/dotenv có thể báo đã load `.env`, nhưng prompt không mở/in giá trị env thật.

## 5. Source webhook readiness audit

| Hạng mục | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| `GET /webhook` mount | PASS | `backend/src/index.js` có `app.get('/webhook', webhookHandler.verifyWebhook)` | Đây là verify callback Meta. |
| `POST /webhook` mount | PASS | `backend/src/index.js` có `app.post('/webhook', webhookHandler.handleMessage)` | Đây là event receiver Meta. |
| `/api/settings/webhook` không phải callback Meta | PASS | Route settings mount dưới `/api/settings`; `settings.routes.js` dùng `router.get('/webhook', authMiddleware, getWebhookSettings)` | Chỉ là dashboard config/read có auth. |
| `/chatwoot-webhook*` không phải target mới | PASS | Source `backend/src/index.js` không mount route này; local smoke trả 404 | No-Chatwoot target giữ đúng. |
| Verify params | PASS | `handler.js` đọc `hub.mode`, `hub.verify_token`, `hub.challenge` | Token đúng trả challenge. |
| Wrong/missing verify token | PASS | Code trả `sendStatus(403)`; smoke local `GET /webhook` thiếu params trả 403 | Không thử token thật. |
| POST object page | PASS | `handler.js` kiểm `body.object !== 'page'` thì 404, `page` thì xử lý entry/messaging | Không gửi POST event thật. |
| Secret/token log trong verify | PASS | Verify handler chỉ log success/fail, không log token/challenge | Không thấy log secret verify token. |
| PII log khi POST event | WARNING | `handler.js` hiện log sender id và message text trong xử lý message | Cần redaction/policy trước POST event thật trên staging. |
| Env example Meta | PASS | `backend/.env.example` có `APP_BASE_URL`, `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID` | Chỉ là tên biến/example, không phải secret thật. |
| Settings secret masking | PASS | `settings.controller.js` trả `***configured***` hoặc `null` cho token/secret | Smoke xác nhận safe shape. |

## 6. Local runtime readiness recheck

| Check | Kết quả | Ghi chú |
|---|---|---|
| `docker version` | WARNING | Docker Desktop API trả 500/time-out; không chạy `docker compose up`. |
| `docker ps --filter name=bbotech-pgvector-local` | WARNING | Docker API trả 500/time-out. |
| `Test-NetConnection localhost -Port 5433` | PASS | Cổng DB local listen. |
| `Test-NetConnection localhost -Port 3001` | PASS | Backend đang listen. |
| Backend process | USED_EXISTING | Không start/kill process không do prompt tạo. |

Smoke local:

| Endpoint | Kỳ vọng | Kết quả |
|---|---|---|
| `GET /health` | 200 | PASS |
| `GET /webhook` thiếu verify params | 403 | PASS |
| `POST /chatwoot-webhook` body `{}` | 404 | PASS |
| `POST /api/auth/login` admin tạm | 200 + token exists | PASS, không in token |
| `GET /api/settings/webhook` | 200, secret mask/null | PASS |
| `GET /api/prompts` | 200 | PASS |
| `GET /api/channel-configs` | 200 | PASS |
| `GET /api/quick-reply-menus` | 200 | PASS |
| `GET /api/campaigns` platform token | 200 hoặc expected behavior cũ | PASS, 200 |
| `GET /api/analytics?days=7` optional | 200 | PASS |
| Cleanup admin tạm | leftover 0 | PASS, deleted 1 |

## 7. Staging input discovery

| Staging prerequisite | Status | Evidence | Missing action |
|---|---|---|---|
| Public HTTPS domain/subdomain trỏ tới backend | MISSING | Không có `STAGING_BASE_URL`; docs chỉ có placeholder `https://your-domain.com` | Chuẩn bị domain/tunnel HTTPS ổn định. |
| Reverse proxy/tunnel ổn định chuyển `GET/POST /webhook` về backend | MISSING | Chưa có public smoke | Cấu hình proxy/tunnel và giữ nguyên query string. |
| `APP_BASE_URL` đúng public URL | EXAMPLE_ONLY | `backend/.env.example` có `APP_BASE_URL=https://your-domain.com` | Set staging env thật ngoài Git. |
| `FB_VERIFY_TOKEN` set trên staging | ENV_REQUIRED | Có tên biến trong `backend/.env.example` | Set secret thật, không log. |
| `FB_PAGE_ACCESS_TOKEN` set trên staging | ENV_REQUIRED | Có tên biến trong `backend/.env.example` | Set secret thật, không log. |
| `FB_APP_SECRET` set trên staging | ENV_REQUIRED | Có tên biến trong `backend/.env.example` | Set secret thật, không log. |
| `FB_PAGE_ID` set nếu code cần | ENV_REQUIRED | Có tên biến trong `backend/.env.example` | Set đúng page id staging. |
| Health endpoint public | NOT_RUN | Không có public URL | Chạy khi có `STAGING_BASE_URL`. |
| Wrong-token/missing-token webhook public trả 403 | NOT_RUN | Không có public URL | Chạy public smoke không dùng token thật. |
| Correct-token challenge public trả challenge | MANUAL_ONLY | Cần secret thật nên Codex không tự chạy | Verify qua Meta Developer/người vận hành. |
| Meta POST test event thật | PENDING | Prompt này không gọi Meta/Facebook | Chạy sau verify challenge. |
| Log không in secret/token/PII quá mức | NEEDS_REVIEW | Verify không log token; POST handler log sender/message text | Cần hardening/policy log trước event thật. |
| Rollback/staging recovery plan | PARTIAL | Có production rollback checklist; chưa có staging-specific runbook | Viết runbook staging proxy/env/app. |

## 8. Optional public HTTPS smoke

Kết quả: **NOT RUN - STAGING_BASE_URL not provided**.

Không tự đoán URL từ docs stale, không dùng `webhook-urls-current.txt`, không gửi correct `FB_VERIFY_TOKEN`, không gửi POST event Meta thật và không gọi Graph API.

## 9. Docs changed

- `docs/META_WEBHOOK_STAGING_READINESS.md` (mới)
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `docs/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/PROMPT_22A_META_WEBHOOK_STAGING_READINESS_REPORT.md` (mới)

## 10. Không thay đổi

- Không sửa `backend/src/**`.
- Không sửa `dashboard/src/**`.
- Không sửa Prisma schema/migrations.
- Không sửa package/package-lock.
- Không sửa Dockerfile/start scripts/docker-compose.
- Không sửa `.env`, `.env.local`, `.next`, backup, temp/log.
- Không gọi Meta/Facebook Graph API thật.
- Không gọi Telegram/Gemini/Jina/LLM thật.
- Không production rollout.
- Không push remote.

## 11. Điểm cần tu sửa

1. Cần public HTTPS staging URL thật, sau đó chạy public smoke an toàn với `STAGING_BASE_URL`.
2. Cần xác nhận reverse proxy/tunnel forward nguyên query string `hub.mode`, `hub.verify_token`, `hub.challenge`.
3. Cần log hardening hoặc policy staging rõ ràng trước khi nhận POST event thật vì handler hiện log sender id và message text.
4. Cần staging rollback runbook riêng cho proxy/env/app.
5. Docker Desktop API trên máy hiện trả 500/time-out; dù cổng DB/backend listen và smoke PASS, nên sửa Docker Desktop trước các prompt cần Docker API.

## 12. Gợi ý tiếp theo

1. Chuẩn bị domain/tunnel HTTPS và cung cấp biến shell `STAGING_BASE_URL=https://<domain>`.
2. Chạy prompt public smoke chỉ với `/health`, `/webhook` thiếu params 403 và `/chatwoot-webhook` 404.
3. Sau public smoke PASS, người vận hành verify trong Meta Developer bằng callback `https://<domain>/webhook` và verify token thật.
4. Sau Meta verify + POST event thật mới mở prompt production rollout.

## 13. Final verdict

**PASS WITH WARNINGS**

Source route và local runtime baseline đủ điều kiện chuẩn bị staging, docs/checklist đã tạo, nhưng chưa có public HTTPS URL thật nên chưa thể claim public staging ready, Meta verified, Meta connected hoặc production ready.
