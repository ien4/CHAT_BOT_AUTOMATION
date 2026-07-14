# PROMPT 05B - BACKEND API ROUTE/CONTROLLER SPLIT REPORT

Ngay thuc hien: 2026-07-08
Pham vi: tach route/controller backend phase 2 cho nhom route settings nho trong `backend/src/api/dashboard.js`.
Ket luan: **PASS WITH WARNINGS - route split succeeded but runtime verification still needed**

## 1. Muc tieu

Prompt 05B tiep tuc giam kich thuoc `backend/src/api/dashboard.js` theo huong route/controller shell da co tu Prompt 03 va Prompt 05.

Muc tieu cu the:

- Doc lai docs/report bat buoc va ket qua Prompt 05.
- Chay baseline validation truoc khi sua.
- Cap nhat route map cho `backend/src/api/dashboard.js`.
- Chon mot route nho, read-only, khong raw SQL, khong upload, khong external side effect.
- Mo rong controller/routes settings da co.
- Giu nguyen public route, method, auth middleware, Prisma query, status code va response shape.
- Khong sua webhook, tenant handoff, RAG, Prisma schema/migrations, dashboard frontend hoac DevOps scripts.
- Chay validation sau thay doi.

## 2. File/report da doc

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/policies/ENV_POLICY.md`
- `report/archive/early-prompts/PROMPT_05_BACKEND_API_ROUTE_CONTROLLER_SPLIT_REPORT.md`
- `backend/src/api/dashboard.js`
- `backend/src/presentation/http/controllers/dashboard/settings.controller.js`
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`

Khong doc `.env` that va khong in secret vao report.

## 3. Preflight result

| Hang muc | Ket qua |
|---|---|
| `git status --short --branch` | PASS, working tree sach truoc Prompt 05B |
| `git log --oneline -10` | Co commit Prompt 05 moi nhat |
| Commit Prompt 05 | `c860ca416a3439dfc7b72bc1e9d9f5ab3cba5af0` ton tai |
| Guardrail | Khong chay migration, db push, Docker, start script hoac doc `.env` that |

## 4. Baseline validation truoc thay doi

| Command | Result | Notes |
|---|---|---|
| `node --check src/index.js` | PASS | Khong chay app server |
| `node --check src/db.js` | PASS | Prisma singleton hop le |
| `node --check src/api/dashboard.js` | PASS | Dashboard API baseline hop le |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS | Controller Prompt 05 hop le |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS | Route module Prompt 05 hop le |
| `node --check src/infrastructure/services/config.js` | PASS | Config helper hop le |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Prisma wrapper hop le |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Khong migrate, khong db push, khong connect DB that |

## 5. Route map update

Route scan truoc khi tach:

- `backend/src/api/dashboard.js`: 2.439 dong.
- `backend/src/api/dashboard.js`: 100 route truc tiep.
- `settings.routes.js`: 1 route da tach tu Prompt 05.

Route settings con lai trong `dashboard.js` truoc Prompt 05B:

| Route | Phan loai | Ly do chon/khong chon |
|---|---|---|
| `GET /settings/handoff` | Read + create singleton neu thieu | Khong chon vi co the ghi DB khi settings chua ton tai. |
| `PUT /settings/handoff` | Write | Khong chon trong Prompt 05B. |
| `GET /settings/telegram-destinations` | Read-only Prisma | Chon vi nho, khong raw SQL, khong upload, khong external side effect. |
| `POST /settings/telegram-destinations` | Write | Khong chon. |
| `PUT /settings/telegram-destinations/:id` | Write | Khong chon. |
| `DELETE /settings/telegram-destinations/:id` | Write | Khong chon. |
| `POST /settings/telegram-destinations/:id/test` | External Telegram side effect | Khong chon. |
| `GET /settings/chatwoot-test` | External Chatwoot API | Khong chon. |
| `GET /settings/facebook-menu` | External Facebook/API state | Khong chon. |
| `POST /settings/facebook-menu` | External Facebook side effect | Khong chon. |

## 6. Route group selected

Route duoc tach: `GET /settings/telegram-destinations`.

Public URL khi mount duoi `/api` van la:

- `/api/settings/telegram-destinations`

Ly do chon:

- Chi co mot route.
- Route read-only.
- Chi doc `prisma.telegramDestination.findMany`.
- Khong raw SQL.
- Khong upload.
- Khong goi Telegram/Chatwoot/Facebook/LLM.
- Khong lien quan tenant handoff, webhook, RAG hoac bot engine.
- Da co module settings tu Prompt 05 nen chi can mo rong boundary hien co.

## 7. Files created

| File | Muc dich |
|---|---|
| `report/archive/early-prompts/PROMPT_05B_BACKEND_API_ROUTE_CONTROLLER_SPLIT_REPORT.md` | Report Prompt 05B. |

Khong tao source file moi. Prompt 05B chi mo rong controller/routes settings da co.

## 8. Files changed

| File | Thay doi |
|---|---|
| `backend/src/api/dashboard.js` | Go block `router.get('/settings/telegram-destinations', ...)`; truyen `prisma` vao `createSettingsRoutes({ authMiddleware, prisma })`. |
| `backend/src/presentation/http/controllers/dashboard/settings.controller.js` | Them `createGetTelegramDestinations({ prisma })`, giu nguyen query/response/error handling cu. |
| `backend/src/presentation/http/routes/dashboard/settings.routes.js` | Them route `GET /telegram-destinations` trong settings route factory. |
| `docs/status/PROJECT_PROGRESS.md` | Cap nhat trang thai Prompt 05B va next step Prompt 05C. |
| `docs/status/FEATURE_AUDIT_CHECKLIST.md` | Them checklist Prompt 05B. |
| `docs/roadmap/REFACTOR_PLAN.md` | Ghi Prompt 05B da hoan thanh phase 2 va khuyen nghi Prompt 05C. |

## 9. Behavior safety

| Hang muc | Ket qua |
|---|---|
| Public route co doi khong | Khong. Van la `/api/settings/telegram-destinations`. |
| Method co doi khong | Khong. Van la `GET`. |
| Auth middleware co doi khong | Khong. Van dung `authMiddleware`. |
| Prisma query co doi khong | Khong. Van dung `prisma.telegramDestination.findMany({ orderBy: [{ purpose: 'asc' }, { name: 'asc' }] })`. |
| Response shape co doi khong | Khong. Van tra `{ destinations, envFallback: { statusGroupIdConfigured } }`. |
| Error log/message co doi khong | Khong co chu dich doi. Van la `Failed to list Telegram destinations`. |
| Route write/test Telegram co doi khong | Khong. `POST/PUT/DELETE/test` van o `dashboard.js`. |
| Prisma schema/migrations co doi khong | Khong. |
| Webhook handlers co bi dung khong | Khong. |
| Tenant handoff co bi dung khong | Khong. |
| RAG co bi dung khong | Khong. |
| Dashboard frontend co bi dung khong | Khong. |

## 10. Validation after changes

| Command | Result | Notes |
|---|---|---|
| `node --check src/index.js` | PASS | Backend entrypoint hop le |
| `node --check src/db.js` | PASS | Prisma singleton hop le |
| `node --check src/api/dashboard.js` | PASS | Import/mount route settings hop le |
| `node --check src/presentation/http/controllers/dashboard/settings.controller.js` | PASS | Controller settings hop le |
| `node --check src/presentation/http/routes/dashboard/settings.routes.js` | PASS | Route factory settings hop le |
| `node --check src/infrastructure/services/config.js` | PASS | Config helper van hop le |
| `node --check src/infrastructure/persistence/prisma/client.js` | PASS | Prisma wrapper van hop le |
| `DATABASE_URL` dummy + `npx prisma validate` | PASS | Khong migrate, khong db push |
| `rg "router\\.(get|post|put|delete|patch)" src/api/dashboard.js src/presentation/http` | PASS | Route moi nam trong `src/presentation/http/routes/dashboard/settings.routes.js` |
| `git diff --stat` | PASS | 3 source files + docs/report dung pham vi |

Thong ke sau thay doi:

- `backend/src/api/dashboard.js`: 2.422 dong.
- `backend/src/api/dashboard.js`: 99 route truc tiep.
- `backend/src/presentation/http/routes/dashboard/settings.routes.js`: 2 route.

Dashboard build/typecheck khong chay vi Prompt 05B khong sua dashboard frontend.

## 11. Remaining risks

| Rui ro | Trang thai |
|---|---|
| `backend/src/api/dashboard.js` van lon | Con 2.422 dong va 99 route truc tiep. |
| Settings route con lai co write/external side effect | Chua tach trong Prompt 05B de tranh doi behavior. |
| `GET /settings/handoff` co create singleton | Chua tach vi read route co kha nang ghi DB. |
| `$queryRawUnsafe` | Van con trong dashboard API/RAG/tenant paths, chua xu ly trong Prompt 05B. |
| Tenant scope | Chua runtime verified. |
| Runtime verification | Chua chay app/API that. |
| Backend lint/typecheck | Van chua co script lint/typecheck that. |
| DevOps script risk | `start-all.bat`, Dockerfile migration policy va stale webhook URL file chua xu ly. |

## 12. Final verdict

**PASS WITH WARNINGS - route split succeeded but runtime verification still needed**

Ly do:

- Route settings thu hai da duoc tach theo controller/routes dung architecture shell.
- Public route/method/auth/query/response khong doi.
- Backend static validation va Prisma validate pass.
- Khong sua schema/migrations/webhook/tenant handoff/RAG/dashboard frontend.
- Chua runtime verified vi khong chay app server hoac goi API that.

## 13. Next Step & Goal

De xuat tiep theo: **Prompt 05C - Backend API route/controller split next small group**.

Muc tieu Prompt 05C:

- Tiep tuc tach mot route hoac nhom route nho khoi `backend/src/api/dashboard.js`.
- Uu tien route read-only, khong raw SQL, khong upload, khong external API side effect.
- Khong gom nhieu domain lon trong cung mot prompt.
- Giu nguyen public route/response contract.
- Chay cung bo validation backend va Prisma validate dummy.

Chua nen chuyen sang Prompt 06 repository layer neu `dashboard.js` van con qua nhieu route truc tiep va controller boundary chua du ro.
