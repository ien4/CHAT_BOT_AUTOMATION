# PROMPT 22B — META VERIFY CHALLENGE REPORT

Ngày thực hiện: 2026-07-13
Trạng thái: **PASS WITH WARNINGS — PUBLIC_SMOKE_PASS_NO_SECRET, META_VERIFY_OPERATOR_CONFIRMATION_PENDING**

## 1. Mục tiêu

Chạy public Ngrok smoke cho direct Meta webhook staging, ghi nhận callback URL đúng cho Meta Developer và chuẩn bị checkpoint Verify Challenge thủ công. Không refactor source, không đổi behavior, không sửa Prisma/schema/package/dashboard, không gọi Meta/Facebook API thật, không gửi POST event thật và không production rollout.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không switch branch |
| Commit nền | `dede1fb Verify ngrok public smoke readiness` tồn tại |
| Working tree trước patch | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked sensitive env exact scan | Không có env thật tracked/staged |
| Regex scan theo prompt | Match `backend/.env.example`; đây là sample tracked hợp lệ, không phải env thật |

Không mở/in `.env` thật, `.env.local`, token hoặc secret.

## 3. Context files read

- `report/PROMPT_22A_2_NGROK_PUBLIC_SMOKE_REPORT.md`
- `docs/META_WEBHOOK_STAGING_READINESS.md`
- `docs/META_WEBHOOK_STAGING_RUNBOOK.md`
- `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `docs/QUALITY_GATE.md`
- `backend/.env.example`

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

## 5. Local runtime recheck

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
| Cleanup admin tạm | deleted 1 | PASS |

Không POST `/webhook` object `page`, không dùng verify token thật và không gọi external.

## 7. STAGING_BASE_URL

Public base URL được cung cấp và validate:

```text
https://backspace-scrambler-stuck.ngrok-free.dev
```

Kết quả validate:

- Bắt đầu bằng `https://`: PASS.
- Không có trailing `/webhook`: PASS.
- Không phải localhost: PASS.
- Không phải placeholder: PASS.

Callback URL được tạo bằng base URL + `/webhook`.

## 8. Public Ngrok smoke

Public smoke chạy qua Ngrok, không dùng secret:

| Endpoint | Kỳ vọng | Kết quả |
|---|---|---|
| `GET https://backspace-scrambler-stuck.ngrok-free.dev/health` | 200 | PASS |
| `GET https://backspace-scrambler-stuck.ngrok-free.dev/webhook` thiếu params | 403 | PASS |
| `POST https://backspace-scrambler-stuck.ngrok-free.dev/chatwoot-webhook` body `{}` | 404 | PASS |

Public HTTPS readiness: **PUBLIC_SMOKE_PASS_NO_SECRET**.

Không gửi verify token thật, không gửi `hub.challenge`, không POST object `page`, không gọi Meta/Facebook API.

## 9. Callback URL for Meta Developer

Callback URL chính thức cho Meta Developer trong phiên này:

```text
https://backspace-scrambler-stuck.ngrok-free.dev/webhook
```

Không dùng các endpoint sau làm callback:

- `/api/settings/webhook`
- `/chatwoot-webhook`
- `webhook-urls-current.txt`

## 10. Meta Verify Challenge status

Trạng thái: **META_VERIFY_OPERATOR_CONFIRMATION_PENDING**.

Lý do: Codex đã chạy public smoke an toàn nhưng chưa có xác nhận thực tế từ người vận hành rằng Meta Developer UI `Verify and Save` đã PASS.

Hướng dẫn cho người vận hành:

1. Giữ Ngrok session đang chạy.
2. Mở Meta Developer > Messenger / Webhooks.
3. Callback URL: `https://backspace-scrambler-stuck.ngrok-free.dev/webhook`.
4. Verify Token: dùng giá trị `FB_VERIFY_TOKEN` trong env local/staging thật; không in token ra terminal/report.
5. Bấm Verify and Save.
6. Chỉ khi Meta UI báo thành công và người vận hành xác nhận mới ghi `META_VERIFY_CHALLENGE_OPERATOR_CONFIRMED_PASS`.

## 11. Token/secret safety

| Câu hỏi | Kết quả |
|---|---|
| Có dùng verify token thật trong command không? | Không |
| Có đọc/in token/secret không? | Không |
| Có in auth token dashboard không? | Không |
| Có in DATABASE_URL/JWT_SECRET/ADMIN_PASSWORD/FB token/NGROK_AUTHTOKEN không? | Không |
| Có query Ngrok inspection API không? | Không |
| Có lưu screenshot/log chứa token vào repo không? | Không |

`prisma validate` và script local smoke có thể load env để ứng dụng chạy, nhưng report/terminal không in giá trị secret.

## 12. Docs changed

- `docs/META_WEBHOOK_STAGING_READINESS.md`
- `docs/META_WEBHOOK_STAGING_RUNBOOK.md`
- `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/CURRENT_STATUS_INDEX.md`
- `report/PROMPT_22B_META_VERIFY_CHALLENGE_REPORT.md`

## 13. Không thay đổi

- Không sửa `backend/src/**`.
- Không sửa `dashboard/src/**`.
- Không sửa `backend/prisma/**`.
- Không sửa package/package-lock.
- Không sửa Dockerfile/start scripts/docker-compose.
- Không sửa `.env`, `.env.local`, `.next`, backup, temp/log.
- Không sửa source để làm smoke pass.
- Không gọi Meta/Facebook Graph API thật.
- Không gửi Meta POST event thật.
- Không production rollout.
- Không push remote.

## 14. Remaining warnings

- Meta Verify Challenge chưa operator-confirmed PASS.
- Chưa gửi correct-token challenge bằng Meta Developer.
- Chưa gửi/nhận Meta POST event thật.
- Ngrok session phải còn chạy khi người vận hành bấm Verify and Save.
- Production rollout vẫn PENDING.

## 15. Final verdict

**PASS WITH WARNINGS**

Local runtime PASS, local smoke PASS và public Ngrok smoke không dùng secret PASS. Meta Verify Challenge vẫn pending vì chưa có xác nhận từ Meta UI. Không claim Meta verified, không claim đã nhận event thật và không claim production ready.

## 16. Next step

Người vận hành vào Meta Developer và verify thủ công:

- Callback URL: `https://backspace-scrambler-stuck.ngrok-free.dev/webhook`.
- Verify Token: lấy từ `FB_VERIFY_TOKEN` trong env thật, không in ra terminal/report.

Mục tiêu kế tiếp là ghi nhận `META_VERIFY_CHALLENGE_OPERATOR_CONFIRMED_PASS` nếu Meta UI Verify and Save thành công. Sau đó mới mở prompt test POST event thật và quan sát log redaction.
