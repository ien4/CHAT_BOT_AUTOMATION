# PROJECT GOALS AND FACEBOOK WEBHOOK STATUS

Ngày cập nhật: 2026-07-12
Nguồn: Prompt 21S docs/status-sync, audit code local, docs/report hiện có, validation an toàn cục bộ. Tài liệu này không phải bằng chứng production rollout và không phải bằng chứng Meta Developer đã kết nối thật.

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
| Local runtime readiness | LOCAL_READY with warning | Reports trước: `/webhook` sai/thiếu token -> 403, `/chatwoot-webhook` -> 404; Prompt 21S hiện tại không smoke được do Docker/DB/backend local không chạy | Có prior local proof; current smoke cần chạy lại khi Docker/DB sẵn sàng | Không ghi runtime mới PASS trong 21S | Bật Docker/local DB rồi smoke lại nếu cần proof mới. |
| Local DB/env readiness | LOCAL_READY historically, current blocked | `backend npm run quality` và `npx prisma validate` PASS; Docker daemon/port 5433 không sẵn trong 21S | Static/prisma validation PASS | Không claim DB runtime đang chạy hôm nay | Start Docker Desktop/local DB ngoài prompt hoặc prompt riêng. |
| Public HTTPS URL readiness | STAGING_PENDING | Deploy docs yêu cầu `https://<domain>/webhook`; chưa có URL thật trong 21S | Cần public HTTPS staging URL trỏ `/webhook` | Không ghi staging connected | Cấu hình domain/reverse proxy/tunnel được kiểm soát. |
| Meta Developer verify challenge readiness | META_PENDING | Chưa có bằng chứng Meta callback/challenge thật | Source có handler verify challenge | Không ghi Meta verified | Verify trong Meta Developer bằng token thật. |
| Meta POST event readiness | META_PENDING | Chưa có test event thật từ Meta | Source có `handleMessage` cho `object === 'page'` | Không ghi đã nhận event production | Gửi event test thật sau staging HTTPS. |
| Dashboard management readiness | LOCAL_READY | `GET /api/settings/webhook` có auth và trả mask/null + `webhookUrl` | Dashboard có endpoint xem cấu hình webhook | Không dùng `/api/settings/webhook` làm callback Meta | Giữ warning trong docs/dashboard nếu cần. |
| Production rollout readiness | PRODUCTION_PENDING | `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` yêu cầu backup + migrate deploy + smoke prod; chưa chạy | Có checklist rollout | Không ghi production ready | Chạy rollout thật theo checklist. |

## 5. Local/staging/production status

| Môi trường | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| Source/local static | PASS | `backend npm run quality`, `npx prisma validate`, `dashboard npm run typecheck` trong Prompt 21S | Không sửa source. |
| Local runtime 21S | PASS WITH WARNINGS | Docker daemon không phản hồi, DB 5433 không listen, backend 3001 không listen | Không start `docker compose`, không start `start-all`. |
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
