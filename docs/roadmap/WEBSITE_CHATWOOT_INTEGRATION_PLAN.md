# WEBSITE CHATWOOT INTEGRATION PLAN

Ngay cap nhat: 2026-07-14
Trang thai: **PLANNED / NOT_STARTED**

## 1. Muc tieu

Tao kenh Website live-chat qua Chatwoot, tach biet hoan toan khoi Facebook direct webhook.

## 2. Non-goals

- Khong dua Facebook vao Chatwoot.
- Khong khoi phuc legacy Chatwoot route cu.
- Khong sua production khi chua staging pass.
- Khong thay the `/webhook`.
- Khong them env that, schema, package hoac runtime trong Prompt 23A.

## 3. Current system audit

Hien trang:

- Facebook direct route san: `GET /webhook` cho Meta verify va `POST /webhook` cho Meta event.
- `/api/settings/webhook` chi la dashboard config/read endpoint co auth, khong phai Meta callback.
- Chatwoot runtime cu da bi remove khoi target runtime; `/chatwoot-webhook*` khong phai route moi va khong duoc khoi phuc.
- Schema legacy Chatwoot da bi remove trong migration no-Chatwoot sau Phase 08.
- Dashboard hien khong co UI Website Chatwoot moi.
- Phase 22 Meta dang blocked vi thieu `META_VERIFY_OPERATOR_CONFIRMED=YES`.
- Phase 21 backend monolith van started, nhung viec Website Chatwoot khong anh huong truc tiep den route consolidation hien tai.

## 4. Proposed modules

Chua code trong Prompt 23A. Neu duoc duyet, cac module tuong lai co the la:

- `backend/src/presentation/http/routes/integrations/websiteChat.routes.js`
- `backend/src/presentation/http/controllers/integrations/websiteChat.controller.js`
- `backend/src/application/use-cases/website-chat/normalizeWebsiteChatEvent.js`
- `backend/src/application/use-cases/website-chat/handleWebsiteChatMessage.js`
- `backend/src/domain/value-objects/ChannelMessage.js`
- `backend/src/domain/value-objects/WebsiteChatEvent.js`
- `backend/src/infrastructure/integrations/chatwoot/websiteChatClient.js`
- `backend/src/infrastructure/integrations/chatwoot/websiteChatSignatureVerifier.js`
- `backend/src/infrastructure/repositories/websiteChatIntegrations.repository.js`

Ten file co the doi sau audit schema va style repo that.

## 5. Env variables de xuat

Chi neu 23B/23C duoc duyet, co the can cac bien sau. Prompt 23A khong them vao env that:

- `WEBSITE_CHAT_PROVIDER`
- `WEBSITE_CHAT_WEBHOOK_SECRET`
- `WEBSITE_CHAT_BASE_URL`
- `WEBSITE_CHAT_ACCOUNT_ID`
- `WEBSITE_CHAT_INBOX_ID`
- `WEBSITE_CHAT_API_TOKEN`

Chinh sach:

- Khong them vao `.env` that trong Prompt 23A.
- Neu them env example sau nay thi phai cap nhat `docs/policies/ENV_POLICY.md`.
- Secret khong duoc in/log/commit.
- Khong dung `NEXT_PUBLIC_*` cho token/secret Chatwoot.
- Tranh tai su dung nguyen xi `CHATWOOT_*` legacy neu ten do gay nham voi kien truc Facebook cu.

## 6. API contract du kien

Khuyen nghi:

| Hang muc | Gia tri du kien |
|---|---|
| Method | `POST` |
| Path | `/integrations/website-chat/events` |
| Auth/signature | Provider signature hoac shared secret server-only; reject neu thieu/sai |
| Request normalization | Chuyen payload Chatwoot Website Inbox thanh message event noi bo, khong log raw body |
| Response status | `200`/`202` cho event hop le da nhan; `400` payload invalid; `401`/`403` signature invalid; `409` duplicate idempotency neu can |
| Error handling | Error response generic, log redacted metadata |
| Idempotency | Bat buoc dung event id/provider id de tranh xu ly lap |

Endpoint nay khong duoc nam tren `/webhook`, `/chatwoot-webhook` hoac `/api/settings/webhook`.

## 7. Database plan options

| Option | Mo ta | Uu diem | Rui ro | Trang thai 23A |
|---|---|---|---|---|
| Reuse existing channel config | Dung `ChannelConfig` / `TenantChannelConfig` neu phu hop | It migration hon | Co the map sai semantic Facebook/Website | Can audit |
| Add generic integration table | Tao `TenantIntegration` generic | Mo rong duoc provider khac | Can migration va dashboard UI moi | Can plan 23B |
| Add provider-specific table | Tao `WebsiteChatIntegration` | Ro nghia cho website-chat | De bi khoa vao Chatwoot neu dat ten qua cu the | Can plan 23B |

Khong chon migration ngay neu chua audit schema that. Neu can migration thi phai additive, rollbackable va deploy bang `prisma migrate deploy`.

## 8. Testing plan

- Static validation.
- Unit smoke bang fixture da redact.
- Runtime smoke local khong external.
- Mock Chatwoot webhook.
- Redacted logs.
- Khong raw text/full id/token.
- Dashboard route/static smoke.
- Broken-link check docs/report.
- Khong gui POST `/webhook` cua Meta trong cac prompt Website Chatwoot.

## 9. Rollback plan

- Feature flag off.
- Endpoint disabled.
- Remove env only.
- No schema destructive migration.
- Preserve Facebook `/webhook`.
- Khong dung lai `/chatwoot-webhook*` de rollback.

## 10. Prompt sequence de xuat

| Prompt | Muc tieu |
|---|---|
| 23A | ADR / audit only. |
| 23B | Schema/env/API plan. |
| 23C | Inbound skeleton disabled. |
| 23D | Outbound adapter mock. |
| 23E | Dashboard UI. |
| 23F | Staging real event. |

Dieu kien mo 23B: nguoi van hanh chap nhan ADR, dong y ten endpoint khuyen nghi va xac nhan chua can production rollout.
