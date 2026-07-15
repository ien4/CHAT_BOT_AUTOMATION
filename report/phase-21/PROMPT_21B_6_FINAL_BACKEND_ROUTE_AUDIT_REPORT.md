# PROMPT 21B-6-FINAL - BACKEND ROUTE CONSOLIDATION FINAL AUDIT REPORT

Ngay thuc hien: 2026-07-15
Final verdict: **NO_SAFE_CANDIDATE**

## 1. Muc tieu

Ket thuc vong backend read-only route consolidation thong thuong cua Phase 21 mot cach ro rang:

- Neu con dung mot nhom route GET/read-only nho, an toan tuyet doi thi tach sang Clean Architecture layers.
- Neu khong con candidate du an toan thi dung voi verdict `NO_SAFE_CANDIDATE` va cap nhat docs/report.

Ket qua: **khong co candidate an toan**. Khong sua source runtime.

## 2. Preflight

| Check | Ket qua |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| HEAD truoc prompt | `8e5338f Plan website chat schema env and API contract` |
| Commit 23B | Ton tai trong `git log --oneline -550` |
| Working tree truoc docs | Sach, chi ignored artifacts |
| Ignored artifacts | `.claude/`, `backend/.env`, `backend/node_modules/`, `backups/`, `dashboard/.env.local`, `dashboard/.next/`, `dashboard/node_modules/`, `dashboard/tsconfig.tsbuildinfo`, `tmp-runtime/` |
| `.next` ignored | PASS |
| `backend/.env`, `dashboard/.env.local` ignored | PASS |
| Tracked env scan | Chi co `backend/.env.example` sample tracked hop le; khong co env that tracked/staged |

Khong doc hoac in secret/env that.

## 3. Context read

Da doc cac file/context bat buoc:

- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `report/phase-21/PROMPT_21B_5_BACKEND_ROUTE_CONSOLIDATION_OR_NO_SAFE_CANDIDATE_REPORT.md`
- `report/phase-23/PROMPT_23B_WEBSITE_CHATWOOT_SCHEMA_ENV_API_CONTRACT_REPORT.md`
- `backend/src/api/dashboard.js`
- `backend/src/infrastructure/repositories/**`
- `backend/src/presentation/http/controllers/dashboard/**`
- `backend/src/presentation/http/routes/dashboard/**`

Khong doc env that.

## 4. Baseline validation

| Lenh | Ket qua |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| `cd dashboard && npm run build` | PASS |
| Root `git diff --check` truoc docs | PASS |
| Root `git diff --name-status` truoc docs | Sach |

## 5. Final route map audit

Audit dua tren `rg -n "router\.(get|post|put|delete|patch)|router\.use" backend/src/api/dashboard.js` va doc truc tiep cac handler con lai.

| Route | Method | Guard | Prisma op | External? | Mutation? | Raw SQL? | Secret/token? | PII risk? | Da tach? | Decision |
|---|---|---|---|---|---|---|---|---|---|---|
| `/auth/me` | GET | `authMiddleware` | `adminUser.findUnique` select safe fields | No | No | No | No token/password response | Low/identity | No | Loai: auth/session core, khong phai read-route thuong |
| `/admin-users` | GET | `authMiddleware`, `platformAdminOnly` | `adminUser.findMany` select safe fields | No | No | No | No `passwordHash` | Low | Yes | Da tach o 21B-5 |
| `/conversations` | GET | `authMiddleware`, tenant scope | `conversation.findMany/count` | No | No | No | No | High conversation PII | No | Loai: PII/tenant conversation core |
| `/conversations/:id` | GET | `authMiddleware`, tenant scope | `conversation.findFirst`; `contextManager.getConversationSummary` | No direct | No | No | No | High context/PII | No | Loai: context manager + PII |
| `/conversations/:id/messages` | GET | `authMiddleware`, tenant scope | `conversation.findFirst`, `message.findMany` | No | No | No | No | High message text | No | Loai: message PII |
| `/knowledge` | GET | `authMiddleware`, tenant scope | `knowledgeBase.findMany/count` | No in GET | No | No | No token | Content/source/file URL | No | Loai: knowledge/RAG/upload/reindex adjacency |
| `/knowledge/:id` | GET | `authMiddleware`, tenant scope | `knowledgeBase.findUnique/findFirst` | No | No | No | No token | Content/source URL | No | Loai: knowledge/RAG domain |
| `/prompts` | GET | `authMiddleware`, tenant scope | `promptTemplate.findMany` | No | No | No | No token | Prompt content | Yes | Da tach truoc do |
| `/prompts/:id` | GET | `authMiddleware`, tenant scope | `promptTemplate.findUnique/findFirst` | No | No | No | No token | Prompt content | No | Loai: prompt detail nam canh write/delete, khong chon lai domain |
| `/providers` | GET | `authMiddleware`, `platformAdminOnly` | `llmProvider.findMany` select excludes key | Provider adjacency | No | No | API key adjacency, `hasApiKey` | Low | No | Loai: provider/secret/cache adjacency |
| `/quick-reply-menus` | GET | `authMiddleware`, tenant scope | `quickReplyMenu.findMany` | No | No | No | No | Low | Yes | Da tach truoc do |
| `/quick-reply-menus/:id` | GET | `authMiddleware`, tenant scope | `quickReplyMenu.findUnique/findFirst` | No | No | No | No | Low | Yes | Da tach truoc do |
| `/campaigns` | GET | `authMiddleware`, `platformAdminOnly` | `campaign.findMany` | No | No | No | No | Content data | Yes | Da tach truoc do |
| `/campaigns/:id` | GET | `authMiddleware`, `platformAdminOnly` | `campaign.findUnique` | No | No | No | No | Content data | Yes | Da tach truoc do |
| `/content-packages` | GET | `authMiddleware`, tenant scope | `contentPackage.findMany/count` | No in GET | No | No | No token | Content data | No | Loai: content/action/migrate/write adjacency |
| `/content-packages/:id` | GET | `authMiddleware`, tenant scope | `contentPackage.findUnique/findFirst` include items | No in GET | No | No | No token | Content data | No | Loai: content/action/migrate/write adjacency |
| `/content-packages/:packageId/items` | GET | `authMiddleware`, tenant scope | `contentPackage.findFirst`, `contentPackageItem.findMany` | No in GET | No | No | No token | Content data | No | Loai: nested content domain, nam canh item writes |
| `/appointments` | GET | `authMiddleware`, tenant scope | `appointment.findMany/count` | No in GET | No | No | No token | Appointment/customer PII | No | Loai: appointment PII + notification mutation adjacency |
| `/staff` | GET | `authMiddleware`, `platformAdminOnly` | `staff.findMany` | Telegram adjacency | No | No | Telegram id/chat id | Staff/Telegram PII | No | Loai: staff/Telegram PII + writes |
| `/settings/telegram-destinations` | GET | `authMiddleware` | repository read | Telegram adjacency | No | No | Env fallback only | Low | Yes | Da tach truoc do |
| `/settings/handoff` | GET | `authMiddleware` | repository read/create default historically | No | May create default in controller if missing | No | No | Low | Yes | Da tach truoc do |
| `/handoff/active` | GET | `authMiddleware`, `platformAdminOnly` | `conversation.findMany` | Handoff adjacency | No | No | No token | Conversation/staff PII | No | Loai: handoff realtime/core |
| `/handoff/staff-status` | GET | `authMiddleware`, `platformAdminOnly` | `staff.findMany`, `conversation.count` | Handoff adjacency | No | No | No token | Staff/conversation PII | No | Loai: handoff realtime/core |
| `/handoff/bot-queue` | GET | `authMiddleware`, `platformAdminOnly` | `conversation.findMany` with last inbound message | Handoff adjacency | No | No | No token | Message text/PII | No | Loai: handoff/message PII |
| `/facebook-pages` | GET | `authMiddleware`, `platformAdminOnly` | `facebookPage.findMany` select excludes token | Facebook adjacency | No | No raw token, but token adjacency | Page config | No | Loai: Facebook/secret adjacency |
| `/facebook-pages/:id` | GET | `authMiddleware`, `platformAdminOnly` | `facebookPage.findUnique` then strips token | Facebook adjacency | No | No raw token response | Access token adjacency | Page config | No | Loai: Facebook/secret adjacency |
| `/settings/facebook-menu` | GET | `authMiddleware`, `platformAdminOnly` | None | Yes, `facebookMenu.getProfile()` | No | No | Facebook token internally | External provider | No | Loai: external Facebook menu |
| `/fb-subscription` | GET | `authMiddleware`, `platformAdminOnly` | None | Yes, Graph API | No | No | `FB_PAGE_ACCESS_TOKEN` internally | External provider | No | Loai: external Graph API |
| `/analytics` | GET | `authMiddleware`, `platformAdminOnly` | `count`, `findMany`, `groupBy`, tagged `$queryRaw` | No | No | Yes, tagged raw SQL | No token | Aggregate data | No | Loai: query phuc tap/raw SQL, khong con route nho |
| `/stats` | GET | `authMiddleware`, `platformAdminOnly` | repository counts/groupBy | No | No | No | No | Aggregate | Yes | Da tach truoc do |
| `/channel-configs` | GET | `authMiddleware`, tenant scope | repository read | No | No | No | No credentials | Low | Yes | Da tach truoc do |
| `/channel-configs/:id` | GET | `authMiddleware`, tenant scope | repository read | No | No | No | No credentials | Low | Yes | Da tach truoc do |
| `/tenants` | GET | `authMiddleware`, `platformAdminOnly` | `tenant.findMany` include counts | No | No in GET | No | Config adjacency masked | Tenant config | No | Loai: tenants core/cache/registry adjacency |
| `/tenants/:id` | GET | `authMiddleware`, `platformAdminOnly` | `tenant.findUnique` include staff/channelConfigs | No | No in GET | No | Config adjacency masked | Tenant/staff config | No | Loai: tenants core |
| `/tenants/:id/staff` | GET | `authMiddleware`, `tenantPathAccessOnly` | `tenantStaff.findMany` | Telegram adjacency | No | No | Telegram id/chat id | Staff PII | No | Loai: tenant core + staff/Telegram |
| `/tenants/:id/channel-configs` | GET | `authMiddleware`, `tenantPathAccessOnly` | `tenantChannelConfig.findMany` | No | No | No | No credentials | Tenant config | No | Loai: tenant core/registry adjacency |
| `/tenants/:id/knowledge` | GET | `authMiddleware`, `tenantPathAccessOnly` | `knowledgeBase.findMany` | No | No | No | No token | Knowledge metadata | No | Loai: tenant knowledge/RAG core |
| `/tenants/:id/webhook-info` | GET | `authMiddleware`, `tenantPathAccessOnly` | `tenant.findUnique` | No | No | No | Webhook legacy adjacency | Legacy webhook info | No | Loai: tenant/webhook legacy route |

Mutation/action routes con lai trong `dashboard.js` khong duoc chon vi khong phai GET/read-only: auth login, admin-users create/delete, knowledge CRUD/upload/scrape/reindex, prompts write/delete, providers write/test, quick replies write/delete, campaigns upload/write/delete, content packages/item CRUD/migrate, appointments update, staff CRUD, telegram destinations CRUD/test, handoff force/assign, facebook pages CRUD, facebook menu setup, test-message, channel configs write/delete, tenants CRUD/nested writes.

## 6. Candidate decision

Co candidate khong? **Khong**.

Ly do khong con route an toan:

- Cac route GET low-risk da duoc tach truoc do: prompts list, settings reads, quick-reply-menus list/detail, channel-configs list/detail, campaigns list/detail, stats, admin-users.
- Phan GET con lai khong con "nho va sach": hoac auth core, hoac co PII/content, tenant core, external provider, secret/token adjacency, raw SQL/query phuc tap, hoac nam sat mutation/action high-risk.
- Theo tieu chi prompt, neu con mo ho thi khong chon. Vi vay dung voi `NO_SAFE_CANDIDATE`.

## 7. No source changes

Khong sua source runtime.

Khong sua:

- `backend/src/api/dashboard.js`
- `backend/src/infrastructure/repositories/**`
- `backend/src/presentation/http/controllers/dashboard/**`
- `backend/src/presentation/http/routes/dashboard/**`
- `dashboard/src/**`
- `backend/prisma/schema.prisma`
- Prisma migrations
- env/env example
- package/package-lock

Chi cap nhat docs/report.

## 8. API contract preservation

Giu nguyen:

- Tat ca dashboard API path/method/status/response hien co.
- Facebook `GET/POST /webhook`.
- `/chatwoot-webhook*` van khong duoc khoi phuc.
- Website Chatwoot endpoint `POST /integrations/website-chat/events` van chi la contract docs tu 23B, chua code runtime.
- Meta verify/production status khong doi.

## 9. Backend validation

| Lenh | Ket qua |
|---|---|
| `backend npm run quality` | PASS |
| `backend npx prisma validate` | PASS |
| Root `git diff --check` truoc docs | PASS |

Sau docs/report update se chay lai diff/validation gate truoc commit.

## 10. Backend smoke

Smoke cuoi chay tren backend process hien co `http://127.0.0.1:3001`, chi GET/read va `POST /chatwoot-webhook` legacy 404. Khong goi external provider, khong gui POST `/webhook`, khong in token/secret.

| Check | Ket qua |
|---|---|
| `GET /health` | PASS 200 |
| `GET /webhook` thieu params | PASS 403 |
| `POST /chatwoot-webhook` | PASS 404 |
| `GET /api/prompts` | PASS 200 |
| `GET /api/settings/webhook` | PASS 200 |
| `GET /api/channel-configs` | PASS 200 |
| `GET /api/quick-reply-menus` | PASS 200 |
| `GET /api/campaigns` | PASS 200 |
| `GET /api/stats` | PASS 200 |
| `GET /api/admin-users` | PASS 200 |

Ghi chu: mot attempt temp Express app truoc do bi timeout do event loop/module runtime; khong duoc dung lam ket qua PASS. Smoke cuoi hop le la smoke tren backend process hien co voi timeout tung request va tat ca check PASS.

## 11. Dashboard regression gate

| Gate | Ket qua |
|---|---|
| Port audit | Phat hien dashboard dev server cu `3002` PID `20260` thuoc workspace |
| Stop old server | PASS, da dung PID `20260` |
| Clean `.next` | PASS, verify path trong `dashboard/.next` roi xoa |
| Dashboard `npm run typecheck` sau clean | PASS |
| Dashboard `npm run build` sau clean | PASS |
| Fresh dev server | PASS, `127.0.0.1:3019`, PID `17480` |
| Full route smoke | PASS: 15 route that 200, fake route 404 |
| Static asset smoke | PASS: 67/67 `_next/static` assets 200 |
| Dev log scan | PASS: hits 0 |
| Cleanup | PASS, dung PID `17480`, port `3019` free |

Routes smoke PASS:

- `/login`
- `/dashboard`
- `/dashboard/analytics`
- `/dashboard/prompts`
- `/dashboard/staff`
- `/dashboard/appointments`
- `/dashboard/content-packages`
- `/dashboard/quick-replies`
- `/dashboard/campaigns`
- `/dashboard/channel-configs`
- `/dashboard/conversations`
- `/dashboard/knowledge`
- `/dashboard/settings`
- `/dashboard/tenants`
- `/dashboard/handoff`
- `/dashboard/__fake_21b_6__` tra 404 hop le

Dev log scan khong co:

- `Cannot find module './`
- `MODULE_NOT_FOUND`
- `Cannot read properties of undefined (reading 'call')`
- `webpack.cache`
- `ENOENT`
- `vendor-chunks`
- `_next/static` 404
- route that 500

## 12. Safety scans

| Scan | Ket qua |
|---|---|
| `$queryRawUnsafe` / `$executeRawUnsafe` trong `backend/src backend/scripts` | Prompt command match README lich su `backend/src/infrastructure/repositories/README.md`; runtime scan exclude README PASS, no matches |
| `new PrismaClient` trong `backend/src` | PASS WITH EXISTING SINGLETON: chi `backend/src/db.js` |
| `chatwoot|CHATWOOT|/chatwoot-webhook` trong `backend/src` | PASS, no matches |
| `prisma db push|accept-data-loss|migrate reset|--force` trong repo | Existing docs/report/script warning lich su; khong them executable moi |

Khong them raw unsafe, khong them PrismaClient moi, khong them Chatwoot runtime/legacy route, khong them destructive command.

## 13. Docs updated

Da cap nhat:

- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/PROJECT_PHASE_BOARD.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/phase-21/README.md`
- `report/phase-21/PROMPT_21B_6_FINAL_BACKEND_ROUTE_AUDIT_REPORT.md`

Docs ghi ro:

- Phase 21 la **STARTED / HIGH_RISK_ONLY_REMAINING**.
- Khong tiep tuc 21B thuong nua neu khong co prompt high-risk rieng.
- Phase 23 tam dung o PLANNED / NOT_STARTED runtime sau 23B.
- Khong code Website Chatwoot.
- Facebook `/webhook` khong doi.
- Meta/production status khong doi.

## 14. Broken-link check

Trang thai: **PASS**.

- Scan live Markdown links trong `docs/` va `report/`: `TOTAL_MARKDOWN_LINKS=0`.
- Broken live links: **0**.
- Broad code-span/path scan co cac reference lich su/stale va future-plan path (vi du Chatwoot-era files da xoa, placeholder `docs/<path>.md`, future 23B skeleton paths), nen khong dung lam broken live-link failure.

## 15. Final verdict

**NO_SAFE_CANDIDATE**

Tra loi bat buoc:

- Co candidate khong? **Khong**.
- Neu khong: vi sao khong con route an toan? **Cac route GET low-risk da tach het; phan con lai la auth core, PII/content, tenant core, provider/secret, Facebook/external, handoff, analytics raw SQL/query phuc tap hoac mutation/action adjacency.**
- Co sua source khong? **Khong**.
- Co sua dashboard khong? **Khong**.
- Co sua schema/env/package khong? **Khong**.
- Co them Chatwoot runtime khong? **Khong**.
- Facebook `/webhook` co doi khong? **Khong**.
- Backend/dashboard validation the nao? **PASS**.
- Dashboard route/static/dev log gate the nao? **PASS**.
- Broken-link check the nao? **PASS, 0 broken live links**.

## 16. Next step

Khong tiep tuc 21B read-route consolidation thong thuong nua.

Next hop ly:

1. Neu muon giam no backend tiep, mo prompt rieng cho mot vung high-risk duy nhat, vi du conversations, knowledge/RAG, providers, handoff, Facebook, analytics, tenants hoac auth, kem smoke/rollback/tenant-safety rieng.
2. Hoac quay sang Phase 19 dashboard split neu bug tracker sach va van ap dung day du rule clean `.next`, fresh dev server, route/static/dev-log gate.
3. Neu tiep tuc Phase 23, chi mo 23C inbound skeleton disabled/mocked; khong external, khong doi Facebook `/webhook`.
