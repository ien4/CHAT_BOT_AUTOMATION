# META WEBHOOK STAGING RUNBOOK

Ngày cập nhật: 2026-07-12
Trạng thái: **READY FOR PUBLIC SMOKE WHEN STAGING_BASE_URL EXISTS**

Runbook này hướng dẫn chạy staging/public HTTPS cho direct Meta webhook an toàn. Không dùng tài liệu này để claim production ready.

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
- Callback URL: `https://<domain>/webhook`.
- Verify token khớp `FB_VERIFY_TOKEN` staging.
- Chỉ sau challenge PASS mới ghi Meta verified.
- Không in token vào log/report.
- Không lưu screenshot hoặc log có token thật vào repo.

## 5. Test POST event thật

- Chỉ chạy sau verify PASS.
- Theo dõi log redacted:
  - không message text
  - không full sender id
  - không full recipient id
  - không token/secret
  - không raw body
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
