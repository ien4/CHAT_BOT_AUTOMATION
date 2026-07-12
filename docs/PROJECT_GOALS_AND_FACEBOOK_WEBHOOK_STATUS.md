# PROJECT GOALS AND FACEBOOK WEBHOOK STATUS

Ngày cập nhật: 2026-07-12
Nguồn: Prompt 21S docs/status-sync, audit code local, docs/report hiện có, validation an toàn cục bộ. Tài liệu này không phải bằng chứng production rollout và không phải bằng chứng Meta Developer đã kết nối thật.

## Cập nhật 22A-1 - Webhook log redaction + staging runbook

Ngày cập nhật: 2026-07-12

Prompt 22A-1 đã harden log trong direct webhook source:

- `backend/src/webhook/handler.js` không còn log message text, full sender id, full recipient id, postback payload hoặc outbound message preview.
- Log mới chỉ ghi metadata đã redact: masked id, count, boolean, length, event label và error status/code generic.
- `GET /webhook` verify behavior giữ nguyên; `POST /webhook` flow giữ nguyên; call vào bot/RAG/handoff giữ nguyên.
- Tạo `docs/META_WEBHOOK_STAGING_RUNBOOK.md`.
- Static validation PASS. Runtime smoke an toàn bị block vì local DB/backend hiện không listen.

Trạng thái sau 22A-1:

- Source log redaction: **SOURCE_HARDENED_PENDING_REAL_EVENT**.
- Public HTTPS readiness: **STAGING_URL_MISSING**.
- Meta Developer verification: **PENDING**.
- Meta POST event thật: **PENDING**.
- Production rollout: **PENDING**.

## Cập nhật 22A - Public HTTPS / Meta webhook staging readiness

Ngày cập nhật: 2026-07-12

Prompt 22A đã tạo `docs/META_WEBHOOK_STAGING_READINESS.md` và report staging readiness. Kết quả là **PASS WITH WARNINGS**:

- Source callback readiness: **DONE** cho `GET /webhook` và `POST /webhook`.
- Local runtime readiness: **PASS** theo smoke Prompt 22A trên backend 3001 hiện có.
- Public HTTPS readiness: **STAGING_URL_MISSING** vì chưa có `STAGING_BASE_URL` hoặc public URL thật.
- Meta Developer verification: **PENDING**.
- Meta POST event thật: **PENDING**.
- Production rollout: **PENDING**.

Callback URL đúng cần nhập trong Meta Developer vẫn là `https://<domain>/webhook`. Không dùng `/api/settings/webhook`, `/chatwoot-webhook*` hoặc `webhook-urls-current.txt` làm callback. Sau Prompt 22A-1, source webhook log đã được redact; vẫn cần quan sát log staging khi test event thật.

## Cập nhật 21D - Docs index

Ngày cập nhật: 2026-07-12

Đọc thêm `docs/CURRENT_STATUS_INDEX.md` trước khi đọc tài liệu cũ. File index này phân biệt source of truth hiện tại với historical reports/root docs stale.

Status vẫn giữ nguyên:

- Source/local readiness: **PASS** theo Prompt 21R và các smoke local an toàn.
- Public HTTPS/staging readiness: **PENDING**.
- Meta Developer verification: **PENDING**.
- Meta POST event thật: **PENDING**.
- Production rollout: **PENDING**, chưa backup + `prisma migrate deploy` + smoke production thật.

## Cập nhật 21R - Local runtime readiness restored

Ngày cập nhật: 2026-07-12

Prompt 21R đã chạy lại kiểm tra local runtime và smoke webhook an toàn:

- Docker daemon hoạt động, container `bbotech-pgvector-local` đang Up, port `5433` listen.
- Prisma migration status/deploy PASS, không có pending migration.
- Backend port `3001` có process sẵn và `/health` trả 200; prompt không start/kill backend.
- Smoke local PASS 9/9: `/health`, `/webhook` 403 khi thiếu verify params, `/chatwoot-webhook` 404, login admin tạm, `/api/settings/webhook`, `/api/prompts`, `/api/channel-configs`, `/api/quick-reply-menus`, optional analytics.
- Không gọi Facebook/Meta/Telegram/Gemini/Jina/LLM thật; không claim Meta connected/verified; không claim production ready.

Trạng thái cập nhật: **Local runtime readiness = PASS cho phạm vi local smoke an toàn**. Public HTTPS/staging, Meta Developer verification, Meta POST event thật và production rollout vẫn pending.

## 1. Mục tiêu sản phẩm

Hệ thống cần phục vụ mục tiêu chính: xây chatbot/automation để tiếp nhận tin nhắn Facebook Messenger qua Meta Developer Webhook, xử lý trong backend Express custom, và cho đội vận hành quản trị qua dashboard nội bộ.

| Nhóm mục tiêu | Mục tiêu trước đó | Trạng thái hiện tại | Bằng chứng | Còn thiếu |
|---|---|---|---|---|
| Product goal | Chatbot/automation nhận và xử lý hội thoại khách hàng | Giữ nguyên, làm rõ theo kiến trúc direct Facebook | `backend/src/webhook/handler.js`, dashboard pages, Phase 17-21 reports | Meta event thật, staging/public URL thật |
| Backend goal | Express backend xử lý message, bot/AI/RAG/handoff | Đang hoạt động theo mixed-module, giảm nợ dần qua Phase 21 | `backend/src/index.js`, `backend/src/api/dashboard.js`, `backend/src/bot`, `backend/src/rag` | Tiếp tục consolidation, không big-bang |
| Dashboard goal | Next.js dashboard quản trị cấu hình/nội dung/prompt/nhân sự/lịch hẹn/handoff | Phase 19 đã split analytics/prompts/staff/appointments; các page nặng còn lại vẫn planned | `dashboard/src/features/**`, report 19A-19D | Content-packages/settings/knowledge/tenants/handoff còn cần prompt riêng |
| Data goal | PostgreSQL/pgvector lưu data và knowledge | Local/staging readiness improved; raw SQL unsafe đã đóng | Phase 18/20 docs, Prisma validate PASS | Production backup/migrate/smoke thật |

## 2. Kiến trúc đích

Kiến trúc đích hiện tại:

```text
Facebook Messenger / Meta Developer Webhook
  -> Backend Express custom: GET/POST /webhook
  -> Bot / AI / RAG / Handoff
  -> Dashboard Next.js nội bộ: /dashboard/*
  -> PostgreSQL / pgvector
```

Các điểm bắt buộc:

- Không dùng Chatwoot trong kiến trúc đích.
- Không khôi phục `/chatwoot-webhook*`.
- Meta/Facebook callback thật là `GET /webhook` để verify và `POST /webhook` để nhận event.
- `/api/settings/webhook` chỉ là dashboard config/read endpoint, có auth, trả token ở dạng mask/null.
- Clean Architecture tiếp tục đi từng bước nhỏ; không move webhook/RAG/handoff/tenants nếu chưa có prompt riêng.

## 3. Trạng thái No-Chatwoot

| Khu vực | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Backend runtime Chatwoot | Done | Prompt 08B, `rg` không thấy `/chatwoot-webhook` active trong `backend/src` | Historical docs/report vẫn có từ khóa để giữ bằng chứng quá khứ. |
| Dashboard Chatwoot | Done | Prompt 08D | Dashboard target không còn Chatwoot. |
| Schema/env legacy | Done theo phase | Prompt 08C/08F | Không thêm lại `CHATWOOT_*`. |
| Scripts/docs stale | Backlog | Plan 21A/21S | `start-all.bat`, `MULTITENANT_PROGRESS.md`, `ROADMAP.md` cần 21D nếu muốn dọn. |

## 4. Facebook Developer Webhook readiness

| Tầng readiness | Trạng thái | Bằng chứng | Được phép ghi gì | Không được ghi gì | Next action |
|---|---|---|---|---|---|
| Source route readiness | DONE | `backend/src/index.js` mount `GET /webhook`, `POST /webhook`; `backend/src/webhook/handler.js` có `verifyWebhook`, `handleMessage` | Source endpoint đúng là `/webhook`; source route sẵn sàng để local/staging verify | Không ghi đã Meta connected | Giữ endpoint này khi refactor. |
| Local runtime readiness | LOCAL_READY | Prompt 21R smoke PASS 9/9: health, webhook 403, Chatwoot 404, auth/config/read routes | Có thể ghi local runtime smoke an toàn PASS | Không ghi Meta connected/production ready | Dùng làm baseline trước 21B-3. |
| Local DB/env readiness | LOCAL_READY | Prompt 21R: Docker daemon OK, `bbotech-pgvector-local` Up, port 5433 listen, migrate deploy no pending | Có thể ghi DB local ready | Không suy ra production DB ready | Giữ Docker/local DB sẵn trước refactor. |
| Public HTTPS URL readiness | STAGING_PENDING | Deploy docs yêu cầu `https://<domain>/webhook`; chưa có URL thật trong 21S | Cần public HTTPS staging URL trỏ `/webhook` | Không ghi staging connected | Cấu hình domain/reverse proxy/tunnel được kiểm soát. |
| Meta Developer verify challenge readiness | META_PENDING | Chưa có bằng chứng Meta callback/challenge thật | Source có handler verify challenge | Không ghi Meta verified | Verify trong Meta Developer bằng token thật. |
| Meta POST event readiness | META_PENDING | Chưa có test event thật từ Meta | Source có `handleMessage` cho `object === 'page'` | Không ghi đã nhận event production | Gửi event test thật sau staging HTTPS. |
| Dashboard management readiness | LOCAL_READY | `GET /api/settings/webhook` có auth và trả mask/null + `webhookUrl` | Dashboard có endpoint xem cấu hình webhook | Không dùng `/api/settings/webhook` làm callback Meta | Giữ warning trong docs/dashboard nếu cần. |
| Production rollout readiness | PRODUCTION_PENDING | `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` yêu cầu backup + migrate deploy + smoke prod; chưa chạy | Có checklist rollout | Không ghi production ready | Chạy rollout thật theo checklist. |

## 5. Local/staging/production status

| Môi trường | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Source/local static | PASS | `backend npm run quality`, `npx prisma validate`, `dashboard npm run typecheck` trong Prompt 21S | Không sửa source. |
| Local runtime 21R | PASS | Docker daemon OK, DB 5433 listen, backend 3001 health 200, smoke 9/9 PASS | Không start `docker compose`, không start `start-all`, không gọi external. |
| Staging/public HTTPS | STAGING_PENDING | Chưa có public URL smoke trong Prompt 21S | Cần trỏ `https://<domain>/webhook`. |
| Meta Developer | META_PENDING | Chưa có challenge/event thật | Không claim connected. |
| Production | PRODUCTION_PENDING | Chưa backup + migrate deploy + smoke prod thật | Không claim production ready. |

## 6. Những gì đã đủ bằng chứng

- Source route `GET /webhook` và `POST /webhook` tồn tại và được mount trực tiếp ở backend Express.
- Handler verify dùng `hub.mode`, `hub.verify_token`, `hub.challenge` và so với `FB_VERIFY_TOKEN`.
- Handler POST nhận `body.object === 'page'`, xử lý entry/messaging và page context.
- `/api/settings/webhook` là dashboard config endpoint có auth, trả secret ở dạng mask/null.
- `/chatwoot-webhook` không còn active runtime trong `backend/src`.
- Các report trước đã có local smoke: `/webhook` thiếu/sai verify token trả 403, `/chatwoot-webhook` trả 404.
- Deployment policy/rollout checklist đã nói callback production phải là `https://<domain>/webhook`.

## 7. Những gì chưa được claim

- Chưa được claim "Facebook Developer connected".
- Chưa được claim "Meta verified".
- Chưa được claim "đã nhận POST event thật từ Meta".
- Chưa được claim "production ready".
- Chưa được claim "production rollout done".
- Chưa được dùng `/api/settings/webhook` làm Meta callback endpoint.
- Chưa được dùng `webhook-urls-current.txt` làm nguồn production truth.

## 8. Checklist trước khi kết nối Meta thật

- [ ] Có public HTTPS URL ổn định trỏ tới backend.
- [ ] Callback URL trong Meta Developer là `https://<domain>/webhook`.
- [ ] `FB_VERIFY_TOKEN` đã set trên server, không log giá trị thật.
- [ ] `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID` được set qua secret manager/env an toàn.
- [ ] `GET /webhook` thiếu/sai token trả 403 trên môi trường staging/public.
- [ ] `GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` trả đúng challenge khi token đúng.
- [ ] `POST /webhook` nhận event test thật từ Meta và không gọi nhầm Chatwoot.
- [ ] Log không in page token, verify token, app secret hoặc nội dung PII quá mức.

## 9. Checklist trước production rollout

- [ ] Backup DB production bằng `pg_dump -Fc`, verify backup đọc được.
- [ ] Chạy `prisma migrate deploy` trong release/predeploy step đúng một lần.
- [ ] Deploy app backend/dashboard với env production mạnh.
- [ ] `GET /health` production trả 200.
- [ ] Login admin production smoke PASS nhưng không log token.
- [ ] `GET /api/prompts`, `GET /api/settings/handoff` có token trả 200.
- [ ] `GET /webhook` sai token trả 403.
- [ ] `POST /chatwoot-webhook` trả 404.
- [ ] Meta verify challenge thật PASS.
- [ ] Meta POST event thật PASS.
- [ ] Theo dõi log 15-30 phút sau rollout.

## 10. Next prompts

1. **Prompt 21B-3**: tiếp tục giảm nợ backend route read-only, ưu tiên `campaigns` list/detail hoặc `stats` nếu vẫn giữ no behavior change.
2. **Prompt 21D**: tạo docs index, gắn nhãn/archive stale docs, lên kế hoạch dọn legacy empty dirs và script Chatwoot local-only.
3. **Prompt 21C**: dashboard `content-packages/page.tsx` nếu action migrate/external được khóa rõ và không chạy mutation rủi ro.

Không chọn webhook/RAG/handoff/tenants/settings-external cho prompt consolidation thông thường nếu chưa có regression checklist và rollback riêng.
