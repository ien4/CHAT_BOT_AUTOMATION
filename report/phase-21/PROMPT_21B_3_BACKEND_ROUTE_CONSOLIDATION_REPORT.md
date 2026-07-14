# PROMPT 21B-3 — BACKEND ROUTE CONSOLIDATION REPORT

Ngày thực hiện: 2026-07-12
Trạng thái: **PASS**

## 1. Mục tiêu

Giảm nợ `backend/src/api/dashboard.js` bằng cách tách tối đa 1 nhóm route read-only/low-risk sang controller/routes/repository, không đổi behavior, không đổi API contract, không sửa dashboard/schema/package và không gọi external service thật.

## 2. Preflight/baseline validation

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không phải main/master |
| HEAD trước prompt | `834f841 Restore local runtime readiness status` |
| Remote | Không có remote configured |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored; env thật không tracked/staged |
| Tracked env scan | Chỉ có `backend/.env.example` |
| Baseline `npm run quality` | PASS |
| Baseline `npx prisma validate` | PASS |
| Baseline diff | Sạch |
| Baseline `/health` | 200 trên backend port 3001 |

Không mở/in env thật, token hoặc secret.

## 3. Route map

| Route | Method | Domain | Auth middleware | Tenant/platform behavior | DB? | External? | Mutation? | Secret exposure risk? | Raw SQL? | Risk | Candidate? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/campaigns` | GET | campaigns | `authMiddleware`, `platformAdminOnly` | Platform-only | Prisma `campaign.findMany` | Không | Không | Không thấy field token/secret trong schema `Campaign` | Không | READ_ONLY_LOW_RISK | Có, chọn |
| `/campaigns/:id` | GET | campaigns | `authMiddleware`, `platformAdminOnly` | Platform-only | Prisma `campaign.findUnique` | Không | Không | Không thấy field token/secret trong schema `Campaign` | Không | READ_ONLY_LOW_RISK | Có, chọn |
| `/campaigns/upload` | POST | campaigns | `authMiddleware`, `platformAdminOnly`, multer | Platform-only | Parser/upload | Không gọi external nhưng upload/parse file | Có side effect file | Có dữ liệu upload | Không | WRITE_WITH_SIDE_EFFECT | Không |
| `/campaigns` | POST | campaigns | `authMiddleware`, `platformAdminOnly` | Platform-only | Prisma create | Không | Có | Không mới | Không | WRITE_LOW_RISK | Không |
| `/campaigns/:id` | PUT/DELETE | campaigns | `authMiddleware`, `platformAdminOnly` | Platform-only | Prisma update/delete | Không | Có | Không mới | Không | WRITE_LOW_RISK | Không |
| `/stats` | GET | stats | `authMiddleware`, `platformAdminOnly` | Platform-only | Prisma count/findMany/groupBy | Không | Không | Không | Không | READ_ONLY_LOW_RISK | Có nhưng không chọn |
| `/content-packages*` | GET/POST/PUT/DELETE | content-packages | `authMiddleware` | Tenant-aware | Prisma | Có migrate/import domain gần kề | Có write/migrate | Không chọn | Không | DO_NOT_TOUCH_21B_3 | Không |
| `/analytics` | GET | analytics | `authMiddleware`, `platformAdminOnly` | Platform-only | Prisma/raw tagged SQL đã harden | Không | Không | Không | Có `$queryRaw` tagged | READ_ONLY_WITH_RAW_SQL | Không |
| `/handoff/*` | GET/POST | handoff | `platformAdminOnly` | Realtime handoff | DB/state | Có notification/runtime state | Có | Không chọn | Không unsafe | REALTIME_HANDOFF | Không |
| `/providers*`, `/facebook-*`, `/settings/facebook-menu` | GET/POST/PUT/DELETE | integrations | `platformAdminOnly` | Platform-only | DB/config | Có provider/Facebook risk | Có write/test | Secret/API key risk | Không | EXTERNAL_INTEGRATION | Không |
| `/tenants*`, `/admin-users`, `/auth/*` | Mixed | tenant/auth | Mixed | Core auth/tenant | DB | Không chọn | Có | Credential/tenant risk | Không | AUTH_CORE/TENANT_CORE | Không |

## 4. Candidate safety evaluation

**A. Campaigns**

- Có `GET /campaigns` và `GET /campaigns/:id`.
- GET dùng `authMiddleware` + `platformAdminOnly`; tenant token bị 403.
- GET chỉ gọi Prisma read (`findMany`, `findUnique`), không external, không mutation, không raw SQL.
- Schema `Campaign` chỉ có `id`, `name`, `description`, `assets`, `isActive`, `createdAt`, `updatedAt`; không có token/API key/plain credential.
- Domain có POST/upload/write, nhưng các route đó được giữ nguyên trong `dashboard.js`; mount subrouter đặt sau `/campaigns/upload` để giữ order cũ.

**B. Stats**

- `GET /stats` cũng platform-only và read-only, dùng Prisma count/findMany/groupBy, không raw SQL unsafe.
- Không chọn vì prompt ưu tiên `campaigns` khi A đủ an toàn; chỉ tách 1 nhóm trong 21B-3.

## 5. Candidate selection

| Tiêu chí | Kết quả |
|---|---|
| Route được chọn | `GET /api/campaigns`, `GET /api/campaigns/:id` |
| Vì sao an toàn | GET read-only, platform-only, Prisma query thuần, không external/upload/migrate/mutation/raw SQL/secret |
| Vì sao không chọn route khác | `stats` an toàn nhưng ưu tiên thấp hơn; các route còn lại có write/external/realtime/RAG/auth/tenant/raw SQL hoặc scope rộng hơn |
| Auth/platform behavior hiện tại | `authMiddleware` + `platformAdminOnly`; no-token 401, tenant-token 403 |
| Response shape hiện tại | list trả array; detail trả campaign object hoặc 404 `{ error: 'Not found' }`; 500 giữ `Internal server error` |
| Secret exposure | Không thấy theo schema/source; smoke không in dữ liệu campaign |
| External/mutation/raw SQL | Không có trong GET đã chọn |
| Smoke đã chạy | 401 no-token, 403 tenant-token, 200 platform list, 404 fake detail, regression routes |
| Rollback | Revert commit |

## 6. Split design

- Repository `backend/src/infrastructure/repositories/campaigns.repository.js`: giữ nguyên `findMany({ orderBy: { createdAt: 'desc' } })` và `findUnique({ where: { id } })`.
- Controller `backend/src/presentation/http/controllers/dashboard/campaigns.controller.js`: giữ HTTP concern, 200/404/500 như cũ.
- Routes `backend/src/presentation/http/routes/dashboard/campaigns.routes.js`: factory nhận `authMiddleware`, `platformAdminOnly`, `prisma`; khai báo `GET /` và `GET /:id`.
- `dashboard.js`: thêm require và `router.use('/campaigns', createCampaignRoutes(...))` đúng vị trí sau upload route; write routes giữ nguyên phía dưới.

## 7. Files changed

Source:

- `backend/src/api/dashboard.js`
- `backend/src/infrastructure/repositories/campaigns.repository.js`
- `backend/src/presentation/http/controllers/dashboard/campaigns.controller.js`
- `backend/src/presentation/http/routes/dashboard/campaigns.routes.js`

Docs/report:

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/phase-21/PROMPT_21B_3_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`

## 8. API behavior preservation

- Public path giữ nguyên: `/api/campaigns`, `/api/campaigns/:id`.
- Method GET giữ nguyên.
- Auth giữ nguyên: `authMiddleware`, `platformAdminOnly`.
- Response JSON giữ nguyên: list array, detail object/404 `Not found`, 500 `Internal server error`.
- Route order giữ nguyên về behavior: `/campaigns/upload` vẫn trước mount; POST/PUT/DELETE campaigns vẫn ở `dashboard.js` và được guard/fall-through.

## 9. Static validation

| Lệnh | Kết quả |
|---|---|
| `node --check src/api/dashboard.js` | PASS |
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/*.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/*.js` | PASS |
| `node --check src/infrastructure/repositories/*.js` | PASS |
| `npm run quality` | PASS |
| `npx prisma validate` | PASS |
| `git diff --check` | PASS, chỉ warning LF/CRLF của Git trên Windows |

## 10. Runtime smoke

Do backend port 3001 là process `node src/index.js` có sẵn và không auto-reload, smoke route đã tách được chạy bằng Express app tạm mount trực tiếp `dashboardApi` từ source mới. App tạm không import `src/index.js`, nên không chạy startup setup Facebook/Telegram. Token/credential không được in; admin tạm đã cleanup leftover = 0.

Regression trên process 3001 hiện có:

| Endpoint | Kỳ vọng | Kết quả |
|---|---|---|
| `GET /health` | 200 | PASS |
| `GET /webhook` thiếu verify params | 403 | PASS |
| `POST /chatwoot-webhook` | 404 | PASS |

Smoke source mới:

| Endpoint | Kỳ vọng | Kết quả |
|---|---|---|
| `GET /health` app tạm | 200 | PASS |
| `POST /chatwoot-webhook` app tạm | 404 | PASS |
| `POST /api/auth/login` | 200 + token exists | PASS |
| `GET /api/prompts` | 200 array | PASS |
| `GET /api/settings/handoff` | 200 object | PASS |
| `GET /api/settings/webhook` | 200 masked keys | PASS |
| `GET /api/channel-configs` | 200 array | PASS |
| `GET /api/quick-reply-menus` | 200 array | PASS |
| `GET /api/analytics?days=7` | 200 object | PASS |
| `GET /api/campaigns` no-token | 401 | PASS |
| `GET /api/campaigns` tenant-token | 403 | PASS |
| `GET /api/campaigns` platform token | 200 array | PASS |
| `GET /api/campaigns/<uuid-ảo>` | 404 | PASS |
| `POST /api/campaigns` no-token | 401 guarded | PASS, không mutation |
| `POST /api/campaigns/upload` no-token | 401 guarded | PASS, không upload |

Write/upload có token không chạy theo thiết kế.

## 11. Safety scans

- Duplicate route scan: `dashboard.js` không còn active `router.get('/campaigns'...)`; chỉ còn mount + POST/PUT/DELETE/upload.
- Raw unsafe scan: không tạo raw unsafe mới; chỉ còn dòng README lịch sử nhắc `$queryRawUnsafe`.
- Chatwoot scan: chỉ còn backlog cũ trong `start-all.bat` và README lịch sử; không tạo runtime Chatwoot mới.
- Destructive scan: chỉ còn dòng warning/comment cũ trong `start-all.bat`; không tạo `db push`, `accept-data-loss`, `migrate reset`, `DROP DATABASE`, `TRUNCATE` mới.

## 12. Không thay đổi

- Không sửa `dashboard/src/**`.
- Không sửa `backend/prisma/schema.prisma` hoặc migrations.
- Không sửa package/package-lock.
- Không sửa Dockerfile, docker-compose, `start-all.bat`.
- Không sửa webhook/RAG/tenants/telegram/bot/notifications/facebook.
- Không mở/in `.env`, `.env.local`, token hoặc secret.
- Không gọi Facebook/Meta/Telegram/Gemini/Jina/LLM thật.
- Không push remote.

## 13. Remaining risks

- `dashboard.js` vẫn còn nhiều route debt; 21B-3 chỉ giảm thêm 2 GET handler.
- Domain campaigns vẫn có write/upload legacy trong monolith; chưa tách trong prompt này vì có side effect.
- `stats` vẫn là candidate read-only tiềm năng nhưng cần prompt riêng nếu tiếp tục.
- `start-all.bat` Chatwoot backlog và docs stale vẫn cần 21D nếu muốn dọn.

## 14. Final verdict

**PASS**

Route `campaigns` GET list/detail đã được tách an toàn, API contract giữ nguyên, validation và runtime smoke PASS, không phát sinh secret/external/mutation/raw SQL mới, không đụng dashboard/schema/package.

## 15. Next step

Đề xuất:

1. **Prompt 21B-4** nếu muốn tiếp tục backend read-only route, mục tiêu là chỉ chọn candidate nhỏ còn lại sau audit thật.
2. **Prompt 21D** nếu muốn dọn docs/legacy/stale status.
3. **Prompt 21C** nếu quay lại dashboard `content-packages`, với action migrate/external bị khóa rõ.
