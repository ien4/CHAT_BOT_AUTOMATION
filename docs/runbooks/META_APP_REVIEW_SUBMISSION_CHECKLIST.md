# META APP REVIEW SUBMISSION CHECKLIST

Ngay cap nhat: 2026-07-15
Pham vi: Facebook Messenger direct webhook cua **Chatbot_Automation / BBOTECH Bot Automation**.
Trang thai: **REVIEW_READY_DOCS / OPERATOR_PENDING**. Chua claim Meta verified, chua claim production ready.

## 1. Callback va endpoint dung

| Muc | Gia tri can dung | Ghi chu |
|---|---|---|
| Callback URL | `https://<public-domain>/webhook` | Khong dung `/api/settings/webhook`; route do chi la dashboard config/read co auth. |
| Verify token | Gia tri trong secret manager/env staging | Khong dua token vao docs, screenshot, video, log hoac chat. |
| GET verify route | `GET /webhook` | Source mount trong `backend/src/index.js`, handler `verifyWebhook`. |
| POST event route | `POST /webhook` | Source mount trong `backend/src/index.js`, handler `handleMessage`. |
| Legacy Chatwoot route | `/chatwoot-webhook*` | Khong khoi phuc; smoke hien tai 404. |
| Website Chatwoot tuong lai | `POST /integrations/website-chat/events` | Chi la plan 23B, khong lien quan Facebook App Review hien tai. |

## 2. Quyen Meta can review

| Quyen | De xuat | Ly do / dieu kien giu |
|---|---|---|
| `pages_messaging` | Giu | Can nhan va tra loi Messenger event qua `POST /webhook`. |
| `pages_manage_metadata` | Giu neu app setup webhook/subscription/menu/profile tu dashboard/backend | Can chung minh trong video neu gui review. |
| `pages_show_list` | Giu neu dashboard/operator can chon Page doanh nghiep | Can video buoc chon Page. |
| `pages_read_engagement` | Xem lai / go bo neu khong co use case ro | Chi giu neu video co man doc engagement/insight can quyen nay. |
| `business_management` | Xem lai / go bo neu khong quan ly Business assets | Chi giu neu co use case Business Manager ro va video minh hoa. |

Nguyen tac: xin it quyen nhat co the. Quyen nao khong co man hinh demo, khong co source path dung that, hoac khong can cho flow App Review thi nen go khoi submission.

## 3. Video App Review nen the hien

1. Dang nhap dashboard noi bo bang tai khoan test Meta co the dung; khong hien secret/token.
2. Chon/kiem tra Facebook Page hop le trong dashboard neu xin `pages_show_list`.
3. Cau hinh webhook/page/menu neu xin `pages_manage_metadata`.
4. Gui tin nhan Messenger tu user test den Page staging.
5. Backend nhan event qua `POST /webhook` va tra loi qua Messenger, khong thong qua Chatwoot.
6. Dashboard hien conversation/message/handoff lien quan neu can chung minh luong van hanh.
7. Neu khong demo duoc `pages_read_engagement` hoac `business_management`, go quyen do khoi submission.

## 4. Tai khoan va du lieu test

- Dung Page test/staging, khong dung Page production that neu chua co rollout.
- Dung user/tester Meta duoc add vao app/Page.
- Khong dua ho ten/SĐT/email khach that vao video.
- Khong mo DevTools/log co token, page access token, verify token, API key, base64 anh hoac message PII.
- Neu can conversation sample, dung noi dung gia lap khong PII.

## 5. Bang chung source hien tai

| Hang muc | Bang chung |
|---|---|
| Direct Facebook callback | `backend/src/index.js` mount `GET /webhook`, `POST /webhook`. |
| Verify challenge | `backend/src/webhook/handler.js` doc `hub.mode`, `hub.verify_token`, `hub.challenge`, tra challenge khi token khop. |
| POST object filter | Handler chi xu ly `body.object === 'page'`; object khac 404. |
| Log webhook | Handler dung masked sender/recipient/page id, boolean/length metadata. |
| Legacy Chatwoot | Scan `backend/src` khong co `/chatwoot-webhook*` runtime; smoke local 404. |
| Website Chatwoot | Trang thai docs-only/planned; khong anh huong Facebook path. |

## 6. Checklist truoc khi bam Submit for Review

- [ ] Public HTTPS URL con song va tro dung `/webhook`.
- [ ] Meta Developer callback verify da duoc operator xac nhan, khong dua token vao docs.
- [ ] Test event Messenger that da toi backend staging va co reply hop le.
- [ ] Video khong lo secret/PII/log raw message.
- [ ] Quyen xin review khop voi man hinh demo.
- [ ] Go `pages_read_engagement` neu khong demo doc engagement/insight.
- [ ] Go `business_management` neu khong demo quan ly Business asset.
- [ ] Xac nhan `/api/settings/webhook` khong duoc dien vao Meta callback.
- [ ] Xac nhan `/chatwoot-webhook*` khong duoc dung cho Facebook.
- [ ] Chay lai backend smoke: `/health` 200, `GET /webhook` thieu params 403, legacy `/chatwoot-webhook` 404.

## 7. Dieu khong duoc claim

- Khong claim Meta verified neu chua co verify challenge that trong Meta UI.
- Khong claim Meta POST event pass neu chua co event that tu Messenger/Page.
- Khong claim production ready neu chua backup DB, `prisma migrate deploy`, smoke production that.
- Khong claim Website Chatwoot runtime ready; 23B moi la plan docs-only.
