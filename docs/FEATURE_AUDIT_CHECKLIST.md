# FEATURE AUDIT CHECKLIST - BBOTECH BOT AUTOMATION

## Prompt 03 Static Validation Update

Ngày cập nhật: 2026-07-08

| Nhóm | Kết quả thật | Trạng thái cập nhật | Bằng chứng kiểm tra | Hành động tiếp theo |
|---|---|---|---|---|
| Backend architecture shell | Đã tạo shell `domain/application/infrastructure/presentation` | Static validation pass | README layer + `node --check` wrapper mới | Prompt 05 mới bắt đầu tách route/controller nhỏ. |
| Backend Prisma wrapper | Re-export singleton cũ, không tạo PrismaClient thứ hai | Static validation pass | `backend/src/infrastructure/persistence/prisma/client.js` | Prompt 06 dùng wrapper này cho repository layer. |
| Backend config helper | Đã tạo helper env an toàn, chưa migrate code cũ | Static validation pass | `backend/src/infrastructure/services/config.js` | Prompt 04 mở rộng config policy. |
| Dashboard architecture shell | Đã tạo feature/component/lib shell | Static validation pass | `dashboard/src/features/**`, `dashboard/src/components/**`, `dashboard/src/lib/**` | Prompt 09 mới tách page lớn. |
| Dashboard API helper | `api.ts` dùng factory mới nhưng giữ interceptor cũ | Static validation pass | `dashboard/src/lib/api.ts`, `dashboard/src/lib/api/client.ts` | Theo dõi auth header và tenantScope khi tách API theo feature. |
| Dashboard config helper | `http://localhost:3001` trong dashboard source còn duy nhất ở helper fallback | Static validation pass | `rg "http://localhost:3001" dashboard/src` | Prompt 04 xử lý phần backend/scripts/root còn lại. |
| Backend validation | Syntax check + Prisma validate dummy pass | Static validation pass | `node --check`, `npx prisma validate` với `DATABASE_URL` dummy | Chưa runtime verified. |
| Dashboard validation | TypeScript + Next build pass | Static validation pass | `npx --no-install tsc --noEmit`, `npm run build` | Chưa browser/runtime verified. |
| Behavior-critical modules | Không move webhook, tenant handoff, RAG, bot engine | Risk controlled | Git diff không đổi các file này | Cần checklist riêng trước khi refactor sâu. |

## Prompt 02B Validation Update

Ngày cập nhật: 2026-07-07

| Nhóm | Kết quả thật | Trạng thái cập nhật | Bằng chứng kiểm tra | Hành động tiếp theo |
|---|---|---|---|---|
| Git safety | Đã có `.git` và checkpoint local | PASS | Commit `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` | Giữ checkpoint trước mọi refactor source. |
| `.gitignore` | Đã bổ sung rule bảo vệ secret/build artifact | PASS | `.gitignore`, `git diff --cached --name-only`, bộ lọc staged file cấm | Không commit `.env`, `node_modules`, `.next`, log, build output. |
| Backend dependencies | `npm ci` pass | PASS WITH WARNINGS | `backend/package-lock.json`, `npm ci` | Audit vulnerability sau, không dùng `npm audit fix` trong prompt refactor. |
| Dashboard dependencies | `npm ci` pass | PASS WITH WARNINGS | `dashboard/package-lock.json`, `npm ci` | Audit vulnerability sau, không tự upgrade package. |
| Backend syntax | Các file JS trọng yếu pass `node --check` | PASS | `src/index.js`, `src/api/dashboard.js`, webhook/tenant/bot/RAG files | Prompt 03 có thể tạo shell/wrapper nhưng phải validate lại sau mỗi nhóm. |
| Backend lint/typecheck | Không có script lint/typecheck | Needs verification | `backend/package.json` | Không đánh dấu backend quality gate là full pass. |
| Prisma schema | Fail khi thiếu `DATABASE_URL`, pass với dummy local URL | PASS WITH ENV WARNING | `npx prisma validate` | Cần env local an toàn trước validation chuẩn; không migrate/db push. |
| Dashboard lint | `next lint` yêu cầu cấu hình ESLint tương tác | Risk confirmed | `dashboard/package.json`, `npm run lint` | Prompt riêng cần cấu hình ESLint có kiểm soát hoặc thay script phù hợp. |
| Dashboard typecheck | `tsc --noEmit` pass | PASS | `npx --no-install tsc --noEmit` | Tiếp tục chạy sau từng thay đổi TS/TSX. |
| Dashboard build | `next build` pass | PASS | `npm run build` | Build là guardrail chính hiện tại cho dashboard. |
| Raw SQL unsafe | Nhiều điểm `$queryRawUnsafe` xác nhận | Risk confirmed | `backend/src/api/dashboard.js`, `backend/src/tenants/handoff.js`, `backend/src/rag/pipeline.js`, `backend/scripts/seed.js` | Audit từng query, ưu tiên input người dùng và tenant scope. |
| Hard-code localhost | Xác nhận ở backend, dashboard, script, webhook URL file | Risk confirmed | `dashboard/src/lib/api.ts`, `dashboard/src/app/dashboard/settings/page.tsx`, `campaigns/page.tsx`, `tenants/page.tsx`, `start-all.bat` | Prompt config hardening sau khi architecture shell ổn. |
| Default credential/fallback | Xác nhận `admin/admin123`, standalone fallback, placeholder provider key | Risk confirmed | `backend/src/index.js`, `dashboard/src/lib/auth.tsx`, `dashboard/src/app/login/page.tsx`, `start-all.bat` | Không dùng production; cần env policy và login regression test. |
| DevOps destructive command | Xác nhận `prisma db push --accept-data-loss` | Risk confirmed | `start-all.bat` | Không chạy script này trên dữ liệu thật. |
| Container migration on start | Xác nhận `prisma migrate deploy` trong backend container | Risk confirmed | `backend/Dockerfile` | Cần migration/deploy policy riêng. |
| Chatwoot local folder | `chatwoot/` không tồn tại tại root | Risk confirmed | `Test-Path chatwoot` trả `False` | Không chạy `start-all.bat`/`stop-all.bat` nếu chưa xác minh môi trường. |

Ngày cập nhật: 2026-07-07  
Phạm vi: bảng kiểm tính năng hiện tại, rủi ro ẩn và cách kiểm tra an toàn trước refactor. File này chỉ phục vụ audit/tài liệu, không xác nhận tính năng đã chạy thành công trong runtime.

Quy ước trạng thái:

| Trạng thái | Ý nghĩa |
|---|---|
| Đã có | File/API/module có tồn tại theo scan read-only. |
| Cần kiểm chứng | Có dấu hiệu tồn tại nhưng chưa chạy validation/runtime. |
| Rủi ro | Có khả năng gây lỗi, mất dữ liệu, sai tenant scope hoặc sai deploy. |
| Chưa thấy | Chưa thấy rõ trong scan hiện tại. |

## A. Backend core

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Express server | Đã có | `backend/src/index.js` | Startup có seed defaults và phụ thuộc env/database | Sau dependency, chạy syntax/start smoke bằng env local giả lập | P0 | Không chạy nếu chưa rõ database. |
| Health/API root | Đã có | `backend/src/index.js` | Có thể không phản ánh trạng thái DB/LLM/webhook | Smoke test endpoint sau khi backend chạy | P1 | Nên mở rộng health theo dependency. |
| Auth dashboard JWT | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/auth.tsx` | Fallback secret/default admin có thể không an toàn | Kiểm tra env required và login flow sau baseline | P0 | Production không được dùng default credential. |
| Dashboard REST API | Đã có | `backend/src/api/dashboard.js` | File rất lớn, nhiều domain lẫn nhau, khó refactor an toàn | Ghi danh sách route trước khi tách | P0 | Ưu tiên split sau checkpoint. |
| Prisma client | Đã có | `backend/src/db.js`, `backend/prisma/schema.prisma` | Chưa chạy `prisma validate`; vector dùng `Unsupported` | Prompt 02B chạy `npx prisma validate` | P0 | Không chạy migration/db push. |
| Seed defaults | Đã có | `backend/src/index.js`, `backend/scripts/seed.js` | Tự tạo admin/provider placeholder; có `$queryRawUnsafe` trong seed script | Chỉ đọc logic; không chạy seed nếu chưa có DB backup | P1 | Cần tách local seed khỏi production. |
| CORS/helmet/upload | Đã có | `backend/src/index.js`, `backend/src/api/dashboard.js` | Chính sách CORS/upload chưa được xác nhận production | Kiểm tra cấu hình env và giới hạn file | P1 | Liên quan dashboard/RAG upload. |

## B. Messaging và webhook

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Facebook webhook verify | Đã có | `backend/src/webhook/handler.js` | Phụ thuộc `FB_VERIFY_TOKEN`; page fallback có thể đi sai tenant | Test verify bằng token giả local sau baseline | P0 | Không in token thật. |
| Facebook message handling | Đã có | `backend/src/webhook/handler.js`, `backend/src/facebook/menu.js` | Rate limit, sender/page mapping, access token fallback | Test với payload mẫu đã ẩn secret | P0 | Cần bảo toàn behavior. |
| Chatwoot owner webhook | Đã có | `backend/src/webhook/chatwootHandler.js`, `backend/src/chatwoot/api.js` | Signature/credential owner vs tenant có thể lẫn | Test payload mẫu và config env | P0 | Prompt 01 ghi có cả owner/tenant mode. |
| Chatwoot tenant webhook | Đã có | `backend/src/tenants/webhookHandler.js`, `backend/src/tenants/registry.js` | Rủi ro tenant scope, decrypt credential, channel mapping | Audit từng query theo tenant/page/channel | P0 | Là phần nhạy cảm nhất của multi-tenant. |
| Telegram bot | Đã có | `backend/src/telegram/bot.js` | Thiếu token thì module có thể không chạy; command routing cần test | Kiểm tra startup khi token thiếu/có | P1 | Không đọc token thật. |
| Telegram handoff legacy | Đã có | `backend/src/telegram/handoff.js` | File lớn, nhiều nhánh xử lý, có dynamic require | Tạo checklist command/callback trước refactor | P0 | Không tách khi chưa có baseline. |
| Tenant handoff | Đã có | `backend/src/tenants/handoff.js` | Có `$queryRawUnsafe`; rủi ro assign sai tenant/staff | Audit tenantId trên mọi query/action | P0 | Ưu tiên cao. |
| Alert/notification queue | Đã có | `backend/src/notifications/*` | Có thể nuốt lỗi hoặc gửi sai destination | Test bằng mock destination sau baseline | P1 | Liên quan handoff/appointments. |

## C. Bot và AI

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Bot engine | Đã có | `backend/src/bot/engine.js` | Core behavior dễ vỡ nếu tách vội | Tạo golden sample conversation trước refactor | P0 | Không đổi trước baseline. |
| Agent/tools | Đã có | `backend/src/bot/agent.js`, `backend/src/bot/tools.js` | Tool calling phụ thuộc provider format và DB state | Test từng tool bằng payload tối thiểu | P0 | Có liên quan appointment/RAG. |
| Intent router | Đã có | `backend/src/bot/router.js`, `backend/src/bot/intents.js` | Intent sai gây route sai hoặc fallback quá mức | Snapshot input/output mẫu | P1 | Tách sau khi có sample. |
| Context manager | Đã có | `backend/src/bot/context.js` | Context có thể thiếu tenant/page scope | Audit query scope | P0 | Liên quan trộn dữ liệu. |
| LLM factory | Đã có | `backend/src/llm/factory.js` | Provider fallback/alert có thể che lỗi cấu hình | Test provider disabled/missing key | P1 | Không in API key. |
| Gemini provider | Đã có | `backend/src/llm/gemini.js` | API response shape có thể đổi | Mock response hoặc smoke test có kiểm soát | P2 | Phụ thuộc external API. |
| DeepSeek provider | Đã có | `backend/src/llm/deepseek.js` | Response/error handling cần kiểm tra | Mock response hoặc smoke test có kiểm soát | P2 | Phụ thuộc external API. |
| Claude provider | Đã có | `backend/src/llm/claude.js` | Tool format khác provider khác | Mock tool response | P2 | Phụ thuộc external API. |
| Jina/embedding | Đã có | `backend/src/llm/jina.js`, `backend/src/rag/pipeline.js` | Embedding dimension/vector SQL | Test embedding mock/sample | P0 | Liên quan pgvector. |
| Appointment tools | Đã có | `backend/src/bot/tools.js`, `backend/src/api/dashboard.js`, `docs/appointment-modify-spec.md` | Docs có thể lệch code; update/reschedule/cancel cần test | So sánh spec với route/tool thực tế | P0 | Cần không làm mất flow đặt lịch. |
| Content package tools | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/content-packages/page.tsx` | Flow migrate từ campaign có thể trùng dữ liệu | Chỉ test với DB mẫu/backup | P1 | Không chạy migrate trên dữ liệu thật. |

## D. RAG và knowledge base

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Knowledge CRUD | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | Query scope tenant/category cần kiểm chứng | Test CRUD với dữ liệu mẫu | P0 | Không dùng dữ liệu thật khi chưa backup. |
| Upload tài liệu | Đã có | `backend/src/api/dashboard.js`, `backend/src/rag/docParser.js` | File type/size/parser lỗi có thể làm crash | Test file nhỏ sau baseline | P1 | Cần kiểm tra multer limits. |
| Scrape URL | Đã có | `backend/src/rag/docParser.js`, `dashboard/src/lib/api.ts` | SSRF/timeout/parser HTML | Thêm allowlist/timeout sau audit | P1 | Không chạy crawl tùy tiện. |
| Parser PDF/DOCX/HTML | Đã có | `backend/src/rag/docParser.js` | Dynamic require có thể fail nếu dependency thiếu | Kiểm tra dependency và test file mẫu | P1 | Hiện chưa có `node_modules`. |
| Embedding pipeline | Đã có | `backend/src/rag/pipeline.js` | `$queryRawUnsafe`, vector formatting, provider errors | Audit input vào raw SQL | P0 | Ưu tiên bảo mật. |
| pgvector search | Đã có | `backend/src/rag/pipeline.js`, `backend/prisma/schema.prisma` | Prisma `Unsupported("vector")`, raw SQL bắt buộc nhưng cần an toàn | Test `prisma validate`; dùng parameterized raw SQL nếu có thể | P0 | Không đổi schema trước checkpoint. |
| Reindex knowledge | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | Reindex all có thể tốn chi phí API/ghi DB hàng loạt | Chỉ chạy trên sample DB | P1 | Cần dry-run hoặc confirmation. |
| Fallback search | Cần kiểm chứng | `backend/src/rag/pipeline.js` | Fallback có thể trả sai tenant hoặc kết quả kém | Test query sample theo tenant | P1 | Cần đọc sâu sau checkpoint. |

## E. Multi-tenant

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Tenant model/schema | Đã có | `backend/prisma/schema.prisma` | Quan hệ tenant với page/channel/staff cần validate | `npx prisma validate` trong Prompt 02B | P0 | Không đổi schema lúc này. |
| Tenant registry/cache | Đã có | `backend/src/tenants/registry.js` | Cache stale credential hoặc decrypt fail | Test cache invalidation sau update config | P0 | Phụ thuộc `ENCRYPTION_KEY`. |
| Channel config | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/channel-configs/page.tsx` | Mapping Chatwoot/Facebook sai tenant | Test create/update với tenant mẫu | P0 | Rủi ro cao khi deploy. |
| Tenant webhook info | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | URL fallback hard-code/empty `APP_BASE_URL` | Kiểm tra env mapping | P0 | Liên quan public webhook. |
| Tenant staff | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/staff/page.tsx`, `dashboard/src/app/dashboard/tenants/[id]/staff/page.tsx` | Staff có thể lẫn giữa global và tenant route | Audit query theo tenantId | P0 | Cần ưu tiên trước handoff refactor. |
| Scoped conversations | Cần kiểm chứng | `backend/src/api/dashboard.js`, `backend/src/webhook/*`, `backend/src/tenants/*` | Trộn conversation giữa page/tenant | Trace từ webhook payload đến DB query | P0 | Cần sample payload. |
| Scoped knowledge | Cần kiểm chứng | `backend/src/api/dashboard.js`, `backend/src/rag/pipeline.js` | Search knowledge sai tenant | Test search theo tenant/sample data | P0 | Liên quan RAG. |
| Admin users/roles | Đã có | `backend/src/api/dashboard.js`, `dashboard/src/lib/api.ts` | Role/permission chưa rõ mức tenant/global | Audit auth middleware và role checks | P1 | Có thể cần RBAC sau. |

## F. Dashboard

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Login/auth provider | Đã có | `dashboard/src/lib/auth.tsx`, `dashboard/src/app/page.tsx` | Token storage/refresh/error handling cần test | Build/lint và login smoke | P0 | Phụ thuộc backend auth. |
| API client | Đã có | `dashboard/src/lib/api.ts` | Base URL fallback localhost; duplicate interceptor | Chuẩn hóa sau baseline | P0 | Không sửa trong Prompt 02A. |
| Dashboard layout | Đã có | `dashboard/src/app/dashboard/layout.tsx` | Navigation/tenant banner cần test responsive | Dashboard build + manual smoke | P1 | UI refactor sau. |
| Overview dashboard | Đã có | `dashboard/src/app/dashboard/page.tsx` | Stats API có thể lỗi nếu DB rỗng | Test với DB mẫu | P1 | Liên quan analytics. |
| Conversations | Đã có | `dashboard/src/app/dashboard/conversations/page.tsx` | Message list có thể không scope tenant | Test filter/tenant | P0 | Liên quan dữ liệu khách. |
| Knowledge | Đã có | `dashboard/src/app/dashboard/knowledge/page.tsx` | Upload/reindex tốn chi phí hoặc lỗi parser | Test file nhỏ sau baseline | P1 | Không chạy reindex all trên dữ liệu thật. |
| Prompts/providers | Đã có | `dashboard/src/app/dashboard/prompts/page.tsx` | API key/provider update có thể lộ hoặc lỗi encrypt | Không in secret; test save masked | P0 | Liên quan LLM. |
| Campaigns legacy | Đã có | `dashboard/src/app/dashboard/campaigns/page.tsx` | Có link hard-code `http://localhost:3001`; legacy data chưa migrate hết | Không sửa trước baseline; ghi rủi ro | P1 | Có content packages mới. |
| Content packages | Đã có | `dashboard/src/app/dashboard/content-packages/page.tsx` | Nút migrate có thể ghi DB hàng loạt | Chỉ dùng với DB backup | P1 | Cần confirmation UI tốt hơn. |
| Quick replies | Đã có | `dashboard/src/app/dashboard/quick-replies/page.tsx` | Mapping tenant/page/menu cần test | Test CRUD sample | P1 | Liên quan Facebook menu. |
| Channel configs | Đã có | `dashboard/src/app/dashboard/channel-configs/page.tsx` | Credential/inbox mapping có thể sai | Test lookup/update sample | P0 | Liên quan Chatwoot. |
| Tenants | Đã có | `dashboard/src/app/dashboard/tenants/page.tsx`, `dashboard/src/app/dashboard/tenants/[id]/*` | Fallback localhost; multi-page CRUD cần test | Audit API calls và env | P0 | Core multi-tenant. |
| Analytics | Đã có | `dashboard/src/app/dashboard/analytics/page.tsx` | Backend analytics có nhiều raw SQL | Test with sample DB | P1 | Raw SQL cần kiểm tra. |
| Appointments | Đã có | `dashboard/src/app/dashboard/appointments/page.tsx` | Update status/reschedule có thể lệch bot tool | Test flow create/update/cancel | P0 | Business-critical. |
| Staff | Đã có | `dashboard/src/app/dashboard/staff/page.tsx` | Global vs tenant staff có thể lẫn | Audit route and query | P0 | Liên quan handoff. |
| Handoff | Đã có | `dashboard/src/app/dashboard/handoff/page.tsx` | Assign/force-end sai tenant/staff | Test với sample conversation | P0 | Rủi ro cao. |
| Settings | Đã có | `dashboard/src/app/dashboard/settings/page.tsx` | Có fetch trực tiếp và hard-code localhost | Chuẩn hóa về `lib/api.ts` sau baseline | P0 | Không sửa khi chưa checkpoint. |

## G. DevOps, deploy và vận hành local

| Tính năng | Trạng thái hiện tại | File liên quan | Rủi ro bug ẩn | Kiểm tra an toàn | Ưu tiên | Ghi chú |
|---|---|---|---|---|---|---|
| Docker compose | Đã có | `docker-compose.yml` | Chưa chạy; có thể phụ thuộc env/volume/ports | Chỉ validate config sau checkpoint | P1 | Không `docker compose up` trong Prompt 02A. |
| Backend Dockerfile | Đã có | `backend/Dockerfile` | CMD chạy `npx prisma migrate deploy` khi start container | Chỉ dùng khi migration plan rõ | P0 | Production cần kiểm soát migration. |
| Dashboard Dockerfile | Cần kiểm chứng | `dashboard/Dockerfile` | Prompt scan có nhắc diagnostic block; cần đọc sâu nếu deploy | Build sau dependency | P1 | Không xử lý trong Prompt 02A. |
| start-all.bat | Đã có | `start-all.bat` | Chạy `npm install`, `prisma db push --accept-data-loss`, cloudflared/ngrok; có hard-code path | Không chạy trên dữ liệu thật | P0 | Cần tách local bootstrap an toàn. |
| stop-all.bat | Đã có | `stop-all.bat` | Có thể kill process rộng nếu không kiểm soát | Đọc kỹ trước khi chạy | P1 | Không chạy nếu chưa cần. |
| Env example | Đã có | `backend/.env.example` | Cần kiểm tra biến thiếu/dư/thừa so với `process.env` | Prompt 02B mapping env | P0 | Không đọc `.env` thật. |
| webhook URLs current | Đã có | `webhook-urls-current.txt` | Có thể stale; có localhost và có thể chứa thông tin nhạy cảm | Không dùng làm nguồn production | P1 | Không in secret/token. |
| Test bot scripts | Đã có | `test-bot.js`, `test-bot-simple.js` | Hard-code localhost; có thể ghi dữ liệu local | Chỉ chạy sau khi backend local ổn | P2 | Dùng cho smoke test có kiểm soát. |
| GitHub/CI/Vercel | Chưa thấy | Không thấy `.git` | Không có guardrail remote/CI | Tạo git local trước | P0 | Điều kiện bắt buộc trước refactor. |

## Checklist kiểm tra nhanh cho Prompt 02B

- [ ] Xác nhận `.git` tồn tại hoặc tạo repository local.
- [ ] Tạo checkpoint baseline trước khi sửa source.
- [ ] Cài dependency backend/dashboard.
- [ ] Chạy validation không phá dữ liệu.
- [ ] Ghi lỗi baseline vào report.
- [ ] Cập nhật trạng thái trong `docs/PROJECT_PROGRESS.md`.
- [ ] Chỉ sau đó mới chọn một refactor nhỏ cho prompt tiếp theo.
