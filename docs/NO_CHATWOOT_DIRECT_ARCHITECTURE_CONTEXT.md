# NO-CHATWOOT DIRECT ARCHITECTURE CONTEXT

Ngày cập nhật: 2026-07-09

## 1. Trạng thái mục tiêu

- Chatwoot bị loại khỏi kiến trúc đích.
- Không sinh thêm Chatwoot route/controller/service/model/env mới.
- Không sinh thêm biến `CHATWOOT_*` hoặc `NEXT_PUBLIC_CHATWOOT_URL` mới.
- Luồng đích: Facebook Messenger API -> Backend Express custom -> Dashboard nội bộ Next.js -> PostgreSQL/pgvector.
- Prompt 08A intake/audit/docs; Prompt 08B đã xóa backend runtime Chatwoot; Prompt 08C đã cleanup env example/config warning và lập schema cleanup plan.
- Prisma schema, dashboard source và DevOps scripts vẫn còn legacy blockers cho các prompt sau.

## 2. Phạm vi áp dụng từ nay trở đi

Áp dụng cho mọi thay đổi mới ở:

- Backend source mới.
- Dashboard source mới.
- Env example/config mới.
- Docs architecture mới.
- Prompt/refactor tiếp theo.
- Migration/schema plan tiếp theo.

Historical reports và tài liệu audit cũ có thể vẫn chứa chữ Chatwoot để giữ bằng chứng quá khứ. Không dùng các phần đó làm kiến trúc đích mới.

## 3. Những điểm chưa được phép khẳng định nếu chưa audit code

- Actual Facebook webhook endpoint không được đoán. Code hiện tại cho thấy endpoint Meta/Facebook trực tiếp là `GET /webhook` và `POST /webhook`; `GET /api/settings/webhook` là endpoint cấu hình dashboard, không phải callback Meta.
- Actual Dashboard port phải kiểm tra từ source/package. Prompt 08A xác nhận `dashboard/package.json` dùng `next dev -p 3002`.
- Actual Socket.io event names chưa được phép claim. Prompt 08A chưa tìm thấy `socket.io` hoặc event Socket.io thật trong `backend/src`, `dashboard/src` hoặc package manifests.
- Schema/migration removal chưa được phép làm nếu chưa có data migration/backfill/rollback policy.
- Production migration policy chưa được phép suy đoán. Không chạy `prisma db push`, không chạy migration mới trong Prompt 08A.

## 4. Direct flow target

Target inbound flow:

```text
Facebook Messenger API
  -> Backend Express custom webhook
  -> Bot/AI/RAG/application logic
  -> PostgreSQL/pgvector
  -> Dashboard nội bộ Next.js đọc/ghi qua Backend API
```

Target outbound flow:

```text
Dashboard hoặc staff/handoff action
  -> Backend Express custom API
  -> Facebook Messenger Send API hoặc kênh nội bộ được audit
  -> PostgreSQL/pgvector ghi lịch sử
```

Trong target này, Chatwoot không còn là inbox, relay, handoff sync, API client, webhook source hoặc dashboard configuration target.

## 5. Clean Architecture rules

Giữ dependency rule:

```text
presentation -> application -> domain
infrastructure -> application/domain interfaces
```

Quy tắc áp dụng:

- `presentation/http` nhận request/response, auth, route wiring.
- `application` chứa use case và policy nghiệp vụ.
- `domain` không import Express, Prisma, SDK ngoài, Facebook, Telegram, Chatwoot hoặc LLM SDK.
- `infrastructure` chứa Prisma repository và external integration implementation.
- Không tạo PrismaClient thứ hai.
- Không đưa secret vào dashboard hoặc `NEXT_PUBLIC_*`.

## 6. Env target draft

Đây là draft target, không phải `.env` thật và không chứa secret thật.

```env
PORT=3001
NODE_ENV=development
APP_BASE_URL=http://localhost:3001
DATABASE_URL=postgresql://<local_user>:<local_password>@localhost:5433/<local_db>

FB_PAGE_ACCESS_TOKEN=
FB_VERIFY_TOKEN=
FB_APP_SECRET=
FB_PAGE_ID=

GEMINI_API_KEY=
DEEPSEEK_API_KEY=
CLAUDE_API_KEY=

JWT_SECRET=
ENCRYPTION_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_MANAGER_CHAT_ID=
TELEGRAM_STATUS_GROUP_ID=
```

Ghi chú bắt buộc:

- Local DB host port hiện tại của project là `5433` nếu vẫn dùng container `bbotech-pgvector-local`.
- Không đưa secret thật vào docs/report.
- Không đưa `CHATWOOT_*`.
- Không đưa `NEXT_PUBLIC_CHATWOOT_URL`.
- Dashboard public API target vẫn là `NEXT_PUBLIC_API_URL` và phải trỏ backend API public trong production.

## 7. Guardrails

- Giữ tenant isolation đã harden ở Prompt 07A/07B/07C/07D.
- Không chạy destructive `prisma db push`.
- Không chạy `prisma db push --accept-data-loss`.
- Không dùng production DB cho validation/refactor.
- Chỉ dùng local pgvector/test DB khi runtime smoke cần DB.
- Không in secret, token, `DATABASE_URL` đầy đủ, `JWT_SECRET`, `ENCRYPTION_KEY`, Facebook token, Telegram token hoặc LLM key.
- Không commit `.env` thật.
- Không sinh thêm Chatwoot code/config/docs target mới.
- Không xóa runtime Chatwoot trong Prompt 08A khi chưa có impact map đầy đủ.

## 8. Migration phases

- **08A audit/docs**: tiếp nhận chỉ thị No-Chatwoot, scan reference, lập impact map, cập nhật docs/report.
- **08B backend removal**: loại bỏ/disable backend Chatwoot runtime route, client, adapter, tenant webhook và handoff sync; giữ direct Facebook webhook.
- **08C schema/env cleanup**: đã cleanup env example/config warning và lập migration/env cleanup plan cho `chatwoot*` fields; không dùng `db push`; chưa sửa schema/migrations.
- **08D dashboard cleanup**: bỏ UI/API/env Chatwoot khỏi settings, tenants, channel configs và dashboard API client.
- **09 RAG/raw SQL**: xử lý `$queryRawUnsafe`, pgvector query và knowledge upload/scrape sau No-Chatwoot backlog.
- **10 DevOps/deploy**: cleanup scripts, compose, stale webhook URL files, deploy policy.
- **Structure consolidation**: chỉ làm sau security/DevOps để tránh move code khi behavior còn biến động.
