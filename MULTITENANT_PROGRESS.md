# Multi-Tenant Implementation Progress

## Kiến trúc tổng quan

```
Platform Admin (dashboard)
  └── Quản lý nhiều Tenant (công ty)
        ├── Tenant A (slug: cong-ty-a)
        │     ├── TenantStaff (nhân viên riêng)
        │     ├── TenantChannelConfig (Chatwoot inbox riêng)
        │     ├── Knowledge (riêng + kế thừa global)
        │     ├── PromptTemplate (riêng + kế thừa global)
        │     ├── ContentPackage (riêng + kế thừa global)
        │     ├── QuickReplyMenu (riêng + kế thừa global)
        │     └── Appointment (riêng)
        └── Tenant B (slug: cong-ty-b)
              └── ...
```

### Nguyên tắc Global vs Tenant-specific
- `tenantId = null` → **Global** — dùng chung cho tất cả tenant (default/template)
- `tenantId = <uuid>` → **Tenant-specific** — chỉ riêng cho tenant đó
- Bot khi xử lý message của Tenant A sẽ query: **global + Tenant A** (ưu tiên tenant-specific)

### Flow webhook
```
Facebook/Zalo → Chatwoot Inbox → Agent Bot webhook
                                     ↓
                    POST /chatwoot-webhook/:slug
                                     ↓
                    tenants/webhookHandler.js
                                     ↓
                    botEngine.processMessage(..., { tenantId })
                                     ↓
                    RAG + Prompt + Tools (filtered by tenantId)
```

---

## ✅ Bước 1 — Schema + Bot Engine (HOÀN THÀNH)

### Schema changes (`backend/prisma/schema.prisma`)

| Model | Thay đổi |
|---|---|
| `KnowledgeBase` | Thêm FK relation đến `Tenant` (field `tenantId` đã có sẵn) |
| `PromptTemplate` | Thêm `tenantId String?` + FK đến `Tenant` |
| `ContentPackage` | Thêm `tenantId String?` + FK đến `Tenant` |
| `QuickReplyMenu` | Thêm `tenantId String?` + FK; đổi unique constraint → `[tenantId, intentType, pageId]` |
| `Appointment` | Thêm `tenantId String?` + FK đến `Tenant` |
| `AdminUser` | Thêm `tenantId String?` — null = platform admin, non-null = tenant admin |
| `Tenant` | Thêm 6 back-relations: knowledgeBase, promptTemplates, contentPackages, quickReplyMenus, appointments, adminUsers |

### Bot Engine changes

**`backend/src/rag/pipeline.js`**
- Vector search: `tenant_id = X` → `(tenant_id = X OR tenant_id IS NULL)` — global luôn được kéo về
- Fallback text search: cùng logic OR

**`backend/src/bot/agent.js`**
- `buildSystemPrompt` nhận thêm `tenantId`
- Load identity prompt: tenant-specific trước → fallback về global nếu tenant chưa có

**`backend/src/bot/tools.js`**
- `get_content_package`: filter `{ OR: [{ tenantId }, { tenantId: null }] }`
- `create_appointment`: gán `tenantId` khi tạo lịch hẹn

### Dashboard changes
- Ẩn **Nhân viên** và **Handoff** cũ khỏi nav (dùng TenantStaff thay)
- Ẩn **Kênh chat** global (dùng TenantChannelConfig trong Tenants)

---

## ✅ Bước 2 — Auth + Dashboard Context (HOÀN THÀNH)

### Đã làm

**Backend (`backend/src/api/dashboard.js`)**
- [x] Login endpoint trả về `tenantId` trong JWT payload và response
- [x] `getTenantScope(req)` helper — tenant admin locked, platform admin dùng `?tenantScope=`
- [x] `platformAdminOnly` middleware — block tenant admin khỏi `/tenants` endpoints
- [x] `GET/POST /knowledge` scope by tenantId
- [x] `PUT/DELETE /knowledge/:id` — ownership verification trước khi update/delete
- [x] `GET/POST/PUT/DELETE /prompts` — scope + ownership check
- [x] `GET/POST/PUT/DELETE /content-packages` — scope + ownership check
- [x] `GET/POST/PUT/DELETE /quick-reply-menus` — scope + ownership check
- [x] `GET /appointments` — scope by tenantId
- [x] `GET/POST/PUT/DELETE /tenants` — thêm `platformAdminOnly` middleware
- [x] `GET/POST/DELETE /admin-users` — endpoint mới tạo tenant admin account

**Dashboard (`dashboard/src/`)**
- [x] `lib/auth.tsx` — thêm `tenantId` vào User interface, `isPlatformAdmin`, `selectedTenantId`, `setSelectedTenantId` vào context
- [x] `lib/api.ts` — interceptor tự động gắn `tenantScope` query param từ localStorage
- [x] `lib/api.ts` — thêm `adminUsersApi`
- [x] `app/dashboard/layout.tsx` — tenant switcher dropdown cho platform admin; ẩn Tenants nav cho tenant admin

---

## ✅ Bước 3 — Dashboard Pages (HOÀN THÀNH)

- [x] `TenantScopeBanner` component — hiển thị "Global" hoặc "tenant đã chọn" trên đầu mỗi trang (chỉ hiện với platform admin)
- [x] **Kiến thức** — `selectedTenantId` vào useEffect deps, reset page khi đổi tenant
- [x] **Prompt** — `selectedTenantId` vào useEffect deps
- [x] **Gói nội dung** — `selectedTenantId` vào useEffect deps
- [x] **Quick Reply** — `selectedTenantId` vào useEffect deps
- [x] **Lịch hẹn** — `selectedTenantId` vào useEffect deps, reset page khi đổi tenant

Flow hoàn chỉnh: platform admin đổi tenant trên dropdown top bar → `selectedTenantId` lưu vào localStorage → API interceptor tự gắn `?tenantScope=<id>` → backend scope đúng data → tất cả trang tự reload

---

## Ghi chú kỹ thuật

### Chatwoot handoff (đã hoạt động)
- `botTakeOver` dùng `status: 'open'` (không phải `pending`) để Chatwoot tiếp tục gửi Agent Bot webhook
- Handoff settings per-tenant nằm trong bảng `Tenant` (pendingTimeoutSeconds, sessionTimeoutSeconds, etc.)

### Tenant webhook URL
```
POST https://<ngrok>/chatwoot-webhook/<slug>
```
- HMAC-SHA256 validation với `webhookSecretEnc` (AES-256-GCM encrypted)
- `shared` model: dùng Chatwoot của platform (CHATWOOT_BASE_URL env)
- `dedicated` model: tenant tự host Chatwoot riêng

### fbUserId format cho tenant conversations
```
"<tenantSlug>::<originalUserId>"
```
Giúp giữ @@unique constraint trên bảng Conversation.

### Files quan trọng
| File | Mục đích |
|---|---|
| `backend/src/tenants/webhookHandler.js` | Xử lý Chatwoot Agent Bot webhook theo tenant |
| `backend/src/tenants/handoff.js` | Handoff logic cho TenantStaff |
| `backend/src/tenants/registry.js` | Load + cache tenant từ DB (5-min TTL) |
| `backend/src/chatwoot/api.js` | Chatwoot API client (createClientFromTenant) |
| `backend/src/api/dashboard.js` | REST API cho dashboard |
| `backend/prisma/schema.prisma` | Database schema |
