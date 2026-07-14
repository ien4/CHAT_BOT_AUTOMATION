# PROMPT 01 - PROJECT AUDIT + CLEAN ARCHITECTURE REPORT

Ngay tao bao cao: 2026-07-07  
Nguoi thuc hien: Codex  
Pham vi: audit doc kien truc, khong refactor source, khong migrate database, khong commit/push.

Ghi chu quan trong: prompt goc yeu cau tao bao cao trong `docs/`, nhung yeu cau moi cua nguoi dung yeu cau tao folder `report/`. Vi vay bao cao nay duoc tao tai `report/archive/early-prompts/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md`.

## 1. Executive Summary

Du an `BBOTECH_BOT_AUTOMATION-main` la he thong chatbot automation gom:

- Backend Node.js/Express dung CommonJS, Prisma, PostgreSQL/pgvector, LLM providers, Facebook webhook, Chatwoot webhook, Telegram handoff, RAG knowledge base, dashboard REST API.
- Dashboard Next.js 14 App Router, React 18, Tailwind CSS, axios client, auth context bang JWT/localStorage, nhieu trang quan tri chatbot.
- Database PostgreSQL voi Prisma schema va migrations cho conversation, message, appointment, staff, handoff, knowledge base, content packages, quick replies, Facebook pages, Chatwoot channel configs va multi-tenant.
- Docker Compose co PostgreSQL pgvector, backend, dashboard.
- Scripts Windows `.bat` dung de start/stop he thong local, ngrok, Cloudflare tunnel, Chatwoot va database setup.

Tinh trang hien tai: du an co nhieu tinh nang da duoc implement, nhung kien truc con tron giua presentation, application, domain va infrastructure. Backend co nhieu business rules, database query, webhook handling va integration logic nam chung trong route/controller/service files. Dashboard co cau truc route ro theo Next.js App Router, nhung feature logic, state, form, API call va UI nam truc tiep trong cac page lon.

Ket luan ngan: co the tiep tuc sang Prompt 02 de lap ke hoach Clean Architecture, nhung chua nen di chuyen file hoac refactor lon ngay. Can lap ban do import, alias, test/validation va tach theo tung vong nho.

## 2. Files/Folders Checked

Da kiem tra cac file/folder chinh:

- Root: `.gitignore`, `docker-compose.yml`, `ROADMAP.md`, `MULTITENANT_PROGRESS.md`, `start-all.bat`, `start_all.bat`, `stop-all.bat`, `test-bot.js`, `test-bot-simple.js`, `webhook-urls-current.txt`.
- Backend config: `backend/package.json`, `backend/package-lock.json`, `backend/Dockerfile`, `backend/.env.example`.
- Backend database: `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`, `backend/prisma/migrations_backup/README.md`.
- Backend data/scripts: `backend/data/seed.json`, `backend/scripts/**`.
- Backend source: `backend/src/index.js`, `api`, `webhook`, `tenants`, `bot`, `rag`, `llm`, `chatwoot`, `telegram`, `facebook`, `notifications`, `adapters`.
- Dashboard config: `dashboard/package.json`, `dashboard/package-lock.json`, `dashboard/next.config.js`, `dashboard/tailwind.config.js`, `dashboard/postcss.config.js`, `dashboard/tsconfig.json`, `dashboard/Dockerfile`.
- Dashboard source: `dashboard/src/app/**`, `dashboard/src/lib/api.ts`, `dashboard/src/lib/auth.tsx`, `dashboard/src/components/TenantScopeBanner.tsx`, `dashboard/src/app/globals.css`.
- Docs: `docs/archive/unclassified/appointment-modify-spec.md`.

Khong doc noi dung `.env` that. Chi doc `backend/.env.example` va chi liet ke ten bien.

## 3. Current Project Tree Summary

Root hien co:

```text
backend/
dashboard/
docs/
docker-compose.yml
ROADMAP.md
MULTITENANT_PROGRESS.md
start-all.bat
start_all.bat
stop-all.bat
test-bot.js
test-bot-simple.js
webhook-urls-current.txt
```

`backend/`:

- `src/index.js`: entry point Express server.
- `src/api/dashboard.js`: REST API cho dashboard, auth, stats, CRUD, tenant, analytics, settings, channel config.
- `src/webhook/`: Facebook webhook legacy va Chatwoot webhook owner/backward-compatible.
- `src/tenants/`: multi-tenant Chatwoot webhook, tenant registry/cache, tenant-specific Telegram handoff.
- `src/bot/`: agent, engine, tools, router, intents, context/dialog/suggestions.
- `src/rag/`: doc parser va RAG pipeline voi pgvector.
- `src/llm/`: Claude, DeepSeek, Gemini, Jina va factory.
- `src/chatwoot/`: API client, AES-GCM crypto, webhook signature validation.
- `src/telegram/`, `src/facebook/`, `src/notifications/`, `src/adapters/`: integration va notification logic.
- `prisma/`: schema va migrations PostgreSQL.
- `scripts/`: seed, check data, tenant token fix, ngrok/app URL update, Chatwoot agent bot URL update.

`dashboard/`:

- Next.js App Router trong `src/app`.
- `src/app/dashboard/*/page.tsx`: cac trang quan tri.
- `src/app/dashboard/layout.tsx`: dashboard shell, sidebar, tenant switcher.
- `src/lib/api.ts`: axios client va API wrapper.
- `src/lib/auth.tsx`: auth provider, JWT/localStorage, tenant scope.
- `src/components/TenantScopeBanner.tsx`: banner scope tenant/global.
- `src/app/globals.css`: Tailwind base va utility classes.

`docs/`:

- `appointment-modify-spec.md`: spec them tool sua/doi/huy lich hen. Qua code audit thay `reschedule_appointment` va `update_appointment` da co trong `backend/src/bot/tools.js`, can test doi chieu thay vi xem la chua lam.

## 4. Backend Analysis

### Runtime/framework

- Node.js, CommonJS.
- Express 4 lam HTTP server.
- Prisma Client + PostgreSQL + pgvector.
- `dotenv`, `cors`, `helmet`, `multer`, `jsonwebtoken`, `bcryptjs`.
- LLM providers: Claude, DeepSeek, Gemini, Jina.
- Messaging/integration: Facebook Graph API, Chatwoot API, Telegram Bot API.
- Parser/RAG: `cheerio`, `mammoth`, `pdf-parse`, vector search.

### Entry points

- `backend/package.json`
  - `start`: `node src/index.js`
  - `dev`: `node src/index.js`
  - `test`: placeholder fail intentionally.
  - `export`: tro den `scripts/export-knowledge.js`, nhung file nay khong ton tai.
  - `import`: tro den `scripts/import-knowledge.js`, nhung file nay khong ton tai.
- `backend/src/index.js`
  - Load env.
  - Tao Express app.
  - Dang ky middleware.
  - Dang ky `/webhook`, `/chatwoot-webhook`, `/chatwoot-webhook/:slug`, `/api`, `/health`.
  - Connect Prisma.
  - Reset stale handoff states ve `bot`.
  - Seed default admin, LLM providers, prompt templates, handoff settings.
  - Setup Facebook menu.
  - Init Telegram bot, tenant handoff, health checker, daily report.

### Main features

- Auth JWT cho dashboard admin.
- Dashboard REST API cho conversations, messages, knowledge, prompts, providers, quick replies, campaigns, content packages, appointments, staff, handoff, Facebook pages, channel configs, tenants, analytics.
- Facebook Messenger direct webhook legacy.
- Chatwoot owner webhook backward-compatible.
- Chatwoot per-tenant webhook `/chatwoot-webhook/:slug`.
- LLM agent loop voi tool calling.
- Appointment tools: create, check, cancel, reschedule, update.
- Knowledge/RAG search voi pgvector va fallback text search.
- Content package browsing va content item detail.
- Human handoff qua Telegram, ca legacy staff va tenant staff.
- Notification services: daily report, health checker, appointment notifications, alert queue.

### Database/Prisma usage

- Prisma singleton trong `backend/src/db.js`.
- Prisma duoc import truc tiep o nhieu layer: route API, bot agent/tools, webhook handlers, tenants handoff, RAG pipeline, scripts.
- RAG pipeline dung ca Prisma ORM va raw SQL.
- `KnowledgeBase.embedding` la `Unsupported("vector")`, phu thuoc pgvector.
- Mot so query dung `$queryRawUnsafe` voi string interpolation trong `backend/src/rag/pipeline.js`. Day la rui ro bao mat va nen duoc uu tien xu ly sau khi co test.

### Bot/webhook flow

Facebook direct legacy:

1. Facebook POST `/webhook`.
2. `backend/src/webhook/handler.js` lookup FacebookPage theo page entry id.
3. Rate limit sender in-memory.
4. Tao/tim conversation.
5. Luu inbound message.
6. Neu `human_active` hoac `pending_human` thi relay/append qua Telegram.
7. Neu khong co active dialog thi thu handoff.
8. Neu khong handoff thi goi `botEngine.processMessage`.
9. Gui reply qua Facebook Graph API.

Chatwoot owner/backward-compatible:

1. Chatwoot POST `/chatwoot-webhook`.
2. `backend/src/webhook/chatwootHandler.js` tra 200 ngay.
3. Skip non-incoming/private/system messages.
4. Dedup message id in-memory.
5. Resolve channel config.
6. Resolve user source id tu payload hoac Chatwoot API.
7. Tao/tim conversation.
8. Luu inbound.
9. Handoff neu can.
10. Goi bot engine va gui reply qua Chatwoot API.

Chatwoot tenant:

1. Chatwoot POST `/chatwoot-webhook/:slug`.
2. `backend/src/tenants/webhookHandler.js` load tenant tu registry/cache.
3. Validate HMAC neu tenant co webhook secret.
4. Tra 200 ngay.
5. Skip/dedup message.
6. Resolve channel config.
7. Adapt Chatwoot event thanh unified message.
8. Tao/tim conversation theo `chatwootConversationId` + `tenantId` hoac prefixed user id.
9. Luu inbound.
10. Handoff tenant neu can.
11. Goi bot engine voi `tenantId`, `knowledgeFilter`, `botPersonaOverride`.
12. Gui reply qua Chatwoot tenant client.

### Current backend issues/risks

- Layering chua ro: route API, use case, repository va integration logic dang tron.
- `backend/src/api/dashboard.js` qua lon, chua tach controller/use-case/service.
- Business rules ve tenant scope, appointment, handoff, RAG, content package dang nam trong infra/presentation files.
- CommonJS relative import day dac, khi move file de gay vo import.
- `$queryRawUnsafe` trong RAG insert/update la rui ro injection neu input chua sanitize du.
- `backend/src/index.js` auto seed default admin/provider/prompt luc start, co the gay khac biet moi truong neu chua kiem soat.
- `start-all.bat` dung `prisma db push --accept-data-loss`, khong an toan cho du lieu that.
- `backend/package.json` co script import/export tro den file khong ton tai.
- `bot/dialog.js` va `bot/suggestions.js` co ve la luong cu hoac chua duoc dung truc tiep trong engine hien tai, can xac minh truoc khi xoa.
- Script `check_tenant_config.js` co the in thong tin cau hinh nhay cam neu chay khong can than. Khong nen chay trong audit.

## 5. Dashboard Analysis

### Framework

- Next.js 14 App Router.
- React 18.
- TypeScript voi `strict: false`.
- Tailwind CSS.
- `lucide-react`, `axios`, `date-fns`, `react-hot-toast`.
- `next.config.js` dat `output: 'standalone'`.

### Routing structure

- `/`: redirect sang `/dashboard`.
- `/login`: trang dang nhap.
- `/dashboard`: overview stats.
- `/dashboard/conversations`: hoi thoai.
- `/dashboard/knowledge`: knowledge CRUD, upload, scrape, reindex.
- `/dashboard/prompts`: prompt template management.
- `/dashboard/campaigns`: campaign legacy.
- `/dashboard/content-packages`: package + items.
- `/dashboard/quick-replies`: quick reply menus.
- `/dashboard/channel-configs`: Chatwoot channel configs.
- `/dashboard/tenants`: tenant CRUD, webhook tab, staff tab, handoff tab.
- `/dashboard/analytics`: analytics.
- `/dashboard/appointments`: appointments.
- `/dashboard/staff`: legacy staff.
- `/dashboard/handoff`: legacy handoff monitor.
- `/dashboard/settings`: providers, webhook, Facebook pages/menu, Telegram destinations, Chatwoot test.

### UI structure

- `dashboard/src/app/dashboard/layout.tsx`: sidebar, topbar, tenant switcher.
- `dashboard/src/components/TenantScopeBanner.tsx`: thong bao dang xem global/tenant.
- `dashboard/src/app/globals.css`: shared classes `.card`, `.btn-primary`, `.input-field`, `.badge`, sidebar classes.
- Hien chua co component library tach rieng `components/ui`, `components/layout`, `features/*`.

### API/data fetching

- Chinh: `dashboard/src/lib/api.ts` tao axios instance, them Authorization header, them `tenantScope` tu localStorage.
- Auth: `dashboard/src/lib/auth.tsx` luu token/user/selectedTenantId trong localStorage.
- Mot so page van goi `fetch` thu cong, dac biet `dashboard/src/app/dashboard/settings/page.tsx`.
- Co hard-code `http://localhost:3001` trong `settings/page.tsx` va `campaigns/page.tsx`.

### Current dashboard issues/risks

- State, form, API call va rendering dang nam chung trong cac `page.tsx`, nhieu file rat lon.
- `auth.tsx` co fallback standalone login khi backend unreachable voi credential mac dinh mau. Nen xem lai truoc deploy.
- `settings/page.tsx` dung mix axios wrapper va fetch thu cong, de lech auth/tenant scope.
- Hard-code localhost lam rui ro deploy.
- `strict: false` trong TypeScript giam kha nang bat loi refactor.
- `dashboard lint` khong chay duoc vi chua co `node_modules`; chua xac minh build/lint that.

## 6. Database & Prisma Analysis

### Schema summary

Database provider: PostgreSQL. Prisma generator: `prisma-client-js`.

Main models:

- Auth/admin: `AdminUser`.
- LLM: `LlmProvider`.
- Knowledge/RAG: `KnowledgeBase`.
- Prompt: `PromptTemplate`.
- Campaign legacy: `Campaign`.
- Conversation/messaging: `Conversation`, `Message`.
- Appointment: `Appointment`.
- Legacy staff/handoff: `Staff`, `HandoffSetting`.
- Content package: `ContentPackage`, `ContentPackageItem`.
- Quick reply: `QuickReplyMenu`.
- Facebook config: `FacebookPage`.
- Telegram notification: `TelegramDestination`.
- Chatwoot owner channel: `ChannelConfig`.
- Multi-tenant: `Tenant`, `TenantChannelConfig`, `TenantStaff`.
- Handoff analytics/event: `HandoffEvent`.

### Migration status visible

Visible migrations:

- `20260610025032_init`: tao extension vector, core tables.
- `20260612094424_phase1_full_schema`: staff, handoff settings, knowledge fields, content packages, quick reply, Facebook pages.
- `20260613211500_add_telegram_destinations`.
- `20260614000000_channel_config`.
- `20260614120000_multitenant`.
- `20260615140000_add_handoff_events`.
- `20260615150000_add_conv_chatwoot_and_grace`.
- `20260615160000_add_tenant_id_to_missing_models`.
- `20260615170000_scope_conversation_by_tenant`.
- `20260616000000_add_tenant_id_to_admin_users`.

### Risks

- `Conversation` dang dung unique/index phuc tap quanh `fbUserId` + `tenantId`; can test ky khi refactor tenant flow.
- `KnowledgeBase.embedding` phu thuoc extension pgvector va Prisma unsupported vector type.
- Raw SQL trong RAG can duoc bao boc vao repository va chuyen sang parameterized query neu co the.
- `docker-compose.yml` dung service postgres voi DB name `chatbot`, trong khi `start-all.bat` co logic noi den container/database ten khac. Can xac minh moi truong local that su dung file nao.
- Khong duoc chay migration/db push trong Prompt 02 neu chua co backup va validation.

## 7. Docker/Deploy/Script Analysis

### Docker files

`backend/Dockerfile`:

- Node 20 Alpine.
- Cai openssl.
- `npm ci`.
- Copy Prisma va `npx prisma generate`.
- Copy `src`.
- Tao `uploads`.
- Expose `3001`.
- CMD chay `npx prisma migrate deploy && node src/index.js`.

Rui ro: container start se apply migrations. Tot cho deploy co kiem soat, nhung can can trong voi production va migration failed.

`dashboard/Dockerfile`:

- Multi-stage build.
- `npm ci`, copy source.
- Co block diagnostic grep/wc trong build.
- Build Next standalone.
- Runner expose `3000`, chay `node server.js`.

Rui ro: block diagnostic khong nen de lau trong Dockerfile production.

### docker-compose

- `postgres`: image `pgvector/pgvector:pg16`, port host `5433`, env file `backend/.env`.
- `backend`: build `./backend`, env file `backend/.env`, port `3001`.
- `dashboard`: build `./dashboard`, arg `NEXT_PUBLIC_API_URL`, port `3000`.

### start/stop/test scripts

- `start-all.bat` co cleanup process, Cloudflare tunnel, Chatwoot, dependency install, pgvector setup, `prisma db push --accept-data-loss`, ngrok, backend, dashboard.
- `start_all.bat` chi call `start-all.bat`.
- `stop-all.bat` kill windows va docker compose down trong `chatwoot/`.
- `test-bot.js`, `test-bot-simple.js` goi local backend va co the tao data test/knowledge neu backend dang chay.

Rui ro quan trong:

- Workspace hien tai khong co folder `chatwoot/`, nhung `start-all.bat` va `stop-all.bat` tham chieu folder nay.
- `start-all.bat` co thao tac `npm install` va `prisma db push --accept-data-loss`; khong chay trong Prompt 01/02 neu muc tieu chi la architecture.
- `webhook-urls-current.txt` chua URL public cu/stale va token/URL cau hinh. Khong nen copy gia tri nay vao prompt/report khac.
- Cac test script co the tao/doi data khi backend dang chay, nen khong chay trong audit read-only.

## 8. Current Architecture Diagnosis

Backend hien tai la kien truc mixed module, khong phai Clean Architecture:

- Presentation: `index.js`, `api/dashboard.js`, `webhook/*`, `tenants/webhookHandler.js`.
- Application/business logic: nam lan trong `bot/agent.js`, `bot/tools.js`, `tenants/handoff.js`, `telegram/handoff.js`, `api/dashboard.js`, `rag/pipeline.js`.
- Domain concepts: `Tenant`, `Conversation`, `Appointment`, `KnowledgeBase`, `Handoff` hien chu yeu nam trong Prisma schema va logic query, chua co entity/domain service rieng.
- Infrastructure: Prisma, Chatwoot, Telegram, Facebook, LLM, pgvector dang duoc goi truc tiep tu nhieu noi.
- Duplicated/parallel flows: legacy Facebook, Chatwoot owner, Chatwoot tenant; legacy staff/handoff va tenant handoff cung ton tai.
- Config/env: doc/script/docker co nhieu mac dinh local va hard-code.

Dashboard hien tai la App Router theo route, nhung chua feature-based:

- Page components lam qua nhieu viec: fetch, state, form, UI, action handler.
- `lib/api.ts` la API boundary duy nhat kha ro, nhung settings page van bypass bang fetch.
- Auth/session state tap trung o `lib/auth.tsx`, song token luu localStorage va standalone fallback can xem xet.

Files can list "needs verification", khong xoa:

- `backend/src/bot/dialog.js`: co dialog flow cu, nhung engine hien tai di qua agent/tool loop; webhook chi check `conversation.context.dialogState`.
- `backend/src/bot/suggestions.js`: co suggestion engine, can xac minh con duoc dung o dau khong.
- `backend/package.json` scripts `export`/`import`: tro file khong ton tai.
- `webhook-urls-current.txt`: co the la artifact local/stale.
- `start-all.bat`/`stop-all.bat`: tham chieu `chatwoot/` folder khong co trong workspace.

## 9. Clean Architecture Target Proposal

Khong move file trong Prompt 01. Day la mapping de Prompt 02 lap ke hoach.

### Backend target structure

```text
backend/src/
  domain/
    entities/
    value-objects/
    interfaces/
  application/
    use-cases/
    dtos/
    validators/
  infrastructure/
    persistence/
    prisma/
    repositories/
    bot/
    webhook/
    services/
  presentation/
    http/
    controllers/
    middleware/
    routes/
    main/
```

`domain/entities/`:

- Nen chua entity thuan: `Tenant`, `Conversation`, `Message`, `Appointment`, `KnowledgeDocument`, `PromptTemplate`, `ContentPackage`, `Staff`, `ChannelConfig`, `HandoffEvent`.
- Current source lien quan: Prisma schema, logic trong `bot/tools.js`, `tenants/handoff.js`, `api/dashboard.js`.
- Can kiem tra truoc khi move: field mapping Prisma `@map`, tenantId nullable/global semantics, status strings.
- Imports co the vo: tat ca code dang dung Prisma model truc tiep, chua co entity class/interface.

`domain/value-objects/`:

- Nen chua: `TenantSlug`, `ChannelType`, `HandoffStatus`, `AppointmentStatus`, `KnowledgeType`, `MessageDirection`, `WebhookSignature`.
- Current source lien quan: string literals trong webhook/handler, tenant handoff, tools, schema.
- Can kiem tra: cac string dang duoc DB/API/dashboard su dung.

`domain/interfaces/`:

- Nen chua contract: `ConversationRepository`, `KnowledgeRepository`, `AppointmentRepository`, `TenantRepository`, `LlmGateway`, `ChatGateway`, `NotificationGateway`, `WebhookVerifier`.
- Current source lien quan: `db.js`, `chatwoot/api.js`, `telegram/*`, `facebook/menu.js`, `llm/factory.js`, `rag/pipeline.js`.
- Can kiem tra: async boundary, error handling, DTO shape.

`application/use-cases/`:

- Nen chua: `ProcessIncomingMessage`, `ProcessTenantWebhookMessage`, `CreateAppointment`, `RescheduleAppointment`, `UpdateAppointment`, `SearchKnowledge`, `GetContentPackage`, `InitiateHandoff`, `ClaimHandoff`, `EndHandoff`, `GetDashboardStats`, `ManageTenant`.
- Current source lien quan: `bot/agent.js`, `bot/tools.js`, `webhook/*`, `tenants/*`, `api/dashboard.js`.
- Can kiem tra: side effects va transaction boundaries.

`application/dtos/` va `application/validators/`:

- Nen chua request/response shape cho auth, tenant, knowledge, prompt, appointment, webhook payload.
- Current source lien quan: inline req.body parsing trong `api/dashboard.js`, Chatwoot adapter, tool input schemas.
- Can kiem tra: dashboard client expectations va backward-compatible route responses.

`infrastructure/persistence/prisma/`:

- Nen chua Prisma client singleton, generated client access, schema-specific mapping.
- Current files co the move/split later: `db.js`, Prisma raw SQL parts trong `rag/pipeline.js`.
- Can kiem tra: Prisma Client singleton, generated client location, Docker `npx prisma generate`.

`infrastructure/repositories/`:

- Nen chua repository implementations dung Prisma.
- Current logic co the tach tu: `api/dashboard.js`, `bot/tools.js`, `bot/agent.js`, `tenants/handoff.js`, `rag/pipeline.js`.
- Can kiem tra: tenant scope filters va transaction logic.

`infrastructure/bot/`, `infrastructure/webhook/`, `infrastructure/services/`:

- Nen chua LLM providers, Chatwoot/Facebook/Telegram clients, webhook adapters, notification integrations, RAG implementation.
- Current files co the move later: `llm/*`, `chatwoot/*`, `facebook/*`, `telegram/*`, `notifications/*`, `adapters/*`, `rag/*`.
- Can kiem tra: env usage, retry/fallback, in-memory timers/cache.

`presentation/http/`:

- Nen chua Express app setup, routes, controllers, middleware.
- Current files co the move later: `index.js`, `api/dashboard.js`, `webhook/handler.js`, `webhook/chatwootHandler.js`, `tenants/webhookHandler.js`.
- Can kiem tra: Express raw body verify cho HMAC, route order, response timing 200-immediate cho webhook.

### Dashboard target structure

```text
dashboard/src/
  app/
  components/
    ui/
    layout/
    features/
  features/
    chatbot/
    tenants/
    analytics/
    settings/
    knowledge/
    appointments/
    content-packages/
  lib/
    api/
    auth/
    config/
    utils/
  styles/
```

`app/`:

- Giu Next.js routes/layouts.
- Page chi nen compose feature components, khong chua qua nhieu business logic.

`components/ui/`:

- Button, modal, input, badge, card, table, loading state.
- Current source: repeated UI trong cac `page.tsx`, `globals.css`.

`components/layout/`:

- Dashboard shell, sidebar, topbar, tenant scope switcher.
- Current source: `dashboard/src/app/dashboard/layout.tsx`.

`features/tenants/`:

- Tenant list/detail/form/webhook/staff/handoff analytics.
- Current source: `dashboard/src/app/dashboard/tenants/page.tsx`, `TenantScopeBanner.tsx`.

`features/knowledge/`:

- Knowledge table, filters, upload/scrape/reindex form.
- Current source: `dashboard/src/app/dashboard/knowledge/page.tsx`.

`features/content-packages/`:

- Package list, item list, item editor, migrate action.
- Current source: `dashboard/src/app/dashboard/content-packages/page.tsx`.

`features/settings/`:

- Provider settings, Facebook pages/menu, Telegram destinations, Chatwoot test.
- Current source: `dashboard/src/app/dashboard/settings/page.tsx`.

`lib/api/`:

- Tach `api.ts` thanh clients theo feature: auth, tenants, knowledge, appointments, settings, analytics.
- Can kiem tra: interceptor auth va tenantScope phai dung chung.

`lib/auth/`:

- Auth provider, token handling, tenant scope.
- Can kiem tra: standalone fallback va localStorage security.

`lib/config/`:

- API base URL, Chatwoot URL, app env access.
- Current hard-code localhost nen gom ve day truoc khi deploy/refactor.

## 10. What NOT To Change Yet

Chua nen thay doi trong Prompt 02 neu chua co plan/test:

- `backend/prisma/schema.prisma` va `backend/prisma/migrations/**`.
- `backend/src/index.js` startup flow, raw body middleware, webhook route order.
- `backend/src/webhook/*` va `backend/src/tenants/webhookHandler.js`.
- `backend/src/tenants/handoff.js` va `backend/src/telegram/handoff.js` vi co timer in-memory va race-condition logic.
- `backend/src/rag/pipeline.js` raw SQL/pgvector logic, tru khi Prompt 02 chi lap ke hoach.
- `backend/src/chatwoot/crypto.js` va HMAC validation.
- `backend/src/db.js` Prisma singleton.
- `dashboard/src/lib/api.ts` interceptor auth/tenant scope.
- `dashboard/src/lib/auth.tsx` cho den khi co auth test.
- `docker-compose.yml`, Dockerfile va `.bat` start/stop scripts.
- `webhook-urls-current.txt`, vi co the chua local URL/token stale.

## 11. Refactor Roadmap

### Phase 01: Documentation + architecture map only

- Goal: hoan thanh audit va map hien trang.
- Files likely affected: chi `report/*` hoac `docs/*`.
- Safety rule: khong source refactor, khong migration.
- Validation command: `rg --files`, `git status`, package/config inspection.
- Done criteria: bao cao nay ton tai, co current architecture va risk list.

### Phase 02: Add architecture docs and import alias plan

- Goal: tao tai lieu refactor plan chi tiet va quy tac import.
- Files likely affected: `report/`, co the them `docs/architecture/ARCHITECTURE.md`, `docs/roadmap/REFACTOR_PLAN.md`.
- Safety rule: khong move runtime files.
- Validation command: `rg -n "require\\(" backend/src`, `rg -n "@/|fetch\\(" dashboard/src`.
- Done criteria: co import dependency map, route map, feature map, validation checklist.

### Phase 03: Backend safe folder split

- Goal: tach presentation/application/infrastructure bang wrapper moi, khong doi behavior.
- Files likely affected: tao folder moi trong `backend/src`, tach nho route/controller truoc.
- Safety rule: moi lan chi move 1 cum, giu export compatibility.
- Validation command: `npm run --if-present lint`, `npx prisma validate`, smoke test health/auth/webhook neu dependency co san.
- Done criteria: backend start duoc, `/health`, `/api/auth/login`, webhook basic flow khong doi.

### Phase 04: Dashboard feature-based cleanup

- Goal: tach page lon thanh feature components va API clients theo feature.
- Files likely affected: `dashboard/src/app/dashboard/*`, `dashboard/src/features/*`, `dashboard/src/lib/api/*`.
- Safety rule: khong doi route URL va API response contract.
- Validation command: `npm run --if-present lint`, `npm run --if-present build`.
- Done criteria: dashboard build/lint pass, login/dashboard/tenant switcher hoat dong.

### Phase 05: Prisma/repository abstraction

- Goal: dua Prisma access vao repositories, tach use-case khoi infra.
- Files likely affected: `backend/src/db.js`, repositories moi, `bot/tools.js`, `api/dashboard.js`, `tenants/*`, `rag/*`.
- Safety rule: khong doi schema, khong migration.
- Validation command: Prisma validate, unit/smoke tests, DB query smoke trong local test DB.
- Done criteria: business logic khong import Prisma truc tiep ngoai infra/repositories.

### Phase 06: Tests + CI/CD check

- Goal: them test an toan cho critical flows.
- Files likely affected: test setup backend/dashboard, package scripts.
- Safety rule: test khong dung DB production, khong goi live LLM/Facebook/Chatwoot neu chua mock.
- Validation command: `npm test`, lint, typecheck, build.
- Done criteria: CI co lint/type/build/test co ban.

### Phase 07: Docker/deploy hardening

- Goal: chuan hoa env, ports, Docker, migrations, start scripts.
- Files likely affected: Dockerfile, compose, env example, scripts, deployment docs.
- Safety rule: khong dung `db push --accept-data-loss` cho production.
- Validation command: docker build, compose config, migration deploy dry-run/staging.
- Done criteria: deploy path ro, khong hard-code secret/default credential, ports/env dong nhat.

## 12. Validation Results

Da chay cac lenh doc-only/safe:

- `Get-Location`: workspace la `D:\bbo_team\Boss_Chau\Bot_Automation\BBOTECH_BOT_AUTOMATION-main`.
- `git status --short --branch`: fail, day khong phai git repository hoac thieu `.git`.
- `git branch --show-current`: fail cung ly do tren.
- `rg --files` voi ignore `node_modules`, `.next`, `dist`, `build`, `coverage`, `.git`, logs/cache: thanh cong, tao inventory.
- `Test-Path backend/node_modules`, `Test-Path dashboard/node_modules`: ca hai la `False`.
- `npm run --if-present lint` trong `backend`: exit 0, khong co lint script nen khong validate thuc te.
- `npm run --if-present lint` trong `dashboard`: fail vi `next` khong duoc nhan dien, do chua co `node_modules`.
- `npm run --if-present typecheck` trong `backend`: exit 0, khong co typecheck script.
- `npm run --if-present typecheck` trong `dashboard`: exit 0, khong co typecheck script.
- `npx --no-install prisma validate` trong `backend`: fail vi Prisma CLI khong co local package executable va khong duoc phep tai package.
- `rg TODO|FIXME|HACK|XXX` sau khi exclude lockfile: khong tim thay match co y nghia.
- `rg process.env`: tim thay nhieu env usages trong backend, scripts va dashboard; khong in gia tri secret.
- `backend/.env.example`: doc ten bien, gom `PORT`, `NODE_ENV`, `APP_BASE_URL`, `ENCRYPTION_KEY`, `DATABASE_URL`, Facebook, LLM, JWT, Telegram, Chatwoot va Postgres vars.

Khong chay:

- `npm install`: khong duoc phep trong prompt.
- `prisma migrate`, `prisma db push`: khong duoc phep.
- `docker compose up`: khong duoc phep.
- `npm run build`: khong chay vi chua co dependencies va build co the can cau hinh env.
- Test scripts root: khong chay vi co the tao/doi data khi backend dang chay.

## 13. Final Verdict

**PASS - ready for Prompt 02 planning**

Dieu kien: Prompt 02 nen la planning/documentation/import map, chua nen refactor code runtime ngay. Neu muon refactor code o Prompt 02, can cai dependencies, tao baseline validation va xac nhan DB/dev environment truoc.

## 14. Next Step & Goal

Recommended Prompt 02 goal:

> Tao tai lieu `docs/architecture/ARCHITECTURE.md` va `docs/roadmap/REFACTOR_PLAN.md` tu bao cao nay, lap dependency/import map chi tiet cho backend va dashboard, chuan hoa quy tac dat folder Clean Architecture, de xuat thu tu refactor nho an toan. Khong move source code, khong doi Prisma schema, khong chay migration.

Top next checks truoc khi code refactor:

- Xac nhan repo co can khoi tao git hay day la folder export khong co `.git`.
- Cai dependencies bang cach co chu dich neu muon validation that.
- Chay `npx prisma validate` sau khi co dependencies.
- Chay dashboard lint/build sau khi co dependencies.
- Xac minh `chatwoot/` folder va script import/export bi thieu la do export thieu hay da obsolete.
- Xac minh URL/env deploy va loai bo hard-code localhost/credential mau truoc production hardening.
