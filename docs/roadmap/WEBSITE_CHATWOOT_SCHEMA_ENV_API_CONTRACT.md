# WEBSITE CHATWOOT SCHEMA / ENV / API CONTRACT

Ngay cap nhat: 2026-07-15
Trang thai: **PLANNED / DOCS_ONLY / NOT_STARTED_RUNTIME**

## 1. Decision summary

Prompt 23B chot ke hoach cho Website Chatwoot hybrid channel ma khong code runtime, khong tao migration, khong sua schema va khong sua env.

Quyet dinh:

- Facebook Messenger tiep tuc di direct qua Express `GET/POST /webhook`.
- Website live-chat se di theo pipeline rieng neu duoc code o 23C+.
- Khong dung Chatwoot cho Facebook.
- Khong khoi phuc `/chatwoot-webhook*`.
- Endpoint tuong lai giu theo ADR 23A: `POST /integrations/website-chat/events`.
- Data model khuyen nghi cho prompt migration sau: **generic `TenantIntegration`**, khong them lai `Tenant.chatwoot*`.
- Feature flag de xuat: `WEBSITE_CHAT_ENABLED=false` mac dinh cho 23C skeleton.

## 2. Current system facts

| Fact | Bang chung | Ket luan |
|---|---|---|
| Facebook direct webhook da co | `GET/POST /webhook` trong backend runtime | Khong doi trong Phase 23. |
| `/api/settings/webhook` la dashboard config endpoint | Settings route co auth | Khong dung lam Meta callback hoac Website Chatwoot callback. |
| Legacy Chatwoot route da bi remove | Smoke/report truoc do ghi `/chatwoot-webhook` 404 | Khong khoi phuc. |
| `ChannelConfig`/`TenantChannelConfig` da co | Prisma schema hien tai | Chi phu hop routing/filter nhe, khong phu hop luu credential. |
| Credential crypto helper da co | `backend/src/infrastructure/services/credentialCrypto.js` | Co the dung cho token/secret encrypted trong prompt code sau. |
| Dashboard API facade da co channel configs | `dashboard/src/lib/api.ts` | UI Website channel nen them API rieng sau, khong nham voi Facebook pages. |

## 3. Data model audit

| Option | Schema change | Uu diem | Rui ro | Rollback | Migration risk | Khuyen nghi |
|---|---|---|---|---|---|---|
| Reuse `ChannelConfig` / `TenantChannelConfig` | Khong can migration neu chi dung field hien co | Nhanh, it code hon, co san tenant scope va dashboard list | Khong co field encrypted token/secret/base URL/account id; `channelType` dang lan `facebook/web/whatsapp/email`; de nham Website Chatwoot voi channel routing cu | Tat feature flag, khong tao record moi | Thap neu khong migration, nhung thieu du lieu de chay thuc | **Khong khuyen nghi lam data model chinh**; chi co the tham chieu routing/knowledgeFilter |
| Add generic `TenantIntegration` | Additive model moi | Tach integration secret khoi channel routing; mo rong provider khac; khong khoa vao Chatwoot; ro website-only | Can migration va UI/API moi; can tenant resolution chat che | Drop/disable table neu chua production; feature flag off | Trung binh, nhung additive va rollbackable | **Khuyen nghi** |
| Add provider-specific `WebsiteChatIntegration` | Additive model moi provider-specific | Ro nghia, nhanh cho Chatwoot | Khoa vao Chatwoot; neu doi provider se them model nua; ten de lam docs lai Chatwoot-centric | Feature flag off, migration rollback neu chua prod | Trung binh | Khong khuyen nghi cho giai doan dau |

Tra loi audit:

1. Co the reuse `ChannelConfig` / `TenantChannelConfig` cho Website Chatwoot khong? **Khong nen reuse lam data model chinh** vi thieu secret/token/base URL/account id va de nham channel routing voi integration credential.
2. Co nen tao generic `TenantIntegration` khong? **Co, khuyen nghi** cho migration sau neu Phase 23C/23D duoc duyet.
3. Co nen tao provider-specific `WebsiteChatIntegration` khong? **Khong nen o buoc dau**, tru khi san pham chac chan chi dung Chatwoot lau dai.
4. Secret/token nen luu o dau? Trong model integration moi voi cot encrypted, khong trong `Tenant` va khong trong dashboard public env.
5. Co helper ma hoa credential hien co dung duoc khong? **Co**: `encrypt`, `decrypt`, `encryptIfPresent`, `decryptIfPresent` trong `credentialCrypto.js`.
6. Model nao de gay nham giua Facebook channel va Website channel? `ChannelConfig.channelType` va `TenantChannelConfig.channelType` vi dang chua credential va da co `facebook/web/whatsapp/email`; `FacebookPage` vi chua token Facebook direct.

## 4. Recommended data model

Khuyen nghi migration sau 23B: tao additive model generic `TenantIntegration`.

Pseudo schema tham khao, **khong tao trong 23B**:

```prisma
model TenantIntegration {
  id                     String   @id @default(uuid())
  tenantId               String   @map("tenant_id")
  channel                String   @default("website_chat")
  provider               String   @default("chatwoot")
  displayName            String   @map("display_name")
  baseUrl                String?  @map("base_url")
  accountId              String?  @map("account_id")
  inboxId                String?  @map("inbox_id")
  apiTokenEncrypted      String?  @map("api_token_encrypted")
  webhookSecretEncrypted String?  @map("webhook_secret_encrypted")
  isEnabled              Boolean  @default(false) @map("is_enabled")
  config                 Json?
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")
  tenant                 Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, channel, provider, inboxId])
  @@index([tenantId, channel, isEnabled])
  @@map("tenant_integrations")
}
```

Design notes:

- `tenantId` nen bat buoc trong version dau de webhook website-chat resolve tenant ro rang.
- `channel` nen dung `website_chat`, khong dung `facebook`.
- `provider` co the la `chatwoot`, nhung model van generic cho provider khac.
- Token/secret luu encrypted bang `credentialCrypto`.
- `isEnabled=false` mac dinh de 23C skeleton khong tu xu ly event that.
- Khong them field `Tenant.chatwoot*`.
- Khong dung table nay cho Facebook direct token; Facebook tiep tuc dung path hien co.

## 5. Env policy

Env future chi la ke hoach, **khong them vao `.env`, `.env.example`, `.env.local` trong 23B**.

| Env name | Scope | Secret? | Runtime use | Log policy | Co them bay gio khong? |
|---|---|---|---|---|---|
| `WEBSITE_CHAT_ENABLED` | Backend server | Khong | Feature flag bat/tat endpoint skeleton | Log duoc boolean, khong log config khac | Khong |
| `WEBSITE_CHAT_PROVIDER` | Backend server | Khong | Default provider, vi du `chatwoot` | Log duoc ten provider neu can | Khong |
| `WEBSITE_CHAT_WEBHOOK_SECRET` | Backend server | Co | Shared secret fallback neu chua luu DB | Khong log | Khong |
| `WEBSITE_CHAT_BASE_URL` | Backend server | Co the nhay cam | Default base URL provider neu chua luu DB | Chi log hostname da redact neu can | Khong |
| `WEBSITE_CHAT_ACCOUNT_ID` | Backend server | Co the nhay cam | Default account id neu chua luu DB | Khong log raw | Khong |
| `WEBSITE_CHAT_INBOX_ID` | Backend server | Co the nhay cam | Default inbox id neu chua luu DB | Khong log raw | Khong |
| `WEBSITE_CHAT_API_TOKEN` | Backend server | Co | Outbound reply adapter | Khong log | Khong |

Phan biet bat buoc:

- Facebook direct env: `FB_VERIFY_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ID`; chi phuc vu direct `/webhook`.
- Website chat env: `WEBSITE_CHAT_*`; chi phuc vu website live-chat.
- Deprecated legacy Chatwoot env: `CHATWOOT_*`; khong dung lai de dua Facebook qua Chatwoot hoac khoi phuc `/chatwoot-webhook*`.

## 6. API endpoint contract

Endpoint tuong lai:

```text
POST /integrations/website-chat/events
```

Auth/signature:

- Yeu cau provider signature header hoac shared secret header.
- 23C co the implement skeleton disabled: neu `WEBSITE_CHAT_ENABLED` khong true thi tra `404` hoac `403` theo policy chot trong prompt code.
- Signature sai: `401` hoac `403`, khong tiet lo ly do chi tiet.

Expected headers du kien:

```text
Content-Type: application/json
X-Website-Chat-Provider: chatwoot
X-Website-Chat-Event-Id: <provider-event-id>
X-Website-Chat-Signature: <signature>
X-Website-Chat-Tenant: <tenant-slug-or-id-if-approved>
```

Request contract pseudo, khong phai payload Chatwoot that:

```json
{
  "provider": "chatwoot",
  "eventId": "provider-event-id",
  "eventType": "message_created",
  "tenantHint": "tenant-slug-or-id",
  "accountId": "provider-account-id",
  "inboxId": "provider-inbox-id",
  "conversationId": "provider-conversation-id",
  "sender": {
    "id": "provider-contact-id",
    "type": "contact"
  },
  "message": {
    "id": "provider-message-id",
    "direction": "incoming",
    "type": "text",
    "text": "REDACTED_IN_DOCS"
  },
  "timestamp": "2026-07-15T00:00:00.000Z"
}
```

Normalized event fields:

| Field | Required? | Ghi chu |
|---|---|---|
| `provider` | Co | `chatwoot` trong giai doan dau. |
| `eventId` | Co | Idempotency key chinh. |
| `eventType` | Co | Chi xu ly allowlist event type. |
| `tenantId` | Co sau resolve | Resolve tu DB integration, khong tin client raw. |
| `inboxId` | Co | Match integration record. |
| `providerConversationId` | Co | Khong log raw neu co PII. |
| `providerSenderId` | Co | Mask trong log. |
| `messageText` | Co voi text event | Khong log/report raw. |
| `receivedAt` | Co | Timestamp normalized. |

Tenant resolution strategy:

1. Resolve by `provider + channel=website_chat + accountId + inboxId`.
2. Neu co `tenantHint`, chi dung lam hint va verify lai voi DB.
3. Require integration `isEnabled=true`.
4. Reject neu match 0 hoac >1 integration.

Status/error policy:

| Status | Khi nao |
|---|---|
| `200` | Event duplicate da xu ly hoac provider can ACK ngay. |
| `202` | Event hop le duoc nhan va enqueue/async xu ly. |
| `400` | Payload invalid, thieu event type/id/inbox id. |
| `401` | Thieu signature/shared secret. |
| `403` | Signature sai hoac integration disabled. |
| `409` | Event id duplicate neu chon explicit conflict. |
| `500` | Loi noi bo generic, khong log raw payload. |

Retry behavior:

- Provider retry phai an toan nho idempotency key.
- Duplicate event khong tao message/outbound reply lan hai.
- Khong outbound spam khi retry.

Redacted log policy:

- Khong log raw body.
- Khong log token/secret/signature.
- Khong log message text.
- Khong log full sender id/contact id/conversation id provider.
- Chi log metadata da mask: provider, event type, id hash/mask, tenant id noi bo neu an toan, status.

## 7. Security requirements

- Feature flag mac dinh off.
- Signature/shared secret verify truoc normalize sau.
- Rate limit theo provider/inbox/tenant neu endpoint bat public.
- Body size limit rieng cho integration endpoint.
- Strict event type allowlist.
- Idempotency storage/strategy truoc outbound reply.
- Tenant resolution khong dua hoan toan vao client-supplied tenant hint.
- Credential encrypted at rest.
- Khong dua token vao dashboard public env.
- Khong dung endpoint nay cho Facebook.

## 8. Clean Architecture file plan

Khong tao file code trong 23B. Cau truc tuong lai:

```text
backend/src/presentation/http/routes/integrations/websiteChat.routes.js
backend/src/presentation/http/controllers/integrations/websiteChat.controller.js
backend/src/application/website-chat/normalizeWebsiteChatEvent.usecase.js
backend/src/application/website-chat/handleWebsiteChatMessage.usecase.js
backend/src/domain/website-chat/websiteChatEvent.js
backend/src/infrastructure/integrations/website-chat/chatwootWebsiteClient.js
backend/src/infrastructure/integrations/website-chat/websiteChatSignatureVerifier.js
backend/src/infrastructure/repositories/websiteChatIntegrations.repository.js
```

Rules:

- Presentation route mong, khong chua business rule dai.
- Application normalize va hand off sang bot/RAG/handoff.
- Domain chua event/value object khong import Prisma/Express.
- Infrastructure chua provider client/verifier/repository.
- 23C chi inbound skeleton disabled/mocked.
- 23D moi outbound adapter mock.
- 23E moi dashboard UI.
- 23F moi staging real event.

## 9. Testing plan

- Static validation: backend quality, Prisma validate, dashboard typecheck/build.
- Unit fixture local voi payload pseudo da redact.
- Signature verifier tests voi secret gia, khong dung secret that.
- Idempotency smoke: same event id khong tao double handling.
- Disabled flag smoke: endpoint khong xu ly khi `WEBSITE_CHAT_ENABLED` off.
- Runtime local mock, khong external.
- Log scan: khong raw text/full id/token/signature.
- Dashboard full route/static smoke neu co UI/source change.
- Broken-link check docs/report.

## 10. Rollback plan

- Feature flag off.
- Endpoint disabled.
- Khong dung `/chatwoot-webhook*` lam rollback.
- Neu migration additive chua production, rollback migration theo quy trinh rieng.
- Neu da production, disable integration record thay vi destructive drop.
- Facebook `/webhook` giu nguyen.

## 11. Prompt 23C readiness checklist

23C chi duoc bat dau neu:

- 23B PASS va commit xong.
- Confirm van chap nhan endpoint `POST /integrations/website-chat/events`.
- Chap nhan generic `TenantIntegration` hoac co prompt rieng neu doi model.
- Feature flag `WEBSITE_CHAT_ENABLED` duoc thong nhat, default off.
- 23C scope chi skeleton disabled/mocked, khong external Chatwoot.
- Khong sua Facebook `/webhook`.
- Khong khoi phuc `/chatwoot-webhook*`.
- Co fixture redacted va log-safety checklist.

## 12. Open questions

| Cau hoi | Trang thai 23B | Ghi chu |
|---|---|---|
| Website chat co bat buoc tenant-specific khong? | Khuyen nghi co | Version dau nen require tenant id/slug resolve qua integration. |
| Co can platform/global website inbox khong? | Chua chot | Neu can, phai co `tenantId` nullable va rule rieng. |
| Idempotency luu o dau? | Chua chot | Co the can `IntegrationEvent` table hoac unique field trong message/context. |
| Chatwoot signature format thuc te la gi? | Chua chot | 23C/23D can doc docs chinh thuc neu code verifier that. |
| Outbound reply sync hay async? | Chua chot | 23D se mock adapter va retry policy. |
