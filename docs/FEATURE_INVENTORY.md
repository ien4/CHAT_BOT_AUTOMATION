# FEATURE INVENTORY — BBOTECH BOT AUTOMATION

Ngày lập: 2026-07-08
Nguồn: scan read-only source + docs hiện có (Prompt 05R).
Lưu ý: file này chỉ liệt kê chức năng theo code thật đang tồn tại. **Runtime chưa được verify** trừ khi có smoke test thực tế. Không đánh dấu runtime PASS nếu chưa chạy thật.

## 1. Tổng quan sản phẩm

BBOTECH Bot Automation là hệ thống **chatbot automation multi-channel, multi-tenant**, gồm:

- **Backend** Express (`backend/`) xử lý webhook, bot/AI, RAG, dashboard API, multi-tenant.
- **Dashboard** Next.js App Router (`dashboard/`) để quản trị hội thoại, knowledge, prompts, tenants, handoff, settings.
- **Kênh nhắn tin**: Facebook Messenger, Chatwoot (owner + tenant mode), Telegram (bot + human handoff).
- **RAG/Knowledge**: parser tài liệu, embedding, pgvector search trên PostgreSQL.
- **AI provider**: Gemini, DeepSeek, Claude, Jina (embedding) qua LLM factory.
- **Multi-tenant**: tenant registry, channel config, tenant staff, scoped conversation/knowledge.

Luồng chính hiện dùng (theo `start-all.bat`, `webhook-urls-current.txt`):
`Facebook Messenger -> Chatwoot /bot -> Backend /chatwoot-webhook/<tenant> -> AI reply qua Chatwoot`.

## 2. Backend Core

| Chức năng | File chính | Trạng thái | Rủi ro | Cách test an toàn |
|---|---|---|---|---|
| Express server + startup | `backend/src/index.js` | Static validated (`node --check` PASS) | Startup có seed defaults + phụ thuộc DB/env | Start với env local/test; kiểm tra log, không dùng DB production |
| Health/root API | `backend/src/index.js` | Exists / Needs verification | Health có thể không phản ánh DB/LLM/webhook | `GET /` và health endpoint sau khi server chạy local |
| Dashboard auth/JWT | `backend/src/api/dashboard.js`, `dashboard/src/lib/auth.tsx` | Exists / Risk (default credential) | Fallback secret + default admin `admin/admin123` | Kiểm tra env required; login bằng credential local/test |
| Dashboard REST API | `backend/src/api/dashboard.js` (2.408 dòng, 98 route trực tiếp) | Exists / partially split | File còn quá lớn, nhiều domain lẫn nhau | Route map trước tách; smoke test từng route nhỏ |
| Route đã tách — settings webhook | `backend/src/presentation/http/routes/dashboard/settings.routes.js` (`GET /webhook`) | Static validated — chưa runtime verified | Route đọc env FB_*, cần auth | Smoke test `GET /api/settings/webhook` với token test |
| Route đã tách — telegram destinations | cùng file (`GET /telegram-destinations`) | Static validated — chưa runtime verified | Cần DB (`telegramDestination.findMany`) | Smoke test với DB local/test + token |
| Route đã tách — prompts list | `backend/src/presentation/http/routes/dashboard/prompts.routes.js` (`GET /`) | Static validated — chưa runtime verified | Cần DB + tenant scope | Smoke test `GET /api/prompts` với DB local/test + token |
| Prisma/PostgreSQL/pgvector | `backend/src/db.js`, `backend/src/infrastructure/persistence/prisma/client.js`, `backend/prisma/schema.prisma` | Static validated (`prisma validate` PASS với dummy URL) | Vector dùng `Unsupported("vector")`; cần raw SQL | `npx prisma validate` với DATABASE_URL dummy; KHÔNG migrate/db push |
| Seed default admin/provider | `backend/src/index.js`, `backend/scripts/seed.js` | Exists / Risk | Tự tạo admin/provider placeholder khi start; `$queryRawUnsafe` trong seed | Chỉ đọc logic; chỉ chạy trên DB local/test có backup |
| Upload/CORS/security middleware | `backend/src/index.js`, `backend/src/api/dashboard.js` (multer, helmet, cors) | Exists / Needs verification | Chính sách CORS/upload chưa xác nhận production | Kiểm tra cấu hình env + giới hạn file trên local |

## 3. Messaging/Webhook

| Chức năng | File chính | Trạng thái | Rủi ro |
|---|---|---|---|
| Facebook webhook verify/message | `backend/src/webhook/handler.js`, `backend/src/facebook/menu.js` | Exists / Needs verification | `FB_VERIFY_TOKEN`, sender/page mapping, access token fallback |
| Chatwoot owner webhook | `backend/src/webhook/chatwootHandler.js`, `backend/src/chatwoot/api.js` | Exists / Needs verification | Signature/credential owner vs tenant có thể lẫn |
| Chatwoot tenant webhook | `backend/src/tenants/webhookHandler.js`, `backend/src/tenants/registry.js` | Exists / Risk | Tenant scope, decrypt credential, channel mapping (nhạy cảm nhất) |
| Telegram bot | `backend/src/telegram/bot.js` | Exists / Needs verification | Thiếu token thì module có thể không chạy |
| Telegram handoff (legacy) | `backend/src/telegram/handoff.js` | Exists / Risk | File lớn, nhiều nhánh, dynamic require |
| Tenant handoff | `backend/src/tenants/handoff.js` | Exists / Risk | Có `$queryRawUnsafe`; rủi ro assign sai tenant/staff |
| Notification/alert queue | `backend/src/notifications/*` | Exists / Needs verification | Có thể nuốt lỗi hoặc gửi sai destination |

Guardrail: Prompt 05R KHÔNG chạm bất kỳ webhook handler nào.

## 4. Bot/AI

| Chức năng | File chính | Trạng thái | Rủi ro |
|---|---|---|---|
| Bot engine | `backend/src/bot/engine.js` | Exists / Risk | Core behavior dễ vỡ nếu tách vội |
| Agent/tools | `backend/src/bot/agent.js`, `backend/src/bot/tools.js` | Exists / Risk | Tool calling phụ thuộc provider format + DB state |
| Intent/router/context | `backend/src/bot/router.js`, `backend/src/bot/intents.js`, `backend/src/bot/context.js` | Exists / Needs verification | Intent sai gây route sai; context có thể thiếu tenant scope |
| LLM factory | `backend/src/llm/factory.js` | Exists / Needs verification | Provider fallback/alert có thể che lỗi cấu hình |
| Gemini provider | `backend/src/llm/gemini.js` | Exists / Needs verification | Phụ thuộc external API |
| DeepSeek provider | `backend/src/llm/deepseek.js` | Exists / Needs verification | Phụ thuộc external API |
| Claude provider | `backend/src/llm/claude.js` | Exists / Needs verification | Tool format khác provider khác |
| Jina/embedding | `backend/src/llm/jina.js` | Exists / Risk | Embedding dimension/vector SQL |
| Appointment tools | `backend/src/bot/tools.js`, `backend/src/api/dashboard.js` | Exists / Risk | Update/reschedule/cancel cần test; docs có thể lệch code |
| Content package tools | `backend/src/api/dashboard.js` | Exists / Risk | Flow migrate từ campaign có thể trùng dữ liệu |

## 5. RAG/Knowledge

| Chức năng | File chính | Trạng thái | Rủi ro |
|---|---|---|---|
| Knowledge CRUD | `backend/src/api/dashboard.js` | Exists / Needs verification | Query scope tenant/category cần kiểm chứng |
| Upload document | `backend/src/api/dashboard.js`, `backend/src/rag/docParser.js` | Exists / Risk | File type/size/parser lỗi có thể crash |
| Scrape URL | `backend/src/rag/docParser.js` | Exists / Risk | SSRF/timeout/parser HTML |
| Parser PDF/DOCX/HTML | `backend/src/rag/docParser.js` (`pdf-parse`, `mammoth`, `cheerio`) | Exists / Needs verification | Dynamic require có thể fail nếu dependency thiếu |
| Embedding pipeline | `backend/src/rag/pipeline.js` | Exists / Risk | `$queryRawUnsafe`, vector formatting |
| pgvector search | `backend/src/rag/pipeline.js`, `backend/prisma/schema.prisma` | Exists / Risk | `Unsupported("vector")`, raw SQL bắt buộc |
| Reindex | `backend/src/api/dashboard.js` | Exists / Risk | Reindex all tốn chi phí API + ghi DB hàng loạt |
| Fallback search | `backend/src/rag/pipeline.js` | Needs verification | Fallback có thể trả sai tenant/kết quả kém |

## 6. Multi-tenant

| Chức năng | File chính | Trạng thái | Rủi ro |
|---|---|---|---|
| Tenant model/schema | `backend/prisma/schema.prisma` | Static validated | Quan hệ tenant–page–channel–staff cần validate |
| Registry/cache | `backend/src/tenants/registry.js` | Exists / Risk | Cache stale credential; decrypt phụ thuộc `ENCRYPTION_KEY` |
| Channel config | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/channel-configs/page.tsx` | Exists / Risk | Mapping Chatwoot/Facebook sai tenant |
| Tenant webhook info | `backend/src/api/dashboard.js` | Exists / Risk | URL fallback hard-code/empty `APP_BASE_URL` |
| Tenant staff | `backend/src/api/dashboard.js`, `dashboard/src/app/dashboard/staff/page.tsx` | Exists / Risk | Staff lẫn giữa global và tenant route |
| Scoped conversations | `backend/src/webhook/*`, `backend/src/tenants/*` | Needs verification | Trộn conversation giữa page/tenant |
| Scoped knowledge | `backend/src/api/dashboard.js`, `backend/src/rag/pipeline.js` | Needs verification | Search knowledge sai tenant |
| Admin users/roles | `backend/src/api/dashboard.js` | Exists / Needs verification | Role/permission chưa rõ mức tenant/global |

## 7. Dashboard Frontend

Tất cả các mục dưới đây: **Static validated** (dashboard `tsc --noEmit` PASS + `next build` PASS trong Prompt 05R) — **chưa browser/runtime verified**.

| Chức năng | File chính |
|---|---|
| Login/auth provider | `dashboard/src/lib/auth.tsx`, `dashboard/src/app/login/page.tsx` |
| API client | `dashboard/src/lib/api.ts`, `dashboard/src/lib/api/client.ts` |
| Layout | `dashboard/src/app/dashboard/layout.tsx` |
| Overview | `dashboard/src/app/dashboard/page.tsx` |
| Conversations | `dashboard/src/app/dashboard/conversations/page.tsx` |
| Knowledge | `dashboard/src/app/dashboard/knowledge/page.tsx` |
| Prompts/providers | `dashboard/src/app/dashboard/prompts/page.tsx` |
| Campaigns | `dashboard/src/app/dashboard/campaigns/page.tsx` |
| Content packages | `dashboard/src/app/dashboard/content-packages/page.tsx` |
| Quick replies | `dashboard/src/app/dashboard/quick-replies/page.tsx` |
| Channel configs | `dashboard/src/app/dashboard/channel-configs/page.tsx` |
| Tenants | `dashboard/src/app/dashboard/tenants/page.tsx`, `dashboard/src/app/dashboard/tenants/[id]/*` |
| Analytics | `dashboard/src/app/dashboard/analytics/page.tsx` |
| Appointments | `dashboard/src/app/dashboard/appointments/page.tsx` |
| Staff | `dashboard/src/app/dashboard/staff/page.tsx` |
| Handoff | `dashboard/src/app/dashboard/handoff/page.tsx` |
| Settings | `dashboard/src/app/dashboard/settings/page.tsx` |

## 8. DevOps/Local/Deploy

| Chức năng | File chính | Trạng thái | Ghi chú rủi ro |
|---|---|---|---|
| Docker compose | `docker-compose.yml` | Exists / Risk | postgres host port 5433, backend 3001, dashboard 3000; `env_file: ./backend/.env` |
| Backend Dockerfile | `backend/Dockerfile` | Exists / Risk | CMD chạy `npx prisma migrate deploy` khi start container |
| Dashboard Dockerfile | `dashboard/Dockerfile` | Exists / Needs verification | Có diagnostic block; build standalone |
| start-all.bat | `start-all.bat` | Exists / Risk cao | Chạy `npm install`, `prisma db push --accept-data-loss`, cloudflared/ngrok, hard-code path `C:\Users\Admin\cloudflared.exe`, tham chiếu `chatwoot/` (không tồn tại ở root) |
| stop-all.bat | `stop-all.bat` | Exists / Risk | `taskkill` theo window title + `docker compose down` cho `chatwoot/` |
| Env examples | `backend/.env.example`, `dashboard/.env.example` | Exists | `.env` thật hiện KHÔNG tồn tại (backend/dashboard) |
| Webhook URLs current | `webhook-urls-current.txt` | Exists / Risk | Có thể stale; chứa localhost/verify token — không dùng làm nguồn production |
| Test bot scripts | `test-bot.js`, `test-bot-simple.js` | Exists / Risk | Hard-code localhost; có thể ghi dữ liệu local |

## 9. Runtime verification status

| Feature group | Static validation | Runtime validation | Next test needed |
|---|---|---|---|
| Backend core (server/health/auth) | PASS (`node --check`) | Chưa | Start local với env test; smoke health + login |
| Route đã tách: `GET /api/settings/webhook` | PASS | **Chưa (BLOCKED — thiếu env)** | Smoke test với token test (không cần DB) |
| Route đã tách: `GET /api/settings/telegram-destinations` | PASS | **Chưa (BLOCKED — thiếu env/DB)** | Smoke test với DB local/test + token |
| Route đã tách: `GET /api/prompts` | PASS | **Chưa (BLOCKED — thiếu env/DB)** | Smoke test với DB local/test + token |
| Prisma/schema | PASS (`prisma validate` dummy) | Chưa | Kết nối DB local/test read-only |
| Messaging/Webhook | Không thay đổi | Chưa | Ngoài phạm vi Prompt 05R |
| Bot/AI | Không thay đổi | Chưa | Ngoài phạm vi Prompt 05R |
| RAG/Knowledge | Không thay đổi | Chưa | Ngoài phạm vi Prompt 05R |
| Multi-tenant | Không thay đổi | Chưa | Prompt 07 tenant safety audit |
| Dashboard frontend | PASS (`tsc` + `next build`) | Chưa | Browser smoke sau khi backend chạy |
| DevOps/deploy | Scan read-only | Chưa | Prompt 10 DevOps hardening |

Không có mục nào được đánh dấu **Runtime PASS** vì chưa chạy smoke test thật (thiếu `.env` local/test — xem `docs/LOCAL_RUN_GUIDE.md`).
