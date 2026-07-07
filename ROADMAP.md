# Chat Automation — Roadmap & Tiến trình

> Cập nhật lần cuối: 2026-06-12
> Trạng thái tổng thể: ✅ Phase 1 hoàn thành, ✅ Phase 2 hoàn thành, ✅ Phase 3 hoàn thành
> ✅ D (DB migrations) — ✅ A (Human Handoff) — ✅ B (Knowledge types) — ✅ C (ContentPackage) — ✅ E (Prompt System)
> ℹ️ Dashboard frontend (Next.js + Tailwind) đã có sẵn tại `dashboard/` — đang phát triển song song

---

## PHASE 1 — Nền tảng (Song song sau khi D xong)

### D. Database Migrations ✅ HOÀN THÀNH (2026-06-12)
> Applied bằng `prisma db push` + `prisma migrate resolve`

- [x] **Migration 001** — Staff + HandoffSettings + Conversation handoff fields
- [x] **Migration 002** — KnowledgeBase thêm: `type`, `tags`, `parentId`, `fileUrl`
- [x] **Migration 003** — Tạo `ContentPackage` + `ContentPackageItem` (Campaign data vẫn giữ)
- [x] **Migration 004** — `PromptTemplate` thêm field `layer` (identity | intent)
- [x] **Migration 005** — Tạo `QuickReplyMenu`
- [x] **Migration 006** — Tạo `FacebookPage`
- [x] Seed `HandoffSettings` singleton (pending=30s, session=30s, workHours=8-22)
- [x] Seed `Bot Identity` prompt template (layer=identity)

⚠️ **Cần làm 1 lần:** Restart server → chạy `npx prisma generate` để Prisma client nhận models mới

**→ A, B, C sẵn sàng chạy song song**

---

### A. Human Handoff via Telegram ✅ HOÀN THÀNH (2026-06-12)

**Files đã tạo/sửa:**
- [x] `backend/src/telegram/handoff.js` — core logic: initiate, claim, relay, timeout, end session
- [x] `backend/src/telegram/bot.js` — Telegram bot: /start, /myid, /duty, /xong, buttons inline
- [x] `backend/src/webhook/handler.js` — handoff routing trước bot engine
- [x] `backend/src/bot/engine.js` — export getOrCreateConversation, saveMessage; thêm skipSaveInbound
- [x] `backend/src/api/dashboard.js` — CRUD Staff, GET/PUT HandoffSettings, GET handoff/active, POST force-end
- [x] `backend/src/index.js` — init Telegram bot khi server start
- [x] `backend/.env` — thêm TELEGRAM_BOT_TOKEN, TELEGRAM_STATUS_GROUP_ID

**UX Telegram:**
- Staff nhận DM riêng với nút inline ✋ Nhận
- Race condition an toàn: DB transaction, chỉ 1 người thắng
- Staff khác tự động nhận thông báo "đã có người nhận"
- Group chỉ nhận broadcast trạng thái
- /duty để bật/tắt trực ban ngay trong Telegram
- Nút 🔴 Kết thúc phiên sau khi nhận

⚠️ **Cần làm trước khi test:**
1. Stop server → `npx prisma generate` → restart (để Prisma client nhận Staff, HandoffSettings models)
2. Tạo Telegram bot qua @BotFather → điền `TELEGRAM_BOT_TOKEN` vào `.env`
3. Tạo group Telegram → thêm bot vào → lấy group ID → điền `TELEGRAM_STATUS_GROUP_ID`
4. Tạo staff trong dashboard: `POST /api/staff` với `{name, telegramChatId}`
   - Staff chat với bot → gõ /myid → lấy Chat ID → admin điền vào

---

### B. Knowledge Base Restructuring ✅ HOÀN THÀNH (2026-06-12)

**Files đã sửa:**
- [x] `rag/pipeline.js` — fix bug: type/tags/parentId/fileUrl không được lưu vào SQL INSERT
- [x] `rag/pipeline.js` — search() trả về type+tags+sourceUrl; rerank() ưu tiên type theo intent
- [x] `rag/pipeline.js` — formatContext() type-aware: image_prompt/resource_link/pricing/contact render khác nhau
- [x] `rag/pipeline.js` — updateDocument() cập nhật được type/tags
- [x] `rag/docParser.js` — scrapeWebsite() phân cấp H1→H2→H3 với _parentTitle, không tạo full-page duplicate
- [x] `api/dashboard.js` — scrape route resolve _parentTitle → parentId; GET /knowledge hỗ trợ ?type= ?tags=
- [x] `bot/engine.js` — content_package intent dùng RAG; campaign/content_package đều load getCampaignContext

**Cách bot dùng type:**
- `company_info` intent → ưu tiên type: faq, document, contact, pricing
- `service_inquiry` intent → ưu tiên: faq, document, pricing, skill
- `content_package` intent → ưu tiên: image_prompt, skill, resource_link
- `image_prompt` trong context → LLM được nhắc "cung cấp nguyên văn cho người dùng"
- `resource_link` → tự động append 🔗 URL vào context

---

### C. ContentPackage (đổi từ Campaign) ✅ HOÀN THÀNH (2026-06-12)
> Track C — đổi "Campaign" → "Gói nội dung" với cấu trúc items đa dạng

**Files đã tạo/sửa:**
- [x] `backend/src/bot/intents.js` — thêm `content_package` intent, map legacy `campaign` → `content_package`
- [x] `backend/src/bot/engine.js` — `getContentPackageContext()`, `handleContentPackages()`, `handleContentPackageItems()`, `handleContentPackageItemDetail()` — hiển thị items theo type với emoji
- [x] `backend/src/bot/suggestions.js` — `contentPackageSuggestions()` thay `campaignSuggestions()`, Quick Reply PKG_/ITEM_ postbacks
- [x] `backend/src/api/dashboard.js` — CRUD `/content-packages` + `/content-packages/:id/items`, `POST /migrate-from-campaigns`
- [x] `backend/data/seed.json` — 2 gói mẫu (Tết 2026 + Ra mắt ChatBot) với 8 items đủ 4 loại
- [x] `backend/scripts/seed.js` — seed ContentPackages + Items từ seed.json
- [x] `dashboard/src/lib/api.ts` — `contentPackagesApi` typed client
- [x] `dashboard/src/app/dashboard/layout.tsx` — thêm nav "Gói nội dung" (Package icon)
- [x] `dashboard/src/app/dashboard/content-packages/page.tsx` — UI quản lý 2 cột: packages + items, modal CRUD, migrate button

**Bot delivery flow:**
- Intent `content_package` → bot load tất cả packages → LLM context có cấu trúc `📦 Gói: ...\nNội dung:\n  - [type] title`
- Quick Reply: `PKG_<id>` → hiển thị items của gói, nhóm theo type → `ITEM_<id>` → chi tiết item
- Render đặc biệt: `image_prompt` → code block, `link` → URL, `document` → text, `skill` → mô tả
- UI Dashboard: nút "Migrate từ Campaign" để chạy 1-click migration

**Seed data:**
- 2 packages × 4 items mỗi gói = 8 items mẫu
- Đã seed thành công: 15 knowledge + 2 packages + 8 items

---

### E. Prompt System Simplification ✅ HOÀN THÀNH (2026-06-12)
> Track E — 2-layer prompt: identity (bot persona) + intent (behavioral hint)

**Files đã sửa:**
- [x] `backend/src/bot/engine.js` — `getPromptTemplate()` load identity prompt trước, merge với intent prompt sau. Format: identity + `\n\n---\n\n` + intent hint
- [x] `backend/src/api/dashboard.js` — GET `/prompts` hỗ trợ `?layer=identity|intent`; POST/PUT chấp nhận field `layer`
- [x] Seed Bot Identity template (layer=identity) — mô tả BBO Tech, tính cách, quy tắc, luôn trả lời tiếng Việt

**Cách hoạt động:**
- Layer 1 (identity): 1 template global, luôn được load cho mọi intent
- Layer 2 (intent): template per intentType, bổ sung behavioral hint
- Merge: identity systemPrompt + separator + intent systemPrompt → gửi vào LLM
- Fallback: nếu không có identity template → dùng default "Bạn là trợ lý ảo thân thiện..."
- Fallback: nếu không có intent template → dùng intent fallback template

---

## PHASE 2 — Tháng 2

### F. Quick Reply Menus ✅ HOÀN THÀNH (2026-06-12)
> Track F — Fixed Quick Reply từ database, bỏ qua LLM-generate khi có menu cấu hình

**Files đã tạo/sửa:**
- [x] `backend/src/api/dashboard.js` — CRUD `/quick-reply-menus` với validation items {title, payload}, unique constraint intentType+pageId
- [x] `backend/src/bot/suggestions.js` — `getFixedMenu()` load từ `QuickReplyMenu` table, ưu tiên page-specific → global, fallback dynamic
- [x] `dashboard/src/lib/api.ts` — `quickReplyMenusApi` typed client
- [x] `dashboard/src/app/dashboard/layout.tsx` — thêm nav "Quick Reply"
- [x] `dashboard/src/app/dashboard/quick-replies/page.tsx` — UI quản lý: list view, modal CRUD với multi-item form

**Cách hoạt động:**
- Admin tạo menu cho intent (VD: general → "Xem dịch vụ | Đặt lịch | Về công ty")
- Bot xử lý message → xác định intent → `getFixedMenu(intent)` trả về items
- Nếu có fixed menu → dùng luôn, KHÔNG gọi LLM suggest
- Nếu không có → fallback dynamic suggestions cũ (knowledge-based hoặc LLM)

### G. Multi-page Facebook ✅ HOÀN THÀNH
> Core architecture đã có sẵn: FacebookPage model, CRUD API, webhook routing, per-page context
> Dashboard đã có UI quản lý pages trong Settings

- [x] `FacebookPage` CRUD API (backend/src/api/dashboard.js)
- [x] Webhook routing: `entry.id` → lookupPage() → dùng đúng token + config (backend/src/webhook/handler.js)
- [x] Per-page bot persona + knowledge filter (schema: botPersona, knowledgeFilter fields)
- [x] Page cache với TTL 60s để tránh query DB mỗi event
- [x] Dashboard UI quản lý Facebook Pages (Settings page)

---

## PHASE 3 — Tháng 3

### H. Frontend Dashboard — 🔄 ĐANG XÂY DỰNG song song
> Stack: Next.js + Tailwind, thư mục `dashboard/`
> Đã có: Login, Dashboard overview, Conversations, Knowledge, Appointments, Prompts, Settings, Campaigns, Content-packages

**Pages cần bổ sung / hoàn thiện:**
- [x] Knowledge — thêm filter type/tags, hiển thị type badge, parentId hierarchy ✅
- [x] Prompts — phân biệt rõ 2 tầng: Bot Identity vs Intent hints ✅
- [x] Nhân viên (Staff) — CRUD, toggle isOnDuty, hướng dẫn lấy Telegram Chat ID ✅
- [x] Handoff Monitor — conversations đang pending/human, countdown, force-end từ dashboard ✅
- [x] Cài đặt Handoff — cấu hình timeout, work hours ✅
- [x] Thống kê — handoff rate, response time, intent distribution ✅

### I. Analytics & Monitoring ✅ HOÀN THÀNH (2026-06-12)
> Backend API GET /analytics: handoff stats, fallback rate, response times, intent distribution, hourly/daily activity
> Dashboard page: Analytics page với biểu đồ bar, metric cards, handoff vs bot comparison, staff response time chart

- [x] Tỷ lệ câu hỏi bot không trả lời được (fallback rate indicator + recommendation)
- [x] Handoff rate: bot vs human handling pie chart
- [x] Thời gian phản hồi trung bình (staff avg + 30 recent response times visualized)
- [x] Intent distribution theo ngày/tuần (bar chart + percentage)
- [x] Hourly activity heatmap
- [x] Daily message volume chart
- [x] API endpoint: GET /api/analytics?days=30

---

## DATABASE SCHEMA MỚI — Tóm tắt

```
Staff { id, name, telegramId, telegramChatId, isActive, isOnDuty }
HandoffSettings { pendingTimeoutSeconds, sessionTimeoutSeconds, offHours... }
Conversation += { handoffStatus, assignedStaffId, humanSessionExpiresAt }

KnowledgeBase += { type, tags[], parentId, fileUrl }

ContentPackage { id, name, description, coverUrl, isActive, isPublic }
ContentPackageItem { id, packageId, type, title, content, url, fileUrl, tags[], order }

PromptTemplate += { layer: "identity" | "intent" }
QuickReplyMenu { id, intentType, pageId?, items: JSON, isActive }
FacebookPage { id, pageId, pageName, accessToken, isActive, botPersona, knowledgeFilter[] }
```

---

## NOTES

**Đã xong — cần làm trước khi test toàn hệ thống:**
- Stop server → `npx prisma generate` → restart (Prisma client cần nhận models mới: Staff, HandoffSettings, ContentPackage...)
- Telegram: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_STATUS_GROUP_ID` đã có trong `.env`
- Tạo staff đầu tiên: staff chat với @BotFather-bot → gõ `/myid` → admin POST `/api/staff`

**Kiến trúc quan trọng:**
- Handoff race condition: dùng Prisma `$transaction` → chỉ 1 staff thắng khi claim cùng lúc
- Knowledge type đã có `autoClassify()` gọi LLM — tốn 1 LLM call mỗi lần thêm KB (có thể tắt bằng cách truyền `type` thủ công)
- `scrapeWebsite()` tạo hierarchy H1→H2→H3, dùng `_parentTitle` để link sau khi insert
- Campaign cũ vẫn còn trong DB + API — chưa xóa, chờ Track C migrate xong

**Dashboard frontend:**
- Chạy riêng: `cd dashboard && npm run dev` (port 3000)
- Gọi backend tại `http://localhost:3001/api`
- Cần thêm pages: Staff, Handoff Monitor, Handoff Settings
