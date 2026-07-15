# BACKEND CLEAN CODE AUDIT MATRIX

Ngay cap nhat: 2026-07-15
Prompt: **BE-01/4 - Backend clean code audit + CI baseline + Facebook webhook App Review readiness**
Verdict: **PASS WITH WARNINGS / AUDIT BASELINE**

Tai lieu nay la source-of-truth ngan cho prompt backend tiep theo. BE-01 chi audit, them CI baseline va runbook Meta App Review; khong refactor source runtime vi cac module con lai deu co PII, external provider, handoff state, tenant scope hoac secret adjacency.

## 1. Audit matrix

| Khu vực | Hiện trạng | Rủi ro | Có clean không? | Có dễ bảo trì không? | Ưu tiên xử lý | Prompt sau |
|---|---|---|---|---|---|---|
| `backend/src/index.js` | 334 dong; Express setup, DB connect, seed defaults, reset handoff, setup Facebook menu, init Telegram/notifications. | Startup co side effect external Facebook/Telegram neu tu start local; kho smoke neu khong muon external. | Mot phan | Trung binh thap | P1 sau App Review | BE-03 bootstrap split/side-effect guard |
| `backend/src/api/dashboard.js` | 1986 dong; van la monolith route cho auth, conversations, knowledge, providers, content, appointments, staff, handoff, Facebook, analytics, tenants. | PII, tenant scope, secret adjacency, external Graph API, raw SQL tagged, mutation adjacency. | Khong | Khong | P0 theo tung domain rieng | BE-03/BE-04 domain-specific |
| `backend/src/webhook/**` | Direct Meta callback `GET/POST /webhook`; verify challenge, page lookup, rate limit, DB message save, handoff/bot/Graph send. | App Review critical; khong duoc refactor rong truoc khi Meta verify/event that. | Mot phan | Trung binh | P0 smoke + log audit | BE-02 log redaction, then App Review checkpoint |
| `backend/src/facebook/**` | Messenger profile/menu helper, Graph API calls, page menu setup. | External provider, token adjacency, log error response tu Graph can review. | Mot phan | Trung binh | P0/P1 | BE-02 provider log redaction |
| `backend/src/bot/**` | Agent/engine/tools/dialog xu ly LLM, appointments, package actions, memory/context. | Log raw sender/payload o mot so diem; PII/content co the vao tool logs. | Mot phan | Trung binh thap | P0 | BE-02 bot/LLM log redaction |
| `backend/src/rag/**` | Pipeline/doc parser, embeddings, scrape URL, pgvector/tagged raw SQL. | Content/file/source URL co the nhay cam; external scrape/embedding; can smoke rieng. | Mot phan | Trung binh | P1 | BE-03 RAG boundary/test |
| `backend/src/tenants/**` | Registry kha gon; `handoff.js` lon, stateful, gan staff/telegram/conversation. | Tenant isolation + PII + timers; log preview/customer metadata can lo thong tin. | Mot phan | Thap | P0 | BE-04 tenant handoff hardening |
| `backend/src/telegram/**` | Telegram bot/handoff; `handoff.js` 762 dong, debug file/log preview. | Staff chat id, fbUserId, message preview, bot response preview; high PII. | Khong | Thap | P0 | BE-02/BE-04 log + handoff |
| `backend/src/notifications/**` | Health/daily/alert/formatters, startup async sau bot init. | Operational logs and DB reads; can affect runtime startup. | Mot phan | Trung binh | P2 | BE-03 notifications isolation |
| `backend/src/infrastructure/**` | Repositories/services/persistence da dung cho route read split. | Thap neu tiep tuc theo pattern cu; can khong dua logic provider/PII vao repository vo toi va. | Co | Co | P2 | Extend only for safe read routes |
| `backend/src/presentation/**` | Thin controllers/routes cho settings/prompts/quick replies/channel configs/campaigns/stats/admin-users. | Thap; pattern tot cho route da tach. | Co | Co | P2 | Reuse pattern khi co domain prompt ro |
| `backend/src/application/**`, `backend/src/domain/**` | Chu yeu README/shell, chua la runtime chinh. | Rung khi move logic lon vao shell ma chua co tests. | Shell sach | N/A | P2 | Chi them use case khi co prompt domain |
| `backend/scripts/**` | Scripts ad hoc; nhieu file tao `new PrismaClient`; con legacy Chatwoot refs trong scripts. | Khong runtime, nhung de gay nham lan va secret/log risk neu chay sai. | Khong dong nhat | Trung binh thap | P1 | BE-02 scripts cleanup plan |
| `backend/prisma/**` | Schema 297 dong + migrations. | High blast radius, khong duoc dung trong BE-01. | On dinh | Trung binh | P0 guard | Migration prompt rieng neu can |
| `.github/workflows/ci.yml` | Moi them CI baseline backend/dashboard. | CI khong co DB service/secret, chi static build/validate. | Co | Co | P0 maintain | Mo rong sau khi co test suite |

## 1b. BE-02 update — log redaction hardening (2026-07-15)

Da them helper `backend/src/infrastructure/services/redaction.js` (`maskId/summarizeText/safeError/redactObjectKeys/isPresent`) va giam log risk o cac vung high-risk:

- `facebook/menu.js`: bo log `error.response.data` (provider body) → `safeError`.
- `bot/engine.js`, `bot/agent.js`: mask sender id, bo ten khach, chi log length/present.
- `llm/claude.js`, `llm/deepseek.js`: tool input/result → `summarizeText` (chi length/present).
- `telegram/handoff.js`: mask `fbUserId`/`telegramChatId`, bo raw message content, provider error → `safeError`.
- `api/dashboard.js`: test-message log → mask sender + summarize message.

Con lai (accepted/deferred low-risk): stack trace debug, ten staff noi bo, `webhook/handler.js` (da redact tu BE-01). Chi tiet: `report/phase-21/PROMPT_BE_02_CI_AND_LOG_REDACTION_REPORT.md`. CI backend job da fix thieu `DATABASE_URL` placeholder cho `prisma validate`.

## 1c. BE-03 update — startup side-effect split (2026-07-15)

Da tach `backend/src/index.js`:
- `backend/src/app.js` moi: `createApp()` chi dung Express app (middleware + routes + error handler), KHONG listen/DB connect/seed/Facebook/Telegram/notification/process handler → import-safe cho test/smoke.
- `index.js`: runtime entrypoint; toan bo startup side-effect (`prisma.$connect`, seed, `facebookMenu.setupAllPages`, `app.listen`, `telegramBot.init`, `healthChecker/dailyReport.start`, process handlers) nam trong `start()` va chi chay khi `require.main === module`.
- `backend/scripts/check-import-app.js` + script `check:app-import`: verify import createApp khong side-effect; da them vao CI backend job.

Route/middleware/`GET|POST /webhook`/`/api/*`/`/health` giu nguyen. Smoke `createApp()` tren port tam (khong external): health 200, webhook 403, chatwoot 404, guards 401, invalid login 401 → PASS. `index.js` startup side-effect risk: **giam** (chi chay o runtime entrypoint). Chi tiet: `report/phase-21/PROMPT_BE_03_STARTUP_SIDE_EFFECT_SPLIT_REPORT.md`.

## 2. Module khong nen dung truoc App Review

- `backend/src/webhook/**` behavior xu ly Meta callback.
- `backend/src/facebook/**` menu/subscription/page Graph API behavior.
- Handoff path: `backend/src/tenants/handoff.js`, `backend/src/telegram/handoff.js`, dashboard handoff routes.
- Bot/RAG response path: `backend/src/bot/**`, `backend/src/rag/**`, `backend/src/llm/**`.
- Tenant registry/core routes va provider secret handling.
- Prisma schema/migrations, env real, package lock.

## 3. Module co the xu ly o BE-02/BE-03

- BE-02 nen la **log redaction/safety hardening**: bot/engine/agent/tools, telegram/tenant handoff, RAG/docParser/pipeline, Facebook menu error logs, dashboard test-message logs.
- BE-03 nen la **bootstrap/side-effect isolation**: tach startup khoi `index.js` de local smoke khong vo tinh goi Facebook/Telegram.
- Neu tiep tuc route split, mo prompt rieng theo tung domain high-risk, co smoke/rollback rieng. Khong tiep tuc `21B` kieu "safe small route" vi 21B-6 da ket luan `NO_SAFE_CANDIDATE`.

## 4. Module can test/smoke rieng

- Facebook webhook verify + POST event that tu Meta.
- Facebook page/menu/subscription route voi token staging hop le, khong in token.
- Handoff lifecycle: bot -> pending_human -> human_active -> force-end.
- RAG scrape/upload/reindex/search voi file/content test khong PII.
- Tenant isolation: platform admin vs tenant admin, nested tenant routes, conversation/message visibility.
- Provider/LLM: tool logs, API key masking, provider fallback.

## 5. Ket luan

Backend hien tai co nen tang tot hon sau cac route read da tach, nhung chua du goi la clean architecture hoan chinh. Vung con lai deu la high-risk. BE-01 khong sua source runtime vi patch nho khong du de giam risk; huong dung tiep theo la BE-02 log redaction va App Review readiness checkpoint.
