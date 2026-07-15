# PROMPT 23B - WEBSITE CHATWOOT SCHEMA ENV API CONTRACT REPORT

Ngay thuc hien: 2026-07-15
Final verdict: **PASS**

## 1. Muc tieu

Chot schema/env/API contract plan cho Website Chatwoot hybrid channel sau ADR 23A, nhung khong code runtime, khong tao migration, khong sua Prisma schema, khong sua env that/env example va khong sua package.

## 2. Preflight

| Check | Ket qua |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit nen | `d4d0b17 Document hybrid website chat architecture decision` ton tai |
| Working tree truoc patch | Sach, chi ignored `.env`, `.next`, `node_modules`, backups, `tmp-runtime` |
| `.next`, `backend/.env`, `dashboard/.env.local` ignored | PASS |
| Tracked env scan | Chi co `backend/.env.example` sample tracked hop le |

Khong doc hoac in env that.

## 3. Context read

- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`
- `docs/roadmap/WEBSITE_CHATWOOT_INTEGRATION_PLAN.md`
- `docs/policies/ENV_POLICY.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/phase-23/PROMPT_23A_HYBRID_CHANNEL_ARCHITECTURE_DECISION_REPORT.md`
- `backend/prisma/schema.prisma`
- `backend/src/api/dashboard.js`
- `backend/src/infrastructure/services/credentialCrypto.js`
- `backend/src/infrastructure/repositories/**`
- `backend/src/presentation/http/routes/**`
- `dashboard/src/lib/api.ts`
- `dashboard/src/lib/config/env.ts`

## 4. Baseline validation

| Lenh | Ket qua |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| Root `git diff --check` truoc patch | PASS |
| Root `git diff --name-status` truoc patch | Sach |

## 5. Schema/data model audit

| Option | Schema change | Uu diem | Rui ro | Rollback | Migration risk | Khuyen nghi |
|---|---|---|---|---|---|---|
| Reuse `ChannelConfig` / `TenantChannelConfig` | Khong can migration neu chi dung field hien co | Nhanh, da co tenant scope va dashboard CRUD | Thieu credential encrypted, webhook secret, base URL, account id; `channelType` de nham Facebook/web routing voi integration | Feature flag off, khong tao record moi | Thap nhung khong du de chay that | Khong dung lam model chinh |
| Add generic `TenantIntegration` | Additive model moi | Tach integration credential khoi channel routing, mo rong provider khac, ro website-only | Can migration/UI/API moi | Feature flag off; rollback migration neu chua prod | Trung binh, additive | **Khuyen nghi** |
| Add provider-specific `WebsiteChatIntegration` | Additive model moi | Ro Chatwoot website use case | Khoa provider, co the phai them model moi neu doi provider | Feature flag off | Trung binh | Khong khuyen nghi buoc dau |

Ket luan audit:

- `ChannelConfig`/`TenantChannelConfig` chi nen lam routing/filter reference, khong nen luu token/secret.
- `FacebookPage` chua token Facebook direct, khong lien quan Website Chatwoot.
- `Conversation.channel` co the dung gia tri `website_chat` sau nay, nhung 23B khong sua schema.
- Helper `credentialCrypto.js` co the dung cho token/secret encrypted trong prompt code sau.

## 6. Recommended data model

Khuyen nghi: **generic `TenantIntegration`** trong prompt migration/code sau.

Design:

- `tenantId` required trong version dau de tenant resolution ro.
- `channel = website_chat`.
- `provider = chatwoot`.
- `apiTokenEncrypted` va `webhookSecretEncrypted` dung `credentialCrypto`.
- `isEnabled=false` default.
- `config Json?` cho provider-specific metadata.
- Unique de tranh duplicate theo tenant/channel/provider/inbox.

Khong them lai `Tenant.chatwoot*`.

## 7. Env policy decision

Env future docs-only:

- `WEBSITE_CHAT_ENABLED`
- `WEBSITE_CHAT_PROVIDER`
- `WEBSITE_CHAT_WEBHOOK_SECRET`
- `WEBSITE_CHAT_BASE_URL`
- `WEBSITE_CHAT_ACCOUNT_ID`
- `WEBSITE_CHAT_INBOX_ID`
- `WEBSITE_CHAT_API_TOKEN`

23B khong them vao `.env`, `.env.example` hoac `.env.local`.

## 8. API contract

Endpoint tuong lai:

```text
POST /integrations/website-chat/events
```

Contract:

- Require signature/shared secret.
- Expected metadata headers: provider, event id, signature, tenant hint neu duoc duyet.
- Normalize provider payload thanh internal website-chat event.
- Tenant resolution tu DB integration, khong tin raw tenant hint.
- Idempotency key: provider event id.
- Response policy: `200/202`, `400`, `401`, `403`, `409`, `500`.
- Khong log raw body, token, signature, message text hoac full sender/conversation id.

## 9. Security plan

- Feature flag default off.
- Signature verify truoc khi xu ly.
- Event type allowlist.
- Body size/rate limit rieng.
- Idempotency truoc outbound reply.
- Credential encrypted at rest.
- Log redaction bat buoc.
- Khong dung endpoint nay cho Facebook.

## 10. Clean Architecture plan

Tuong lai, khong tao code trong 23B:

- `backend/src/presentation/http/routes/integrations/websiteChat.routes.js`
- `backend/src/presentation/http/controllers/integrations/websiteChat.controller.js`
- `backend/src/application/website-chat/normalizeWebsiteChatEvent.usecase.js`
- `backend/src/application/website-chat/handleWebsiteChatMessage.usecase.js`
- `backend/src/domain/website-chat/websiteChatEvent.js`
- `backend/src/infrastructure/integrations/website-chat/chatwootWebsiteClient.js`
- `backend/src/infrastructure/integrations/website-chat/websiteChatSignatureVerifier.js`
- `backend/src/infrastructure/repositories/websiteChatIntegrations.repository.js`

## 11. Roadmap rut gon 23C-23F

| Prompt | Scope | Co code? | External? | Dieu kien PASS |
|---|---|---|---|---|
| 23B | Schema/env/API contract | Khong | Khong | Docs ro, validation pass |
| 23C | Inbound skeleton disabled | Co | Khong | Local mock smoke pass |
| 23D | Outbound adapter mock | Co | Khong that | Redacted mock smoke pass |
| 23E | Dashboard UI website channel | Co | Khong that | Dashboard full gate pass |
| 23F | Staging real website event | Co cau hinh | Co kiem soat | Real event pass, logs safe |

## 12. Docs updated

- `docs/roadmap/WEBSITE_CHATWOOT_SCHEMA_ENV_API_CONTRACT.md`
- `docs/roadmap/WEBSITE_CHATWOOT_INTEGRATION_PLAN.md`
- `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`
- `docs/policies/ENV_POLICY.md`
- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/PROJECT_PHASE_BOARD.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/phase-23/README.md`
- `report/phase-23/PROMPT_23B_WEBSITE_CHATWOOT_SCHEMA_ENV_API_CONTRACT_REPORT.md`

## 13. Validation/gate

Trang thai: **PASS**.

| Gate | Ket qua |
|---|---|
| Backend `npm run quality` sau docs update | PASS |
| Backend `npx prisma validate` sau docs update | PASS |
| Dashboard `npm run typecheck` sau docs update | PASS |
| Dashboard `npm run build` sau docs update | PASS |
| Root `git diff --check` | PASS, chi co LF/CRLF warning tren Windows |
| Root `git diff --name-status` | Docs/report-only diff |
| Port audit | `3002/3019/3020/3021` ranh |
| Clean `.next` | PASS, da xoa `dashboard/.next` sau khi verify path |
| Rebuild sau clean | PASS |
| Fresh dev server | PASS tren `127.0.0.1:3019`, PID `28832` |
| Route smoke | PASS: 15 route that 200, `/dashboard/__fake_23b__` 404 |
| Static asset smoke | PASS: 83/83 `_next/static` assets 200 |
| Dev log scan | PASS: `DEV_LOG_HITS=0` |
| Cleanup | PASS: dung PID `28832`, port 3019 free |

## 14. Broken-link check

Trang thai: **PASS**.

- Tong path refs scan trong `docs/` va `report/`: **1049**.
- Broken live path: **0**.
- File contract moi ton tai: `docs/roadmap/WEBSITE_CHATWOOT_SCHEMA_ENV_API_CONTRACT.md`.
- File report moi ton tai: `report/phase-23/PROMPT_23B_WEBSITE_CHATWOOT_SCHEMA_ENV_API_CONTRACT_REPORT.md`.

## 15. Forbidden areas unchanged

Khong sua:

- `backend/src/**`
- `dashboard/src/**`
- `backend/prisma/schema.prisma`
- Prisma migrations
- `.env`, `.env.example`, `.env.local`
- package/package-lock
- dependency
- runtime route
- `/webhook`
- `/chatwoot-webhook*`

Khong goi external Chatwoot/Meta/Facebook/Telegram/LLM. Khong gui POST `/webhook`.

## 16. Final verdict

**PASS**.

Bat buoc tra loi:

- Co sua runtime source khong? **Khong**.
- Co sua schema/migration khong? **Khong**.
- Co sua env that/env example khong? **Khong**.
- Recommended data model la gi? **Generic `TenantIntegration`**.
- Endpoint contract la gi? **`POST /integrations/website-chat/events`**.
- Feature flag de xuat la gi? **`WEBSITE_CHAT_ENABLED=false` mac dinh**.
- Facebook `/webhook` co doi khong? **Khong**.
- `/chatwoot-webhook*` co khoi phuc khong? **Khong**.
- Website Chatwoot runtime da co chua? **Chua, NOT_STARTED**.
- Prompt 23C co du dieu kien chua? **Co ve mat docs plan neu 23B validation/gate pass; 23C chi skeleton disabled/mocked, khong external**.

## 17. Next step

Neu tiep tuc Website Chatwoot, chay 23C inbound skeleton disabled/mocked. Muc tieu 23C: tao route skeleton sau feature flag off, verifier/mock fixture, local smoke an toan, khong external va khong doi Facebook `/webhook`.
