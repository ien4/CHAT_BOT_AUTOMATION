# ARCHITECTURE - BBOTECH BOT AUTOMATION

## Prompt 07A bổ sung

Prompt 07A thêm guard P0 cho dashboard tenant routes mà không đổi kiến trúc module lớn:

- `backend/src/api/dashboard.js` có thêm middleware `tenantPathAccessOnly`.
- Middleware này nằm cùng khu vực auth/role middleware hiện hữu, không tạo dependency mới và không tạo PrismaClient mới.
- Platform admin tiếp tục đi qua nested tenant routes.
- Tenant admin chỉ được truy cập `/api/tenants/:id/*` khi `req.user.tenantId` trùng `req.params.id`.
- Các route child write/delete trong nhóm P0 được ràng buộc thêm tenant id ở thao tác DB để tránh dùng `sid/cid` của tenant khác.
- P1 conversation/detail/resource ownership guard chưa xử lý trong Prompt 07A và được chuyển sang Prompt 07B.

## Prompt 06C bổ sung

Prompt 06C mở rộng repository layer cho `GET /prompts` mà không đổi public API hoặc tenant scope hiện hữu:

- Tạo `backend/src/infrastructure/repositories/promptTemplates.repository.js`.
- Repository nhận Prisma dependency từ route factory; không tạo PrismaClient thứ hai.
- Repository chỉ chứa DB read operation `findManyForScope({ tenantId, layer })` cho `PromptTemplate`.
- `prompts.controller.js` vẫn giữ HTTP concern, đọc `req.query.layer`, gọi `getTenantScope(req)` và truyền scope đã tính vào repository.
- Repository giữ query cũ: `where = { tenantId: tenantId ?? null }`, thêm `where.layer = layer` nếu có, `orderBy` theo `layer` rồi `intentType`.
- `prompts.routes.js` tạo `promptTemplatesRepository` từ Prisma singleton được truyền qua `createPromptRoutes({ authMiddleware, getTenantScope, prisma })`.
- Các route `GET /prompts/:id`, `POST /prompts`, `PUT /prompts/:id`, `DELETE /prompts/:id` trong `dashboard.js` không đổi.

Dependency rule sau Prompt 06C:

- `presentation/http/routes` wire repository infrastructure cho controller trong giai đoạn chuyển tiếp.
- `presentation/http/controllers` vẫn xử lý request/response, query param và gọi `getTenantScope(req)`.
- `infrastructure/repositories` được phép dùng Prisma nhưng không đọc env, không xử lý HTTP response, không import Express.
- `domain` vẫn không phụ thuộc Prisma/Express.
- Full tenant isolation chưa được đánh dấu PASS vì local DB không có tenant sample; Prompt 07 vẫn cần audit riêng.

## Prompt 06B bổ sung

Prompt 06B mở rộng repository layer cho Telegram destinations read mà không đổi public API:

- Tạo `backend/src/infrastructure/repositories/telegramDestinations.repository.js`.
- Repository nhận Prisma dependency từ route factory; không tạo PrismaClient thứ hai.
- Repository chỉ chứa DB operation `findAll` cho `TelegramDestination`, giữ `orderBy` theo `purpose` rồi `name`.
- `settings.controller.js` vẫn giữ HTTP response/error concern và `envFallback` từ `process.env`, nhưng không gọi Prisma trực tiếp cho `GET /settings/telegram-destinations`.
- `settings.routes.js` tạo `telegramDestinationsRepository` từ Prisma singleton được truyền qua `createSettingsRoutes({ authMiddleware, prisma })`.
- Các route write/test Telegram destinations trong `dashboard.js` không đổi; Prompt 06B không gọi external Telegram send/test route.

Dependency rule sau Prompt 06B:

- `presentation/http/routes` wire dependency infrastructure cho controller trong giai đoạn chuyển tiếp.
- `presentation/http/controllers` gọi repository abstraction được inject; phần env fallback vẫn ở presentation/controller vì là response config concern hiện hữu.
- `infrastructure/repositories` được phép dùng Prisma nhưng không đọc env, không xử lý HTTP response, không import Express.
- `domain` vẫn không phụ thuộc Prisma/Express.

## Prompt 06 bổ sung

Prompt 06 đã bắt đầu repository layer phase 1 mà không đổi public API:

- Tạo `backend/src/infrastructure/repositories/handoffSettings.repository.js`.
- Repository nhận Prisma dependency từ route factory; không tạo PrismaClient thứ hai.
- Repository chỉ chứa DB operations cho singleton `HandoffSetting`: `findSingleton`, `createDefault`, `upsertSingleton`.
- `settings.controller.js` vẫn giữ HTTP response/error concern nhưng không gọi Prisma handoff trực tiếp cho `GET/PUT /settings/handoff`.
- `settings.routes.js` tạo repository từ Prisma singleton được truyền qua `createSettingsRoutes({ authMiddleware, prisma })`.
- Chưa tạo application use case/domain interface trong Prompt 06; đây là bước trung gian an toàn để giảm Prisma access khỏi controller trước.

Dependency rule sau Prompt 06:

- `presentation/http/routes` có thể wire dependency infrastructure cho controller trong giai đoạn chuyển tiếp.
- `presentation/http/controllers` gọi repository abstraction được inject, không import Prisma/Express vào repository.
- `infrastructure/repositories` được phép dùng Prisma nhưng không đọc env, không xử lý HTTP response.
- `domain` vẫn không phụ thuộc Prisma/Express.

## Prompt 04 bổ sung

Prompt 04 đã harden phần config mà không thay đổi route/webhook/schema:

- Backend `backend/src/infrastructure/services/config.js` là helper tập trung cho env mode, URL normalize, `APP_BASE_URL`, `PORT` và cảnh báo placeholder secret.
- Dashboard `dashboard/src/lib/config/env.ts` là helper tập trung cho `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHATWOOT_URL`, normalize URL và builder URL.
- `dashboard/src/app/dashboard/settings/page.tsx` đã dùng `CHATWOOT_BASE_URL` từ helper thay vì fallback localhost trực tiếp.
- `docs/policies/ENV_POLICY.md`, `backend/.env.example`, `dashboard/.env.example` là nguồn policy/env example hiện tại.
- Các fallback localhost còn trong `backend/src/api/dashboard.js` và log startup của `backend/src/index.js` chưa sửa vì có thể ảnh hưởng webhook/startup behavior.

Ngày cập nhật: 2026-07-08  
Trạng thái: Prompt 03 đã tạo architecture shell, chưa rewrite hệ thống và chưa đổi behavior runtime có chủ đích.

## 1. Kiến trúc hiện tại

Dự án hiện là kiến trúc mixed-module:

| Phần | Hiện trạng |
|---|---|
| Backend entrypoint | `backend/src/index.js` trực tiếp setup Express, routes, startup seed, Telegram, health checker và daily report. |
| Backend API | `backend/src/api/dashboard.js` chứa nhiều route, auth, CRUD, analytics, settings, tenant, staff, handoff và raw SQL. |
| Webhook | Facebook, Chatwoot owner và Chatwoot tenant nằm trong `backend/src/webhook/*` và `backend/src/tenants/*`. |
| Bot/AI | Bot engine, agent, tools, intents, LLM factory và provider nằm trực tiếp trong `backend/src/bot/*` và `backend/src/llm/*`. |
| RAG | Parser, embedding và pgvector search nằm trong `backend/src/rag/*`, có raw SQL cần audit riêng. |
| Dashboard | Next.js App Router giữ route trong `dashboard/src/app`, nhưng page đang chứa nhiều state, form, API call và UI cùng lúc. |
| API client dashboard | `dashboard/src/lib/api.ts` là facade chính; một số page vẫn có fetch trực tiếp. |

Prompt 03 không di chuyển các file lõi này để tránh thay đổi route, webhook timing, tenant scope hoặc RAG behavior.

## 2. Kiến trúc mục tiêu

Backend mục tiêu:

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
    services/
    integrations/
      chatwoot/
      facebook/
      telegram/
      llm/
      notifications/
      rag/
  presentation/
    http/
      controllers/
      middleware/
      routes/
    main/
```

Dashboard mục tiêu:

```text
dashboard/src/
  components/
    ui/
    layout/
    feedback/
  features/
    auth/
    dashboard/
    conversations/
    knowledge/
    prompts/
    campaigns/
    content-packages/
    quick-replies/
    channel-configs/
    tenants/
    analytics/
    appointments/
    staff/
    handoff/
    settings/
  lib/
    config/
    api/
    auth/
    utils/
  styles/
```

## 3. Dependency rule

Backend dependency direction:

```text
presentation -> application -> domain
infrastructure -> application/domain interfaces
```

Quy tắc bắt buộc:

- `domain` không import `infrastructure`, Prisma, Express hoặc SDK ngoài.
- `application` không gọi Prisma trực tiếp; khi tách thật phải đi qua repository contract.
- `presentation` không chứa business rule dài hạn; controller chỉ map request/response và gọi use case.
- `infrastructure` implement repository/gateway/interface, nhưng không ép domain phụ thuộc ngược lại.
- Không đổi public API route hoặc webhook URL khi tách layer.

Dashboard dependency direction:

```text
app routes -> features -> components/lib
features -> lib/api, lib/config, components
components/ui -> không gọi API trực tiếp
```

Quy tắc bắt buộc:

- `dashboard/src/app` giữ route URL và layout của Next.js.
- Page có thể compose feature component, nhưng không đổi route trong lúc tách.
- `lib/api.ts` vẫn là compatibility facade cho import hiện tại.
- `lib/api/client.ts` là điểm vào axios mới, nhưng phải giữ Authorization header và tenantScope behavior.
- `lib/config/env.ts` chỉ đọc biến `NEXT_PUBLIC_*`; không đưa secret vào client.

## 4. Backend layer mapping

| Layer mục tiêu | File hiện tại có thể tách sau | Điều kiện trước khi move |
|---|---|---|
| `presentation/http/routes` | `backend/src/api/dashboard.js`, `backend/src/webhook/*`, `backend/src/tenants/webhookHandler.js` | Route map đầy đủ, validation pass, không đổi URL. |
| `presentation/http/controllers` | Handler trong `dashboard.js` | Tách từng domain nhỏ, giữ response contract. |
| `application/use-cases` | Logic trong `bot/tools.js`, `bot/agent.js`, `tenants/handoff.js`, `api/dashboard.js` | Có checklist regression cho từng flow. |
| `domain/entities` | Tenant, Conversation, Appointment, Knowledge, Handoff concepts | Đối chiếu Prisma schema và status strings. |
| `domain/interfaces` | Repository/gateway contracts | Tách contract trước implementation. |
| `infrastructure/persistence/prisma` | `backend/src/db.js`, raw SQL wrappers | Không tạo PrismaClient thứ hai. |
| `infrastructure/repositories` | Prisma query trong dashboard API, bot tools, handoff, RAG | Audit tenant scope và transaction boundary. |
| `infrastructure/integrations/*` | `chatwoot`, `facebook`, `telegram`, `llm`, `notifications`, `rag` | Không đổi retry/error behavior khi move. |

Prompt 03 đã thêm `backend/src/infrastructure/persistence/prisma/client.js`, wrapper này chỉ re-export singleton cũ từ `backend/src/db.js`.

## 5. Dashboard layer mapping

| Layer mục tiêu | File hiện tại có thể tách sau | Điều kiện trước khi move |
|---|---|---|
| `components/ui` | Button/modal/input/table lặp trong các page | Không redesign UI. |
| `components/layout` | `dashboard/src/app/dashboard/layout.tsx`, tenant switcher | Giữ route/layout behavior. |
| `features/settings` | `dashboard/src/app/dashboard/settings/page.tsx` | Chuẩn hóa API client/fetch trước khi tách component. |
| `features/tenants` | `dashboard/src/app/dashboard/tenants/page.tsx` | Tenant-scope checklist bắt buộc. |
| `features/handoff` | `dashboard/src/app/dashboard/handoff/page.tsx` | Không đổi assign/force-end behavior. |
| `features/knowledge` | `dashboard/src/app/dashboard/knowledge/page.tsx` | Không chạy reindex/upload data thật. |
| `lib/api` | `dashboard/src/lib/api.ts` | Giữ compatibility facade và interceptor. |
| `lib/config` | Hard-code API/Chatwoot URL | Fallback local phải giữ như cũ. |

Prompt 03 đã thêm `dashboard/src/lib/config/env.ts` và `dashboard/src/lib/api/client.ts`. `dashboard/src/lib/api.ts` vẫn là facade chính.

## 6. Phần chưa move vì rủi ro cao

Không move trong Prompt 03:

- `backend/src/index.js`
- `backend/src/api/dashboard.js`
- `backend/src/webhook/*`
- `backend/src/tenants/webhookHandler.js`
- `backend/src/tenants/handoff.js`
- `backend/src/telegram/handoff.js`
- `backend/src/rag/pipeline.js`
- `backend/src/chatwoot/crypto.js`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/**`
- Các route trong `dashboard/src/app`

Lý do: các file này liên quan trực tiếp webhook timing, tenant scope, handoff state, raw SQL/pgvector, route contract hoặc startup behavior.

## 7. Quy tắc bảo vệ webhook, tenant, RAG và Prisma

- Không đổi webhook URL hoặc thứ tự route nếu chưa có payload regression test.
- Không đổi response timing của Chatwoot webhook vì hiện có flow trả 200 sớm.
- Không đổi tenant scope nếu chưa trace từ webhook payload tới DB query.
- Không sửa `$queryRawUnsafe` hàng loạt; audit từng query với input source rõ ràng.
- Không đổi Prisma schema hoặc migration trong prompt refactor shell.
- Không chạy `prisma migrate`, `prisma db push`, `db push --accept-data-loss`.
- Không chạy `start-all.bat` hoặc `docker compose up` trong prompt architecture/refactor.
- Không đọc hoặc in `.env` thật.

## 8. Validation guardrails

Backend sau mỗi nhóm thay đổi:

- `node --check src/index.js`
- `node --check src/db.js`
- `node --check src/infrastructure/persistence/prisma/client.js`
- `node --check src/infrastructure/services/config.js`
- `DATABASE_URL` dummy local + `npx prisma validate`

Dashboard sau mỗi nhóm thay đổi:

- `npx --no-install tsc --noEmit`
- `npm run --if-present build`
- `rg "http://localhost:3001" src`
- `rg "NEXT_PUBLIC_API_URL|API_BASE_URL" src`

Các lệnh không được chạy trong refactor shell:

- `prisma migrate`
- `prisma db push`
- `docker compose up`
- `start-all.bat`
- script test có thể tạo/sửa dữ liệu thật
