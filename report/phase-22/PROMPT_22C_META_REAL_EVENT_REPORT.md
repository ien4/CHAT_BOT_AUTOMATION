# PROMPT 22C - META REAL EVENT + LOG REDACTION REPORT

Ngày thực hiện: 2026-07-13
Trạng thái: **BLOCKED_META_VERIFY_CONFIRMATION_MISSING**

## 1. Mục tiêu

Xác nhận Meta Verify Challenge đã operator-confirmed PASS, sau đó mới chuẩn bị kiểm thử đúng 1 POST event thật từ Messenger/Page test qua Ngrok và audit log redaction runtime. Prompt này không refactor source, không đổi behavior, không sửa Prisma/schema/package/dashboard, không production rollout và không push remote.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không switch branch |
| Commit nền | `908fca9 Record Meta webhook public smoke and challenge status` tồn tại |
| Working tree trước patch | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked sensitive env exact scan | Không có env thật tracked/staged |
| Regex scan theo prompt | Match `backend/.env.example`; đây là sample tracked hợp lệ, không phải env thật |

Không mở/in `.env` thật, `.env.local`, token hoặc secret.

## 3. Context files read

- `report/phase-22/PROMPT_22B_META_VERIFY_CHALLENGE_REPORT.md`
- `docs/status/META_WEBHOOK_STAGING_READINESS.md`
- `docs/runbooks/META_WEBHOOK_STAGING_RUNBOOK.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/policies/QUALITY_GATE.md`
- `backend/.env.example`
- `backend/src/webhook/handler.js`

Không đọc env thật.

## 4. Static validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check` trước patch | PASS |
| Root `git diff --stat` trước patch | Sạch |
| Root `git diff --name-status` trước patch | Sạch |

## 5. Meta Verify Challenge status

Trạng thái: **META_VERIFY_OPERATOR_CONFIRMATION_PENDING**.

Không có xác nhận bắt buộc trong phiên này:

```text
META_VERIFY_OPERATOR_CONFIRMED=YES
```

Vì thiếu xác nhận này, Prompt 22C-SAFE dừng trước real event test. Không claim Meta verified. Không claim correct-token challenge đã PASS. Bằng chứng hiện tại vẫn là public safe smoke từ Prompt 22B-SAFE, không phải Meta UI verification.

Callback URL hiện tại:

```text
https://backspace-scrambler-stuck.ngrok-free.dev/webhook
```

## 6. Runtime/public smoke

Không rerun runtime/public smoke trong nhánh 22C vì checkpoint Meta Verify chưa đạt. Trạng thái kế thừa từ Prompt 22B-SAFE:

- Public HTTPS readiness: **PUBLIC_SMOKE_PASS_NO_SECRET**.
- `GET /health`: PASS 200 trong Prompt 22B-SAFE.
- `GET /webhook` thiếu params: PASS 403 trong Prompt 22B-SAFE.
- `POST /chatwoot-webhook` body `{}`: PASS 404 trong Prompt 22B-SAFE.

Không gửi verify token thật, không gửi `hub.challenge`, không gửi POST object `page`, không gọi Meta/Facebook API.

## 7. Log capture strategy

Không mở real event observation trong phiên này vì thiếu `META_VERIFY_OPERATOR_CONFIRMED=YES`.

Chiến lược cho lần chạy tiếp theo:

- Nếu Codex start được backend process mới, capture stdout/stderr vào buffer tạm, không commit raw log.
- Nếu backend process đã chạy và Codex không có log access, người vận hành quan sát terminal backend hiện có và chỉ cung cấp observation đã sanitize.
- Không dùng Ngrok inspection API nếu payload có thể chứa token hoặc raw webhook body.
- Không paste raw message text, raw sender id, raw recipient id, token hoặc raw webhook payload vào report.

## 8. Real POST event observation

Không có real POST event trong phiên này.

| Câu hỏi | Kết quả |
|---|---|
| Có gửi 1 tin nhắn test từ Messenger/Page test không? | Không |
| Có chờ/quan sát POST event thật không? | Không |
| Có chủ động gọi Meta/Facebook API bằng script không? | Không |
| Có gửi POST object `page` giả bằng curl/script không? | Không |
| Có app outbound behavior observed không? | Không quan sát vì không có event thật |

## 9. Log redaction audit

Runtime log redaction audit: **BLOCKED_BY_MISSING_META_VERIFY_CONFIRMATION**.

Source audit từ `backend/src/webhook/handler.js` vẫn cho thấy log đã được harden theo Prompt 22A-1:

- `maskId()` dùng cho sender/recipient/page id trong webhook log.
- `summarizeMessagingEvent()` chỉ ghi metadata như boolean, length, count, masked id.
- `verifyWebhook()` log trạng thái có/không có tham số, không log verify token.
- `handleMessage()` log `entryCount`, `messagingCount`, metadata đã summarize.
- `sendMessage()` log outbound metadata, không log nội dung phản hồi.
- `logWebhookError()` ghi name/status/code generic qua `safeError()`, không log raw Graph error detail.

Chưa thể kết luận runtime event log PASS vì chưa có event thật.

| Leak cần kiểm | Kết quả phiên này |
|---|---|
| Raw message text logged | Không quan sát runtime vì không có event |
| Full sender id logged | Không quan sát runtime vì không có event |
| Full recipient id logged | Không quan sát runtime vì không có event |
| Raw webhook body logged | Không quan sát runtime vì không có event |
| Token/secret logged | Không quan sát runtime vì không có event |

## 10. DB/dashboard safe observation

Không chạy DB/dashboard event observation vì không có real POST event. Không query message content, không in sender/recipient id và không dùng dashboard smoke để claim event delivery.

## 11. Token/secret safety

| Câu hỏi | Kết quả |
|---|---|
| Có đọc/in `.env` thật hoặc `.env.local` không? | Không |
| Có dùng verify token thật trong command không? | Không |
| Có in auth token dashboard không? | Không |
| Có in DATABASE_URL/JWT_SECRET/ADMIN_PASSWORD/FB token/NGROK_AUTHTOKEN không? | Không |
| Có in raw sender id/recipient id/message text/body không? | Không |
| Có query Ngrok inspection API không? | Không |
| Có lưu raw log/screenshot vào repo không? | Không |

`npm run quality` và `prisma validate` có thể load env để ứng dụng validate, nhưng report/terminal không in giá trị secret.

## 12. Docs changed

- `docs/status/META_WEBHOOK_STAGING_READINESS.md`
- `docs/runbooks/META_WEBHOOK_STAGING_RUNBOOK.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `report/phase-22/PROMPT_22C_META_REAL_EVENT_REPORT.md`

## 13. Không thay đổi

- Không sửa `backend/src/**`.
- Không sửa `dashboard/src/**`.
- Không sửa `backend/prisma/**`.
- Không sửa package/package-lock.
- Không sửa Dockerfile/start scripts/docker-compose.
- Không sửa `.env`, `.env.local`, `.next`, backup, temp/log.
- Không commit raw runtime logs.
- Không gửi real POST event.
- Không gọi Meta/Facebook Graph API bằng script.
- Không production rollout.
- Không push remote.

## 14. Remaining warnings

- Meta Verify Challenge chưa operator-confirmed PASS.
- Meta POST event thật vẫn PENDING.
- Runtime log redaction audit vẫn pending vì chưa có event thật.
- Ngrok session phải còn chạy khi người vận hành verify/test event.
- Production rollout vẫn PENDING.

## 15. Final verdict

**BLOCKED_META_VERIFY_CONFIRMATION_MISSING**

Prompt 22C-SAFE chưa hoàn tất real event audit vì thiếu xác nhận bắt buộc `META_VERIFY_OPERATOR_CONFIRMED=YES`. Public safe smoke từ Prompt 22B-SAFE vẫn giữ trạng thái PASS, nhưng không claim Meta verified, không claim POST event pass và không claim production ready.

## 16. Next step

Người vận hành cần:

1. Giữ Ngrok session `https://backspace-scrambler-stuck.ngrok-free.dev` đang chạy.
2. Vào Meta Developer và dùng callback `https://backspace-scrambler-stuck.ngrok-free.dev/webhook`.
3. Nhập Verify Token bằng giá trị `FB_VERIFY_TOKEN` thật trong env local/staging, không in token ra terminal/report.
4. Bấm Verify and Save.
5. Khi Meta UI PASS, gửi lại prompt kèm dòng:

```text
META_VERIFY_OPERATOR_CONFIRMED=YES
```

Sau đó mới chạy real POST event audit, yêu cầu người vận hành gửi đúng 1 tin nhắn test không chứa PII/secret và quan sát log redaction.
