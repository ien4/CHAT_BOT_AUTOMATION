# META WEBHOOK STAGING READINESS

Ngày cập nhật: 2026-07-12  
Trạng thái: **PASS WITH WARNINGS - STAGING_URL_MISSING**

Tài liệu này chuẩn bị checklist public HTTPS staging cho Meta Developer Webhook direct vào backend Express. Đây không phải bằng chứng Meta đã verified, không phải bằng chứng đã nhận POST event thật và không phải production rollout.

Runbook vận hành staging: `docs/META_WEBHOOK_STAGING_RUNBOOK.md`.

## 1. Mục tiêu

Chuẩn bị public HTTPS staging cho Meta Developer Webhook direct vào backend Express, giữ đúng kiến trúc No-Chatwoot và không gọi Meta/Facebook API thật trong bước audit này.

## 2. Kiến trúc đúng

```text
Meta Developer / Facebook Messenger
  -> https://<domain>/webhook
  -> Backend Express GET/POST /webhook
  -> Bot / AI / RAG / Handoff
  -> PostgreSQL / pgvector
```

Endpoint callback cần nhập trong Meta Developer là **`https://<domain>/webhook`**.

Không dùng các endpoint sau làm callback Meta:

- `/api/settings/webhook`: chỉ là dashboard config/read endpoint có auth, trả secret dạng mask/null.
- `/chatwoot-webhook*`: legacy Chatwoot, không phải target mới.
- URL trong `webhook-urls-current.txt`: local/stale log, không phải nguồn staging/production truth.

## 3. Readiness theo tầng

| Tầng readiness | Trạng thái | Bằng chứng | Còn thiếu |
|---|---|---|---|
| Source route readiness | DONE | `backend/src/index.js` mount `GET /webhook` và `POST /webhook` | Giữ endpoint khi refactor sau này. |
| Verify challenge handler | DONE | `backend/src/webhook/handler.js` đọc `hub.mode`, `hub.verify_token`, `hub.challenge`; token đúng trả challenge, sai/thiếu trả 403 | Chưa chạy challenge token thật vì không đọc/in secret. |
| POST page event handler | SOURCE_READY | Handler nhận `body.object === 'page'` và xử lý entry/messaging | Chưa gửi Meta POST event thật. |
| Local runtime readiness | PASS | Prompt 22A smoke local PASS: health, `/webhook` thiếu params 403, legacy 404, login tạm, settings/prompts/channel/quick-reply/campaigns/analytics | Docker API có warning 500/time-out dù cổng 5433/3001 listen. |
| Public HTTPS readiness | STAGING_URL_MISSING | Chưa có `STAGING_BASE_URL` shell và chưa có URL public thật trong docs | Cần domain/tunnel HTTPS ổn định trỏ vào backend. |
| Meta verify challenge | META_PENDING | Chưa có callback/challenge thật từ Meta Developer | Cấu hình callback `https://<domain>/webhook` và verify token khớp `FB_VERIFY_TOKEN`. |
| Meta POST event | META_PENDING | Prompt này không gọi Facebook/Meta external | Test event thật sau khi HTTPS và verify đã PASS. |
| Production rollout | PRODUCTION_PENDING | Chưa backup + `prisma migrate deploy` + smoke production thật | Dùng `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` khi rollout. |

## 4. Checklist staging bắt buộc

| Staging prerequisite | Status | Evidence | Missing action |
|---|---|---|---|
| Public HTTPS domain/subdomain trỏ tới backend | MISSING | Không có `STAGING_BASE_URL`; docs chỉ có placeholder `https://your-domain.com` | Chuẩn bị domain/tunnel HTTPS ổn định. |
| Reverse proxy/tunnel chuyển `GET/POST /webhook` về backend | MISSING | Chưa có public smoke | Cấu hình proxy/tunnel tới backend port chạy thật. |
| `APP_BASE_URL` đúng public URL | EXAMPLE_ONLY | `backend/.env.example` có `APP_BASE_URL=https://your-domain.com` | Set env staging thật ngoài Git. |
| `FB_VERIFY_TOKEN` set trên staging | ENV_REQUIRED | `backend/.env.example` có tên biến | Set secret thật, không log giá trị. |
| `FB_PAGE_ACCESS_TOKEN` set trên staging | ENV_REQUIRED | `backend/.env.example` có tên biến | Set secret thật, không log giá trị. |
| `FB_APP_SECRET` set trên staging | ENV_REQUIRED | `backend/.env.example` có tên biến | Set secret thật, không log giá trị. |
| `FB_PAGE_ID` set nếu code cần | ENV_REQUIRED | `backend/.env.example` có tên biến | Set đúng page id cho staging. |
| Public `GET /health` | NOT_RUN | Không có `STAGING_BASE_URL` | Chạy khi có public URL. |
| Public wrong-token/missing-token `/webhook` trả 403 | NOT_RUN | Không có `STAGING_BASE_URL` | Chạy smoke public không dùng token thật. |
| Correct-token challenge trả đúng challenge | MANUAL_ONLY | Cần secret thật nên không tự chạy trong Codex | Verify qua Meta Developer hoặc người vận hành có secret. |
| Meta POST test event thật | PENDING | Prompt này không gửi event thật | Chạy sau khi verify challenge PASS. |
| Log không in secret/token/PII quá mức | SOURCE_HARDENED_PENDING_REAL_EVENT | Prompt 22A-1 đã redact log trong `backend/src/webhook/handler.js`; scan chỉ còn read fields để xử lý | Cần quan sát log khi test event thật sau Meta verify. |
| Rollback/staging recovery plan | PARTIAL | Có production rollback docs; chưa có staging-specific runbook | Ghi rõ cách rollback proxy/env/app cho staging. |

## 5. Smoke local đã chạy trong Prompt 22A

| Check | Kết quả |
|---|---|
| `GET /health` | PASS, 200 |
| `GET /webhook` thiếu verify params | PASS, 403 |
| `POST /chatwoot-webhook` body `{}` | PASS, 404 |
| Login admin tạm | PASS, 200 + token tồn tại, không in token |
| `GET /api/settings/webhook` | PASS, 200, secret mask/null |
| `GET /api/prompts` | PASS, 200 |
| `GET /api/channel-configs` | PASS, 200 |
| `GET /api/quick-reply-menus` | PASS, 200 |
| `GET /api/campaigns` platform token | PASS, 200 |
| `GET /api/analytics?days=7` optional | PASS, 200 |
| Cleanup admin tạm | PASS, deleted 1 |

## 6. Public HTTPS smoke

Prompt 22A không chạy public HTTPS smoke vì không có biến shell `STAGING_BASE_URL`.

Khi có URL public, chỉ chạy các smoke an toàn sau, không gửi verify token thật và không gửi POST event Meta thật:

```powershell
$env:STAGING_BASE_URL="https://<domain>"
Invoke-WebRequest "$env:STAGING_BASE_URL/health"
Invoke-WebRequest "$env:STAGING_BASE_URL/webhook"
Invoke-WebRequest "$env:STAGING_BASE_URL/chatwoot-webhook" -Method POST -Body "{}" -ContentType "application/json"
```

Kỳ vọng:

- `/health` trả 200 nếu health được expose public.
- `/webhook` thiếu params trả 403.
- `/chatwoot-webhook` trả 404.

## 7. Bước verify Meta thủ công

Chỉ người vận hành có secret thật mới thực hiện:

1. Set env staging thật: `APP_BASE_URL`, `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID`.
2. Cấu hình Meta Developer Callback URL: `https://<domain>/webhook`.
3. Nhập Verify Token đúng bằng `FB_VERIFY_TOKEN` trên staging.
4. Chỉ khi Meta verify challenge thành công mới được ghi **Meta verified**.
5. Sau đó mới gửi POST test event thật từ Meta và quan sát log đã redaction phù hợp.

## 8. Điểm cần tu sửa trước staging event thật

- Cần cung cấp public HTTPS URL thật và chạy public smoke an toàn.
- Cần xác nhận reverse proxy chuyển nguyên query string `hub.*` tới backend.
- Log POST event trong `handler.js` đã được harden ở Prompt 22A-1: không log message text, full sender id, full recipient id, postback payload hoặc raw body. Cần quan sát lại trên staging khi chạy event thật.
- Staging runbook đã được tạo tại `docs/META_WEBHOOK_STAGING_RUNBOOK.md`; cần dùng runbook này khi rollback proxy/env/app.

## 9. Gợi ý tiếp theo

1. Chuẩn bị domain/tunnel HTTPS ổn định và cung cấp `STAGING_BASE_URL` cho prompt public smoke tiếp theo.
2. Làm theo `docs/META_WEBHOOK_STAGING_RUNBOOK.md` để chạy public smoke không dùng secret: `/health`, `/webhook` thiếu params 403, `/chatwoot-webhook` 404.
3. Sau đó mới vào Meta Developer để verify challenge thủ công bằng secret thật.
4. Chỉ sau Meta verify + POST event thật mới xem xét prompt production rollout.
