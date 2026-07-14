# PROMPT 21S — PROJECT GOALS & FACEBOOK WEBHOOK STATUS REPORT

Ngày thực hiện: 2026-07-12
Trạng thái: **PASS WITH WARNINGS**

## 1. Mục tiêu

Đồng bộ lại mục tiêu dự án và trạng thái sẵn sàng Facebook Developer Webhook sau các prompt Phase 19/21 gần đây. Prompt này là docs/status-sync + safe local verification only; không refactor source runtime, không đổi behavior, không sửa schema/migration/package, không gọi Facebook/Telegram/Gemini/Jina/LLM thật.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Không ở master/main | PASS |
| HEAD | `72f8a04 Consolidate another low-risk dashboard route` |
| Remote | Không có remote output |
| Working tree trước patch | Sạch, chỉ ignored `.claude/`, `backend/.env`, `node_modules/`, backups, `dashboard/.env.local`, `.next`, `tmp-runtime/` |
| Secret tracking | `git ls-files` chỉ match `backend/.env.example`; env thật không tracked |
| Ignore check | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |

Không mở/in `.env` hoặc `.env.local` thật. Prisma validate có dòng "Environment variables loaded from .env" nhưng không in giá trị secret.

## 3. Files/context read

Đã đọc/đối chiếu:

- `report/phase-21/PROMPT_21B_2_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`
- `report/phase-21/PROMPT_21B_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`
- `report/phase-21/PROMPT_21A_PROJECT_STRUCTURE_CONSOLIDATION_AUDIT_REPORT.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/policies/DEPLOYMENT_POLICY.md`
- `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md`
- `docs/policies/ENV_POLICY.md`
- `docs/architecture/ARCHITECTURE.md`
- `backend/.env.example`
- `dashboard/.env.example`
- `backend/src/index.js`
- `backend/src/webhook/handler.js`
- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`

## 4. Project goal summary

Kiến trúc mục tiêu hiện tại:

```text
Facebook Messenger / Meta Developer Webhook
  -> Backend Express custom: GET/POST /webhook
  -> Bot / AI / RAG / Handoff
  -> Dashboard Next.js nội bộ
  -> PostgreSQL / pgvector
```

Target là **No-Chatwoot**. `/api/settings/webhook` chỉ là dashboard config/read endpoint, không phải callback Meta/Facebook.

## 5. Previous goals vs current goals

| Nhóm mục tiêu | Mục tiêu trước đó | Trạng thái hiện tại | Bằng chứng | Còn thiếu |
|---|---|---|---|---|
| Product goal | Chatbot/automation nhận tin nhắn Facebook Messenger qua webhook | Vẫn đúng, được ghi rõ lại theo direct Facebook | `backend/src/webhook/handler.js`, docs Phase 17-21 | Meta callback/test event thật |
| Architecture goal | Giảm nợ Clean Architecture từng bước | Đang Started; backend route consolidation 21B/21B-2 đã PASS; không big-bang | Reports 21A/21B/21B-2 | `dashboard.js` còn lớn, feature/dashboard còn backlog |
| No-Chatwoot goal | Bỏ Chatwoot khỏi target | Runtime/backend/schema/dashboard đã Done theo Phase 17; docs/scripts stale còn backlog | Prompt 08B/08D/08F, `rg` active route | 21D cho stale docs/scripts |
| Security goal | Auth/tenant/raw SQL/env hardening | Auth/login hardened, tenant guards nhiều phase, raw SQL unsafe closed, env ignored | Phase 07-18 docs, git ignore checks | Production secret manager và rollout thật |
| Runtime goal | Local backend + DB smoke | Prior local smoke PASS ở nhiều prompt; Prompt 21S current smoke blocked vì Docker/DB/backend local không chạy | Reports 21B/21B-2; port checks 21S | Bật lại local DB/backend rồi smoke mới |
| DevOps/deploy goal | Dùng `migrate deploy`, không `db push --accept-data-loss` | Policy/docs Done; production rollout chưa chạy | `docs/policies/DEPLOYMENT_POLICY.md`, `docs/runbooks/PRODUCTION_ROLLOUT_CHECKLIST.md` | Backup + migrate deploy + prod smoke thật |
| Facebook webhook goal | Direct Meta `/webhook` | Source route DONE; staging/Meta/prod pending | `index.js`, `handler.js`, deploy docs | Public HTTPS + Meta verify + POST event thật |

## 6. Facebook webhook readiness audit

| Tầng readiness | Trạng thái | Bằng chứng | Được phép ghi gì | Không được ghi gì | Next action |
|---|---|---|---|---|---|
| Source route readiness | DONE | `backend/src/index.js` mount `GET /webhook`, `POST /webhook` | Source endpoint đúng là `/webhook` | Không claim Meta connected | Giữ endpoint khi refactor |
| Local runtime readiness | LOCAL_READY with warning | Reports trước smoke 403/404 PASS; current 21S không có backend local | Có prior local proof; current runtime cần chạy lại | Không ghi current smoke PASS | Bật Docker/DB/backend rồi smoke lại |
| Local DB/env readiness | LOCAL_READY historically, current blocked | `npm run quality` + Prisma validate PASS; DB 5433 không listen trong 21S | Static/prisma OK | Không claim DB đang chạy | Start local DB an toàn |
| Public HTTPS/staging readiness | STAGING_PENDING | Chưa có URL staging/public | Cần staging verification | Không claim staging connected | Trỏ `https://<domain>/webhook` |
| Meta Developer verify challenge readiness | META_PENDING | Chưa có callback/challenge thật | Source có verify handler | Không claim Meta verified | Verify qua Meta Developer |
| Meta POST event readiness | META_PENDING | Chưa có event thật | Source có POST handler | Không claim nhận event thật | Test event thật |
| Dashboard management readiness | LOCAL_READY | `GET /api/settings/webhook` có auth, trả mask/null + `webhookUrl` | Endpoint config/read sẵn | Không dùng làm callback Meta | Giữ docs cảnh báo |
| Production rollout readiness | PRODUCTION_PENDING | Checklist yêu cầu backup + migrate deploy + smoke prod, chưa chạy | Có rollout checklist | Không claim production ready | Chạy rollout thật |

Kết luận audit:

- Endpoint GET `/webhook`: `backend/src/index.js` -> `webhookHandler.verifyWebhook`; `handler.js` so sánh `hub.verify_token` với `process.env.FB_VERIFY_TOKEN` và trả `hub.challenge` khi đúng.
- Endpoint POST `/webhook`: `backend/src/index.js` -> `webhookHandler.handleMessage`; nhận `body.object === 'page'`, xử lý entry/messaging, page context, bot/handoff.
- `/chatwoot-webhook` không còn active runtime trong `backend/src`.
- `/api/settings/webhook`: nằm dưới settings routes/controller, có `authMiddleware`, trả `verifyToken`, `pageAccessToken`, `appSecret` ở dạng `***configured***`/`null` và `webhookUrl`.
- Env example có `APP_BASE_URL`, `FB_PAGE_ACCESS_TOKEN`, `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID`.
- Deploy docs đã yêu cầu production callback URL là `https://<domain>/webhook`.
- Không tìm thấy bằng chứng Meta Developer callback/challenge/test event thật trong docs/report hiện tại.

## 7. Local safe smoke

Baseline validation trước patch:

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `git diff --check/stat/name-status` trước patch | Sạch |

Safe runtime smoke trong 21S:

| Check | Kết quả |
|---|---|
| Docker container `bbotech-pgvector-local` | BLOCKED: Docker daemon/API không phản hồi |
| Port DB `5433` | Không listen |
| Backend port `3001` | Không listen |
| `GET http://localhost:3001/health` | Không kết nối được |
| `GET /webhook` thiếu/sai token | Không chạy lại trong 21S vì backend local không chạy |
| `POST /chatwoot-webhook` | Không chạy lại trong 21S vì backend local không chạy |
| `GET /api/settings/webhook` có token | Không chạy lại trong 21S vì backend/DB/login token không sẵn |

Không chạy `docker compose up`, không chạy `start-all.bat`, không chạy seed, không gọi external. Vì local DB/backend không sẵn, không start `npm run dev` để tránh startup trong trạng thái thiếu DB và để giữ đúng guardrail.

## 8. Docs changed

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `report/phase-21/PROMPT_21S_PROJECT_GOALS_FACEBOOK_WEBHOOK_STATUS_REPORT.md`

## 9. Không thay đổi

- Không sửa `backend/src/**`.
- Không sửa `dashboard/src/**`.
- Không sửa `backend/prisma/schema.prisma`.
- Không sửa `backend/prisma/migrations/**`.
- Không sửa package/package-lock.
- Không sửa Dockerfile, `docker-compose.yml`, `start-all.bat`.
- Không mở/in `.env`, `.env.local`, `.next`, backup, temp/log.
- Không gọi Facebook/Meta/Telegram/Gemini/Jina/LLM thật.
- Không làm Prompt 21B-3/21C/21D trong prompt này.

## 10. Remaining gaps

- Cần chạy lại local runtime smoke khi Docker Desktop/local DB/backend sẵn sàng.
- Cần public HTTPS staging URL trỏ đúng `/webhook`.
- Cần Meta Developer verify challenge thật.
- Cần Meta POST test event thật.
- Cần production backup + `prisma migrate deploy` + smoke prod thật trước khi claim production.
- Phase 21 vẫn Started; `api/dashboard.js` còn route debt, docs/scripts stale còn backlog.

## 11. Final verdict

**PASS WITH WARNINGS**

Docs/status đã được đồng bộ và validation static PASS. Warning nằm ở runtime local hiện tại: Docker daemon/DB/backend không chạy nên Prompt 21S không có local runtime smoke mới. Không fake Meta connected hoặc production ready.

## 12. Next step

Đề xuất:

1. **Prompt 21B-3** nếu mục tiêu tiếp theo là giảm nợ backend route read-only (`campaigns` list/detail hoặc `stats`).
2. **Prompt 21D** nếu muốn dọn stale docs/legacy trước khi đi sâu hơn.
3. **Prompt 21C** nếu quay lại dashboard `content-packages`, nhưng phải khóa rõ action migrate/external và không chạy mutation rủi ro.
