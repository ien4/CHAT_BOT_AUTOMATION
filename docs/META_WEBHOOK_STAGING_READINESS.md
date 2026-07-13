# META WEBHOOK STAGING READINESS

Ngày cập nhật: 2026-07-13
Trạng thái: **PASS WITH WARNINGS - PUBLIC_SMOKE_PASS_NO_SECRET_META_VERIFY_PENDING**

Tài liệu này chuẩn bị checklist public HTTPS staging cho Meta Developer Webhook direct vào backend Express. Đây không phải bằng chứng Meta đã verified, không phải bằng chứng đã nhận POST event thật và không phải production rollout.

Runbook vận hành staging: `docs/META_WEBHOOK_STAGING_RUNBOOK.md`.

## Cập nhật 22C-SAFE - Real event audit blocked by missing operator confirmation

Ngày cập nhật: 2026-07-13

- Kết quả Prompt 22C-SAFE: **BLOCKED_META_VERIFY_CONFIRMATION_MISSING**.
- Lý do: phiên này chưa có xác nhận bắt buộc `META_VERIFY_OPERATOR_CONFIRMED=YES`.
- Không test POST event thật từ Messenger/Page test.
- Không chờ event thật, không gọi Meta/Facebook API bằng script, không dùng Ngrok inspection API, không gửi POST object `page` giả.
- Public HTTPS readiness giữ nguyên: **PUBLIC_SMOKE_PASS_NO_SECRET** theo Prompt 22B-SAFE.
- Callback URL hiện tại: **`https://backspace-scrambler-stuck.ngrok-free.dev/webhook`**.
- Meta verify challenge giữ nguyên: **META_VERIFY_OPERATOR_CONFIRMATION_PENDING**.
- Meta POST event thật giữ nguyên: **PENDING**.
- Log redaction source giữ nguyên: **SOURCE_HARDENED_PENDING_REAL_EVENT** vì chưa có event thật để audit runtime log.
- Production rollout: **PENDING**.

## Cập nhật 22B-SAFE - Public Ngrok smoke PASS, Meta verify pending

Ngày cập nhật: 2026-07-13

- Public base URL đã smoke: **`https://backspace-scrambler-stuck.ngrok-free.dev`**.
- Callback URL đúng cho Meta Developer: **`https://backspace-scrambler-stuck.ngrok-free.dev/webhook`**.
- Local DB/backend runtime: **PASS**. Docker phản hồi, container `bbotech-pgvector-local` đang Up, DB `5433` listen, backend `3001` listen, `prisma migrate deploy` không có pending migration.
- Local smoke an toàn: **PASS** cho `/health`, `/webhook` thiếu params 403, `/chatwoot-webhook` 404, login admin tạm, `/api/settings/webhook`, `/api/prompts`; admin tạm đã cleanup.
- Public HTTPS smoke qua Ngrok: **PUBLIC_SMOKE_PASS_NO_SECRET**.
  - `GET /health`: PASS 200.
  - `GET /webhook` thiếu params: PASS 403.
  - `POST /chatwoot-webhook` body `{}`: PASS 404.
- Không dùng verify token thật trong command, không gửi `hub.challenge`, không gửi POST object `page`, không gọi Meta/Facebook API thật.
- Meta verify challenge: **META_VERIFY_OPERATOR_CONFIRMATION_PENDING** vì chưa có xác nhận từ người vận hành rằng Meta UI Verify and Save đã PASS.
- Meta POST event thật: **PENDING**.
- Production rollout: **PENDING**.

## Cập nhật 22A-2 - Local runtime restored, public Ngrok smoke blocked

Ngày cập nhật: 2026-07-13

- Local DB/backend runtime: **PASS**. Docker phản hồi, container `bbotech-pgvector-local` đang Up, DB `5433` listen, backend `3001` listen, `prisma migrate deploy` không có pending migration.
- Local smoke an toàn: **PASS** cho `/health`, `/webhook` thiếu params 403, `/chatwoot-webhook` 404, login admin tạm, `/api/settings/webhook`, `/api/prompts` và các route optional read-only.
- Public HTTPS smoke qua Ngrok: **BLOCKED_STAGING_BASE_URL_MISSING** vì shell hiện không có `STAGING_BASE_URL`.
- Meta verify challenge: **PENDING**.
- Meta POST event thật: **PENDING**.
- Production rollout: **PENDING**.

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
| Local runtime readiness | PASS | Prompt 22B-SAFE: Docker/DB/backend ready, migrate deploy no pending, local smoke PASS | Prompt không start/kill backend vì process đã chạy sẵn. |
| Public HTTPS readiness | PUBLIC_SMOKE_PASS_NO_SECRET | `https://backspace-scrambler-stuck.ngrok-free.dev`: `/health` 200, `/webhook` thiếu params 403, `/chatwoot-webhook` 404 | Ngrok session phải còn chạy khi Meta verify/test event. |
| Meta verify challenge | META_VERIFY_OPERATOR_CONFIRMATION_PENDING | Chưa có operator confirmation rằng Meta UI Verify and Save đã PASS | Người vận hành tự nhập `FB_VERIFY_TOKEN` trong Meta Developer; Codex không đọc/in token. |
| Meta POST event | META_PENDING | Prompt này không gọi Facebook/Meta external | Test event thật sau khi HTTPS và verify đã PASS. |
| Production rollout | PRODUCTION_PENDING | Chưa backup + `prisma migrate deploy` + smoke production thật | Dùng `docs/PRODUCTION_ROLLOUT_CHECKLIST.md` khi rollout. |

## 4. Checklist staging bắt buộc

| Staging prerequisite | Status | Evidence | Missing action |
|---|---|---|---|
| Public HTTPS domain/subdomain trỏ tới backend | PASS | Public base URL `https://backspace-scrambler-stuck.ngrok-free.dev` đã smoke | Giữ Ngrok session chạy khi verify/test event. |
| Reverse proxy/tunnel chuyển `GET/POST /webhook` về backend | PASS_FOR_SAFE_SMOKE | Public `/health`, `/webhook`, `/chatwoot-webhook` trả đúng status | Chưa gửi correct-token challenge hoặc POST event thật. |
| `APP_BASE_URL` đúng public URL | EXAMPLE_ONLY | `backend/.env.example` có `APP_BASE_URL=https://your-domain.com` | Set env staging thật ngoài Git. |
| `FB_VERIFY_TOKEN` set trên staging | ENV_REQUIRED | `backend/.env.example` có tên biến | Set secret thật, không log giá trị. |
| `FB_PAGE_ACCESS_TOKEN` set trên staging | ENV_REQUIRED | `backend/.env.example` có tên biến | Set secret thật, không log giá trị. |
| `FB_APP_SECRET` set trên staging | ENV_REQUIRED | `backend/.env.example` có tên biến | Set secret thật, không log giá trị. |
| `FB_PAGE_ID` set nếu code cần | ENV_REQUIRED | `backend/.env.example` có tên biến | Set đúng page id cho staging. |
| Public `GET /health` | PASS | Ngrok public smoke trả 200 và body health hợp lệ | Theo dõi lại nếu đổi tunnel. |
| Public wrong-token/missing-token `/webhook` trả 403 | PASS | Ngrok public smoke thiếu `hub.*` trả 403 | Correct-token challenge vẫn manual-only. |
| Correct-token challenge trả đúng challenge | MANUAL_PENDING | Cần secret thật nên Codex không tự chạy | Verify qua Meta Developer; người vận hành xác nhận kết quả. |
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

Prompt 22B-SAFE đã chạy public smoke qua Ngrok với base URL:

```powershell
$env:STAGING_BASE_URL="https://backspace-scrambler-stuck.ngrok-free.dev"
```

Callback URL tạo từ base URL:

```text
https://backspace-scrambler-stuck.ngrok-free.dev/webhook
```

Kết quả public smoke không dùng secret:

| Endpoint | Kỳ vọng | Kết quả |
|---|---|---|
| `GET /health` | 200 | PASS |
| `GET /webhook` thiếu params | 403 | PASS |
| `POST /chatwoot-webhook` body `{}` | 404 | PASS |

Không gửi verify token thật, không gửi `hub.challenge`, không POST object `page`, không gọi Meta/Facebook API thật.

## 7. Bước verify Meta thủ công

Chỉ người vận hành có secret thật mới thực hiện:

1. Set env staging thật: `APP_BASE_URL`, `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID`.
2. Cấu hình Meta Developer Callback URL: `https://backspace-scrambler-stuck.ngrok-free.dev/webhook`.
3. Nhập Verify Token đúng bằng `FB_VERIFY_TOKEN` trên staging.
4. Chỉ khi Meta verify challenge thành công và người vận hành xác nhận mới được ghi **Meta verified**.
5. Sau đó mới gửi POST test event thật từ Meta và quan sát log đã redaction phù hợp.

## 8. Điểm cần tu sửa trước staging event thật

- Public HTTPS smoke an toàn đã PASS qua Ngrok, nhưng cần giữ tunnel đang chạy khi thao tác Meta Developer.
- Cần xác nhận Meta Developer verify challenge chuyển nguyên query string `hub.*` tới backend bằng thao tác Verify and Save thật.
- Log POST event trong `handler.js` đã được harden ở Prompt 22A-1: không log message text, full sender id, full recipient id, postback payload hoặc raw body. Cần quan sát lại trên staging khi chạy event thật.
- Staging runbook đã được tạo tại `docs/META_WEBHOOK_STAGING_RUNBOOK.md`; cần dùng runbook này khi rollback proxy/env/app.

## 9. Gợi ý tiếp theo

1. Người vận hành giữ Ngrok session `https://backspace-scrambler-stuck.ngrok-free.dev` đang chạy.
2. Vào Meta Developer, dùng callback `https://backspace-scrambler-stuck.ngrok-free.dev/webhook` và Verify Token lấy từ `FB_VERIFY_TOKEN` trong env local/staging, không in token ra terminal/report.
3. Khi Meta UI Verify and Save PASS, ghi nhận `META_VERIFY_CHALLENGE_OPERATOR_CONFIRMED_PASS` bằng prompt riêng hoặc xác nhận trực tiếp trong phiên.
4. Sau Meta verify mới chạy prompt test POST event thật; production rollout vẫn chỉ sau verify + event thật + checklist production.
