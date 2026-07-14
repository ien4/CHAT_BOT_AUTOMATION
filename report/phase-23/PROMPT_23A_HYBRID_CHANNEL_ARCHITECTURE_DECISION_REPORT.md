# PROMPT 23A - HYBRID CHANNEL ARCHITECTURE DECISION REPORT

Ngay thuc hien: 2026-07-14
Final verdict: **PASS**

## 1. Muc tieu

Ghi nhan Architecture Decision Record cho mo hinh hybrid:

- Facebook Messenger di direct qua Express `GET/POST /webhook`.
- Website live-chat co the dung Chatwoot nhu kenh rieng neu duoc duyet.
- Chatwoot khong lam trung gian cho Facebook.
- Khong khoi phuc `/chatwoot-webhook*`.
- Khong code runtime trong Prompt 23A.

## 2. Preflight

| Check | Ket qua |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit nen | `3d59f44 Consolidate another safe backend read route` ton tai |
| Working tree truoc patch | Sach, chi ignored `.env`, `.next`, `node_modules`, backups, `tmp-runtime` |
| `dashboard/.next` ignored | PASS trong preflight khi artifact ton tai |
| `backend/.env`, `dashboard/.env.local` ignored | PASS |
| Tracked env that | Khong co; chi `backend/.env.example` la sample tracked hop le |

Khong doc hoac in `.env` that, token, secret, database URL hoac dashboard auth token.

## 3. Context files read

- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/PROJECT_PHASE_BOARD.md`
- `docs/status/BUG_TRACKER.md`
- `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/policies/ENV_POLICY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/FEATURE_INVENTORY.md`
- `report/phase-21/PROMPT_21B_5_BACKEND_ROUTE_CONSOLIDATION_OR_NO_SAFE_CANDIDATE_REPORT.md`
- `report/phase-22/PROMPT_22C_META_REAL_EVENT_REPORT.md`
- `report/README.md`

## 4. Baseline validation

| Lenh | Ket qua |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| Root `git diff --check` truoc docs update | PASS |
| Root `git diff --name-status` truoc docs update | Sach |

## 5. Existing No-Chatwoot conflict audit

Lenh audit:

```powershell
rg -n "No-Chatwoot|Chatwoot|chatwoot|CHATWOOT|/chatwoot-webhook|webhook" docs report backend/src dashboard/src backend/prisma backend/.env.example dashboard/.env.example
```

| Nhom | File | Noi dung hien tai | Loai | Co can doi khong? | Ghi chu |
|---|---|---|---|---|---|
| Current source of truth dang ghi No-Chatwoot | `docs/status/PROJECT_PROGRESS_MASTER.md`, `docs/index/CURRENT_STATUS_INDEX.md`, `docs/status/PROJECT_STATUS_MASTER.md`, `docs/status/PROJECT_PHASE_BOARD.md` | Target hien tai ghi No-Chatwoot tuyet doi | Current docs | Co | Da doi thanh "No-Chatwoot cho Facebook path; Website Chatwoot optional/planned". |
| Historical reports | `report/phase-17/**`, `report/phase-18/**`, `report/phase-19/**`, `report/phase-20/**`, `report/phase-21/**`, `report/phase-22/**`, `report/archive/**` | Luu lai qua trinh remove Chatwoot, smoke `/chatwoot-webhook` 404 va Meta staging | Audit trail | Khong | Giu nguyen lam lich su, khong rewrite report cu. |
| Runtime source da remove Chatwoot | `backend/src`, `dashboard/src` | Khong co route runtime `/chatwoot-webhook*`; con direct `/webhook` va dashboard tenant webhook wording | Runtime source | Khong trong 23A | Prompt docs-only, khong sua source. |
| Env example da remove Chatwoot | `backend/.env.example`, `dashboard/.env.example` | Khong co `CHATWOOT_*` target moi; co Facebook webhook env | Env sample | Khong trong 23A | Future Website Chatwoot env chi nam trong policy/plan, chua them env example. |
| Schema da remove legacy fields | `backend/prisma/migrations/**` | Migration lich su co add/drop Chatwoot fields | Schema history | Khong | Migrations lich su giu nguyen; khong sua schema. |
| DevOps/scripts co text legacy | Docs/report scan nhac `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt` | Legacy local script/backlog | Historical/DevOps backlog | Khong trong 23A | Khong chay scripts nay; khong sua script trong prompt docs-only. |
| Docs kien truc can doi | `docs/architecture/ARCHITECTURE.md`, `docs/architecture/FEATURE_INVENTORY.md`, `docs/policies/ENV_POLICY.md`, roadmap/status docs | Mot so doan con de hieu la Chatwoot bi cam tuyet doi | Current docs | Co | Da cap nhat de phan biet Facebook path va Website optional channel. |

## 6. Architecture decision

ADR accepted/planned:

- Facebook Messenger van di direct qua Express `GET/POST /webhook`.
- Website live-chat co the dung Chatwoot nhu kenh rieng neu duoc duyet.
- Chatwoot khong duoc lam trung gian cho Facebook.
- Legacy `/chatwoot-webhook*` khong duoc khoi phuc.
- Website Chatwoot tuong lai phai dung endpoint moi, website-only.

File ADR: `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`.

## 7. Facebook direct flow

```text
Khach Messenger
-> Meta Developer Webhook
-> GET/POST /webhook
-> Express backend
-> Bot/RAG/Handoff
-> Facebook Send API
```

Prompt 23A khong doi route, handler, token, Meta status hoac public callback URL.

## 8. Website Chatwoot planned flow

```text
Khach website
-> Chatwoot Widget
-> Chatwoot Website Inbox
-> Website-channel webhook endpoint moi cua Express
-> Bot/RAG/Handoff
-> Chatwoot API reply
-> Agent co the can thiep trong Chatwoot UI
```

Trang thai: **NOT_STARTED**. Chua co route, adapter, data model, env example, dashboard UI hoac smoke.

## 9. Endpoint naming decision

Da danh gia:

- Option A: `POST /api/webhooks/website-chat`
- Option B: `POST /integrations/website-chat/events`
- Option C: `POST /webhooks/website-chatwoot`

Khuyen nghi: **Option B** vi ro nghia integration event, khong dung Meta `/webhook`, khong dung legacy `/chatwoot-webhook*`, de bao mat bang verifier/rate-limit rieng va de mo rong ngoai Chatwoot.

Khong code endpoint trong Prompt 23A.

## 10. Data model options

| Option | Trang thai | Ghi chu |
|---|---|---|
| Reuse `ChannelConfig` / `TenantChannelConfig` | Can audit | It migration hon nhung can tranh nham semantic Facebook/Website. |
| New generic `TenantIntegration` | Can plan 23B | Mo rong tot, can migration additive. |
| New provider-specific `WebsiteChatIntegration` | Can plan 23B | Ro nghia nhung co nguy co khoa provider. |

Khong them lai field legacy `Tenant.chatwoot*`. Neu can migration sau nay: additive, rollbackable, dung `prisma migrate deploy`, khong dung `db push`.

## 11. Env/secret policy impact

Da cap nhat `docs/policies/ENV_POLICY.md`:

- Facebook env rieng cho direct Meta webhook.
- Website chat env future rieng, server-only.
- Deprecated legacy `CHATWOOT_*` khong dung lai de dua Facebook qua Chatwoot.

Bien du kien chi nam trong docs plan, khong them env that:

- `WEBSITE_CHAT_PROVIDER`
- `WEBSITE_CHAT_WEBHOOK_SECRET`
- `WEBSITE_CHAT_BASE_URL`
- `WEBSITE_CHAT_ACCOUNT_ID`
- `WEBSITE_CHAT_INBOX_ID`
- `WEBSITE_CHAT_API_TOKEN`

## 12. Security requirements

Bat buoc cho 23C+ neu code:

- verify signature hoac shared secret,
- idempotency event id,
- tenant resolution ro,
- redacted logs,
- rate limit/throttle,
- khong raw body leak,
- khong token leak,
- khong outbound spam,
- safe retry handling.

## 13. Clean Architecture target

Presentation:

- route website-chat mong, chi verify va map request/response.

Application:

- normalize website chat event,
- route vao bot/RAG/handoff,
- quyet dinh bot reply/handoff.

Domain:

- channel message/value object,
- tenant/channel mapping,
- handoff decision.

Infrastructure:

- Chatwoot website adapter/client,
- repository channel config/integration,
- credential encryption,
- webhook signature verifier.

## 14. Roadmap Prompt 23B-23F

| Prompt | Muc tieu |
|---|---|
| 23B | Schema/env/API contract plan. |
| 23C | Website Chatwoot inbound skeleton behind disabled feature flag. |
| 23D | Chatwoot reply adapter + redacted log smoke bang mock/local. |
| 23E | Dashboard UI quan tri Website channel. |
| 23F | Staging real Website Chatwoot event test. |

## 15. Docs updated

- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/PROJECT_PHASE_BOARD.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/policies/ENV_POLICY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/FEATURE_INVENTORY.md`
- `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`
- `docs/roadmap/WEBSITE_CHATWOOT_INTEGRATION_PLAN.md`
- `report/phase-23/README.md`
- `report/phase-23/PROMPT_23A_HYBRID_CHANNEL_ARCHITECTURE_DECISION_REPORT.md`

## 16. Validation

| Lenh | Ket qua |
|---|---|
| `cd backend && npm run quality` sau docs update | PASS |
| `cd backend && npx prisma validate` sau docs update | PASS |
| `cd dashboard && npm run typecheck` sau docs update | PASS |
| `cd dashboard && npm run build` sau docs update | PASS |
| Root `git diff --check` | PASS, chi co LF/CRLF warning tren Windows |
| Root `git diff --name-status` | Docs/report-only diff |

## 17. Dashboard regression gate

| Gate | Ket qua |
|---|---|
| Port audit | `3002` co dashboard Next server cu PID `24800`; `3019/3020/3021` ranh |
| Stop old dashboard server | PASS, chi dung PID `24800` thuoc workspace dashboard |
| Clean `.next` | PASS, verified `dashboard/.next` roi xoa |
| Rebuild sau clean | Dashboard typecheck/build PASS |
| Fresh dev server | PASS tren `127.0.0.1:3019`, PID `29968` |
| Route smoke | PASS: 15 route that 200, `/dashboard/__fake_23a__` 404 |
| Static asset smoke | PASS: 83/83 `_next/static` assets 200 |
| Dev log scan | PASS: `DEV_LOG_HITS=0` |
| Cleanup | PASS: da dung PID `29968`, port 3019 free |

## 18. Broken-link check

Trang thai: **PASS**.

Ket qua:

- Tong path refs da scan trong `docs/` va `report/`: **1019**.
- Broken live path: **0**.
- File ADR moi ton tai: `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`.
- File roadmap moi ton tai: `docs/roadmap/WEBSITE_CHATWOOT_INTEGRATION_PLAN.md`.
- File report moi ton tai: `report/phase-23/PROMPT_23A_HYBRID_CHANNEL_ARCHITECTURE_DECISION_REPORT.md`.

## 19. Forbidden areas unchanged

Khong sua:

- `backend/src/**`
- `dashboard/src/**`
- `backend/prisma/**`
- package/package-lock
- Dockerfile/start scripts/docker-compose
- `.env`, `.env.local`
- `.next`, logs, temp, backup

Khong goi Chatwoot/Meta/Facebook/Telegram/LLM external. Khong gui POST `/webhook`. Khong khoi phuc `/chatwoot-webhook*`. Khong claim Meta verified. Khong claim production ready.

## 20. Final verdict

**PASS**

Bat buoc tra loi:

- Co code runtime nao duoc sua khong? **Khong**.
- Co khoi phuc `/chatwoot-webhook*` khong? **Khong**.
- Facebook `/webhook` co doi khong? **Khong**.
- Website Chatwoot da runtime chua? **Chua, NOT_STARTED / PLANNED**.
- Schema/env/package co doi khong? **Khong**.
- Meta status co doi khong? **Khong, van pending/block neu thieu operator confirmation**.
- Production status co doi khong? **Khong, van PENDING**.
- File ADR o dau? `docs/architecture/HYBRID_CHANNEL_ARCHITECTURE_ADR.md`.
- File roadmap Website Chatwoot o dau? `docs/roadmap/WEBSITE_CHATWOOT_INTEGRATION_PLAN.md`.
- Prompt tiep theo la gi? `23B` neu tiep tuc Website Chatwoot schema/env/API plan; hoac `21B-6-SAFE`/`NO_SAFE_CANDIDATE` neu quay lai backend route consolidation.

## 21. Next step

Khuyen nghi chay `23B_WEBSITE_CHATWOOT_SCHEMA_ENV_API_PLAN` neu muon tiep tuc kenh Website Chatwoot. Muc tieu 23B la chot data model option, env example policy, endpoint contract, feature flag va test plan ma van khong dung Facebook `/webhook` hoac legacy `/chatwoot-webhook*`.
