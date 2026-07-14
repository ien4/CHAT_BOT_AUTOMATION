# HYBRID CHANNEL ARCHITECTURE ADR

Ngay cap nhat: 2026-07-14
Trang thai: **ADR_ACCEPTED / DOCS_ONLY**

## 1. Quyet dinh

Chap nhan mo hinh hybrid o cap kien truc, voi dieu kien:

- Facebook Messenger van di direct qua Express `/webhook`.
- Website Live-chat co the dung Chatwoot nhu mot kenh rieng.
- Chatwoot khong duoc lam trung gian cho Facebook.
- Legacy `/chatwoot-webhook*` khong duoc khoi phuc.
- Route Website Chatwoot tuong lai phai dung endpoint moi, ten moi, ro pham vi website-only.

Quyet dinh nay thay the cach dien dat "No-Chatwoot" tuyet doi trong current docs. Cach hieu moi la: **No-Chatwoot cho Facebook path; Website Chatwoot la kenh optional/planned rieng, chua co runtime**.

## 2. Vi sao thay doi

- Facebook can toc do, kiem soat webhook, bot/RAG/handoff truc tiep.
- Website can live-chat widget va agent console tien cho nhan vien.
- Tach pipeline giup khong lan Meta App Review voi Website Chatwoot.
- Kien truc cu dua Facebook qua Chatwoot da bi loai bo; ADR nay khong khoi phuc kien truc cu do.

## 3. Luong muc tieu

Facebook:

```text
Khach Messenger
-> Meta Developer Webhook
-> GET/POST /webhook
-> Express backend
-> Bot/RAG/Handoff
-> Facebook Send API
```

Website:

```text
Khach website
-> Chatwoot Widget
-> Chatwoot Website Inbox
-> Website-channel webhook endpoint moi cua Express
-> Bot/RAG/Handoff
-> Chatwoot API reply
-> Agent co the can thiep trong Chatwoot UI
```

## 4. Dieu khong duoc lam

- Khong dung `/chatwoot-webhook`.
- Khong dung `/chatwoot-webhook/:slug`.
- Khong dung `/api/settings/webhook` lam callback Meta.
- Khong dua Facebook message qua Chatwoot.
- Khong luu token tho.
- Khong log message text/raw body/full sender id/token/secret.
- Khong claim production ready khi chua smoke production.
- Khong claim Website Chatwoot da hoat dong khi chua co code, schema, env va runtime smoke rieng.

## 5. Ten endpoint de xuat cho tuong lai

| Option | Path | Ro nghia | Khong dung Meta `/webhook` | Khong dung legacy `/chatwoot-webhook*` | Bao mat/mo rong | Danh gia |
|---|---|---|---|---|---|---|
| A | `POST /api/webhooks/website-chat` | Kha ro, nhung nam trong namespace `/api` dang dung cho dashboard API | PASS | PASS | Co the gay nham voi API co auth dashboard | Chap nhan duoc nhung khong toi uu |
| B | `POST /integrations/website-chat/events` | Ro day la integration inbound event | PASS | PASS | De them provider khac ngoai Chatwoot, de gan verifier/rate-limit rieng | **Khuyen nghi** |
| C | `POST /webhooks/website-chatwoot` | Ro provider Chatwoot | PASS | PASS | Provider-specific, kho mo rong hon neu sau nay doi provider | Chap nhan duoc neu muon khoa Chatwoot |

Khuyen nghi chon **Option B: `POST /integrations/website-chat/events`** cho prompt tuong lai vi ten endpoint tach khoi Meta `/webhook`, khong dung lai legacy route, va khong khoa domain vao Chatwoot neu sau nay can website chat provider khac.

Prompt 23A **khong code endpoint nay**.

## 6. Data model dinh huong

Khong tu y them lai field legacy `Tenant.chatwoot*`.

Phai audit truoc:

- Co the dung `ChannelConfig` / `TenantChannelConfig` hien tai khong?
- Co can model moi `WebsiteChatIntegration` khong?
- Co can generic `TenantIntegration` khong?
- Secret/token phai ma hoa bang helper credential hien co hoac co che tuong duong.
- Schema migration neu co phai additive, rollbackable, dung `prisma migrate deploy`, khong dung `db push`.

Nhan dinh hien tai: chua chon migration trong 23A. Viec chon data model thuoc 23B sau khi audit schema that va dashboard contract.

## 7. Security design

Bat buoc co:

- verify webhook signature hoac shared secret cua website-channel provider,
- idempotency event id,
- tenant resolution ro,
- redacted logs,
- rate limit/throttle neu can,
- khong raw body leak,
- khong token leak,
- khong outbound spam,
- safe retry handling.

Moi log cua website-chat channel chi duoc ghi metadata da redact: event type, provider, tenant id da mask neu can, conversation id noi bo neu an toan, status va error code generic.

## 8. Clean Architecture target

Presentation:

- route nhan event website-chat mong.

Application:

- use case normalize website chat event,
- route vao bot/RAG/handoff,
- quyet dinh bot reply/handoff.

Domain:

- channel message/value object,
- tenant/channel mapping,
- handoff decision neu can.

Infrastructure:

- Chatwoot website adapter/client,
- repository channel config,
- credential encryption,
- webhook signature verifier.

## 9. Phased rollout

| Phase | Noi dung |
|---|---|
| Phase 23A | ADR + impact audit, docs-only. |
| Phase 23B | Schema/env/API contract plan, docs-only hoac migration create-only neu duoc duyet. |
| Phase 23C | Website Chatwoot inbound skeleton behind disabled feature flag. |
| Phase 23D | Chatwoot reply adapter + redacted log smoke bang mock/local only. |
| Phase 23E | Dashboard UI quan tri Website channel. |
| Phase 23F | Staging real Website Chatwoot event test. |
| Phase 24 | Production rollout sau Meta/Facebook path on dinh. |

## 10. Trang thai hien tai

| Hang muc | Trang thai |
|---|---|
| ADR | **ADR_ACCEPTED / PLANNED** |
| Code runtime | **NOT_STARTED** |
| Schema | **NOT_STARTED** |
| Dashboard UI | **NOT_STARTED** |
| Website Chatwoot smoke | **NOT_STARTED** |
| Facebook Meta verify | **PENDING / BLOCKED** neu chua co operator confirmation |
| Production | **PENDING** |

Prompt 23A khong sua runtime source, khong khoi phuc `/chatwoot-webhook*`, khong doi Facebook `/webhook`, khong them env that va khong claim production ready.
