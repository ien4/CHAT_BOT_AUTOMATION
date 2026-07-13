# META WEBHOOK STAGING RUNBOOK

Ngày cập nhật: 2026-07-13
Trạng thái: **PUBLIC_SMOKE_PASS_NO_SECRET - META_VERIFY_OPERATOR_CONFIRMATION_PENDING**

Runbook này hướng dẫn chạy staging/public HTTPS cho direct Meta webhook an toàn. Không dùng tài liệu này để claim production ready.

## Cập nhật phiên 22B-SAFE

Public Ngrok URL đã dùng trong phiên 22B-SAFE:

```powershell
$env:STAGING_BASE_URL="https://backspace-scrambler-stuck.ngrok-free.dev"
```

Callback URL chính thức cần nhập trong Meta Developer:

```text
https://backspace-scrambler-stuck.ngrok-free.dev/webhook
```

Public smoke không dùng secret đã PASS:

- `GET /health` -> 200.
- `GET /webhook` thiếu params -> 403.
- `POST /chatwoot-webhook` body `{}` -> 404.

Meta verify challenge vẫn là `META_VERIFY_OPERATOR_CONFIRMATION_PENDING` cho tới khi người vận hành bấm Verify and Save trong Meta Developer và xác nhận PASS. Không dùng `/api/settings/webhook` làm callback.

## Cập nhật phiên 22C-SAFE

Prompt 22C-SAFE bị dừng đúng quy trình với trạng thái **BLOCKED_META_VERIFY_CONFIRMATION_MISSING** vì chưa có xác nhận bắt buộc:

```text
META_VERIFY_OPERATOR_CONFIRMED=YES
```

Không gửi hoặc chờ POST event thật trong phiên này. Public smoke 22B vẫn là bằng chứng hiện tại cho HTTPS safe smoke; Meta verify và Meta POST event thật vẫn pending.

## 1. Mục tiêu

Chạy staging/public HTTPS cho direct Meta webhook an toàn:

```text
Meta Developer / Facebook Messenger
  -> https://<domain>/webhook
  -> Backend Express GET/POST /webhook
  -> Bot / AI / RAG / Handoff
```

## 2. Điều kiện trước khi chạy

- Backend local/staging build PASS.
- Public HTTPS URL đã có.
- Callback là `https://<domain>/webhook`.
- Env staging đã set qua secret manager/env host.
- Log redaction đã bật theo source hiện tại.
- Không dùng `/api/settings/webhook` làm callback.
- Không dùng `/chatwoot-webhook*` làm callback.
- Không dùng `webhook-urls-current.txt` làm nguồn truth.

## 3. Public smoke không dùng secret

### Ngrok local testing

Khi dùng Ngrok local:

```powershell
ngrok http 3001
$env:STAGING_BASE_URL="https://xxxx.ngrok-free.app"
```

Trong phiên 22B-SAFE, URL đã smoke là:

```powershell
$env:STAGING_BASE_URL="https://backspace-scrambler-stuck.ngrok-free.dev"
```

Quy tắc:

- `STAGING_BASE_URL` là base URL, không có trailing `/webhook`.
- Callback Meta sẽ là `$env:STAGING_BASE_URL/webhook`.
- Ngrok session phải còn chạy khi public smoke, Meta verify hoặc test event thật.
- Không đưa `NGROK_AUTHTOKEN` hoặc token Facebook vào prompt/report.
- Không dùng `/api/settings/webhook` làm callback; endpoint đó chỉ dành cho dashboard config/read có auth.

Set biến shell rõ ràng, không có trailing `/webhook`:

```powershell
$env:STAGING_BASE_URL="https://<domain>"
```

Chạy:

- `GET $env:STAGING_BASE_URL/health` -> 200.
- `GET $env:STAGING_BASE_URL/webhook` thiếu params -> 403.
- `POST $env:STAGING_BASE_URL/chatwoot-webhook` body `{}` -> 404.

Không gửi verify token thật trong bước smoke này. Không gửi POST object `page`.

## 4. Verify Meta thủ công

- Người vận hành mở Meta Developer.
- Callback URL hiện tại: `https://backspace-scrambler-stuck.ngrok-free.dev/webhook`.
- Verify token khớp `FB_VERIFY_TOKEN` local/staging; tự lấy từ env thật, không đưa cho Codex và không in ra terminal/report.
- Chỉ sau challenge PASS mới ghi Meta verified.
- Không in token vào log/report.
- Không lưu screenshot hoặc log có token thật vào repo.

## 5. Test POST event thật

- Chỉ chạy sau verify PASS.
- Trước khi test, người vận hành phải xác nhận rõ `META_VERIFY_OPERATOR_CONFIRMED=YES`.
- Gửi đúng 1 tin nhắn test từ Messenger/Page test sau khi Codex báo `READY_FOR_OPERATOR_TEST_MESSAGE`.
- Tin nhắn test không chứa thông tin cá nhân, secret, token hoặc dữ liệu khách hàng thật.
- Theo dõi log redacted:
  - không message text
  - không full sender id
  - không full recipient id
  - không token/secret
  - không raw body
- Chỉ ghi nhận metadata an toàn: masked id, event/count, boolean, length, label, status/code generic.
- Không paste raw message text, raw sender id, raw recipient id, token hoặc raw webhook payload vào report.
- Không dùng Ngrok inspection payload nếu có nguy cơ chứa token hoặc raw webhook payload.
- Nếu phát hiện leak log, dừng staging event và mở prompt fix; không claim PASS.
- Nếu lỗi, rollback env/proxy/app theo mục rollback.
- Không dùng kết quả staging để claim production ready.

## 6. Rollback staging

- Revert callback URL hoặc disable subscription trong Meta Developer nếu cần.
- Rollback app deploy nếu error rate tăng.
- Restore env cũ nếu cấu hình sai.
- Rollback reverse proxy/tunnel về cấu hình trước đó nếu route `/webhook` lỗi.
- Không chạy production rollout trong staging prompt.

## 7. Không được claim

- Không claim production ready.
- Không claim Meta verified nếu chưa có challenge thật.
- Không claim POST event ready nếu chưa nhận event thật.
- Không claim public staging ready nếu chưa có public smoke PASS.
