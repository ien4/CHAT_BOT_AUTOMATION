# PROMPT 21B-5 — BACKEND ROUTE CONSOLIDATION OR NO SAFE CANDIDATE REPORT

Ngày thực hiện: 2026-07-14
Final verdict: **PASS**

## 1. Mục tiêu

Tiếp tục Phase 21 sau Prompt 21Y ở chế độ an toàn: audit `backend/src/api/dashboard.js`, chỉ tách đúng một nhóm route `GET` read-only nhỏ nếu đủ bằng chứng an toàn; nếu không thì dừng với `NO_SAFE_CANDIDATE`.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Commit 21Y | `521a71e Reorganize docs and reports into project status structure` tồn tại và là HEAD trước prompt |
| Working tree trước patch | Sạch, chỉ ignored `.env`, `.next`, `node_modules`, backups, `tmp-runtime` |
| `.next` ignored | PASS |
| `backend/.env`, `dashboard/.env.local` ignored | PASS |
| Tracked env thật | Không có; chỉ `backend/.env.example` là sample tracked hợp lệ |

Không đọc hoặc in giá trị secret/env thật.

## 3. Context files read

- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/PROJECT_PHASE_BOARD.md`
- `docs/status/BUG_TRACKER.md`
- `docs/status/DASHBOARD_ROUTE_SMOKE_MATRIX.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/index/DOCS_REPORT_ORGANIZATION_MAP.md`
- `report/phase-21/PROMPT_21Y_DOCS_REPORT_REORGANIZATION_REPORT.md`
- `report/phase-21/PROMPT_21B_4_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`
- `report/README.md`
- `report/phase-21/README.md`

## 4. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `backend npm run quality` | PASS |
| `backend npx prisma validate` | PASS |
| `dashboard npm run typecheck` | PASS |
| `dashboard npm run build` | PASS |
| Root `git diff --check` trước patch | PASS |
| Root `git diff --name-status` trước patch | Sạch |

## 5. Route map audit

Audit toàn bộ `router.get(...)` còn lại trong `backend/src/api/dashboard.js`.

| Route | Method | Auth/Guard | Prisma operations | External call? | Mutation? | Secret/token field? | Raw SQL? | Risk | Decision |
|---|---|---|---|---|---|---|---|---|---|
| `/auth/me` | GET | `authMiddleware` | `adminUser.findUnique` select safe fields | Không | Không | Không trả token/password | Không | Auth core adjacency | Loại vì auth core, không cần tách trong prompt này |
| `/admin-users` | GET | `authMiddleware`, `platformAdminOnly` | `adminUser.findMany` select `id`, `username`, `role`, `tenantId`, `createdAt` | Không | Không | Không `passwordHash`, không token | Không | Thấp nếu giữ platform-only | **Chọn** |
| `/conversations` | GET | `authMiddleware`, tenant scope query | `conversation.findMany/count` | Không | Không | Có PII hội thoại/user | Không | Conversation/PII scope | Loại |
| `/conversations/:id` | GET | `authMiddleware`, tenant scope | Prisma scope check + `contextManager.getConversationSummary` | Không trực tiếp | Không | Có PII/context | Không | Context manager phức tạp | Loại |
| `/conversations/:id/messages` | GET | `authMiddleware`, tenant scope | `conversation.findFirst`, `message.findMany` | Không | Không | Message text/PII | Không | Message PII | Loại |
| `/knowledge`, `/knowledge/:id` | GET | `authMiddleware`, tenant scope | `knowledgeBase.findMany/count/findUnique/findFirst` | Không trong GET | Không | Content/source URLs | Không | RAG/upload/scrape/reindex domain | Loại |
| `/prompts/:id` | GET | `authMiddleware`, tenant scope | `promptTemplate.findUnique/findFirst` | Không | Không | Prompt content | Không | Prompt read routes đã tách một phần; domain có writes | Loại, không chọn lại prompts |
| `/providers` | GET | `authMiddleware`, `platformAdminOnly` | `llmProvider.findMany` select excludes key | Provider domain | Không | API key adjacency, `hasApiKey` | Không | Secret/provider risk | Loại |
| `/content-packages`, `/:id`, `/:packageId/items` | GET | `authMiddleware`, tenant scope | `contentPackage`/items reads | Không | Không trong GET | Content data | Không | Domain có migrate/write/action | Loại |
| `/appointments` | GET | `authMiddleware`, tenant scope | `appointment.findMany/count` | Không trong GET | Không | Appointment PII | Không | Mutation route có notification side effect | Loại |
| `/staff` | GET | `authMiddleware`, `platformAdminOnly` | `staff.findMany` | Không | Không | Staff/telegram fields có thể nhạy cảm | Không | Domain có writes | Loại |
| `/handoff/active`, `/handoff/staff-status`, `/handoff/bot-queue` | GET | `authMiddleware`, `platformAdminOnly` | Conversation/staff reads | Handoff/Telegram adjacency | Không | Conversation/staff PII | Không | Realtime handoff risk | Loại |
| `/facebook-pages`, `/facebook-pages/:id` | GET | `authMiddleware`, `platformAdminOnly` | Facebook page config reads | Facebook domain | Không | Token/config adjacency | Không | External/settings risk | Loại |
| `/settings/facebook-menu` | GET | `authMiddleware`, `platformAdminOnly` | Không Prisma | Có, `facebookMenu.getProfile()` | Không | Facebook config | Không | External provider | Loại |
| `/fb-subscription` | GET | `authMiddleware`, `platformAdminOnly` | Không Prisma | Có Graph API | Không | Uses page access token internally | Không | External/secret | Loại |
| `/analytics` | GET | `authMiddleware`, `platformAdminOnly` | Counts/groupBy + tagged `$queryRaw` | Không | Không | Không token | Tagged raw SQL | Query phức tạp | Loại |
| `/tenants`, `/tenants/:id` | GET | `authMiddleware`, `platformAdminOnly` | Tenant reads + mask | Không | Không trong GET | Tenant config adjacency | Không | Tenant core | Loại |
| `/tenants/:id/staff` | GET | `authMiddleware`, `tenantPathAccessOnly` | `tenantStaff.findMany` | Không | Không | Telegram/staff fields | Không | Tenant core + staff | Loại |
| `/tenants/:id/channel-configs` | GET | `authMiddleware`, `tenantPathAccessOnly` | `tenantChannelConfig.findMany` | Không | Không | Channel config | Không | Tenant core | Loại |
| `/tenants/:id/knowledge` | GET | `authMiddleware`, `tenantPathAccessOnly` | `knowledgeBase.findMany` | Không | Không | Knowledge content metadata | Không | Tenant + RAG domain | Loại |
| `/tenants/:id/webhook-info` | GET | `authMiddleware`, `tenantPathAccessOnly` | `tenant.findUnique` | Không | Không | Webhook legacy info | Không | Tenant/webhook legacy | Loại |

Các route đã tách trước đó không chọn lại: prompts list/settings read/quick-reply-menus/channel-configs/campaigns/stats.

## 6. Candidate decision

Có candidate: **`GET /api/admin-users`**.

Lý do an toàn:

- GET-only.
- Có `authMiddleware` và `platformAdminOnly`.
- Chỉ Prisma read `findMany`.
- Không trả `passwordHash`, token, secret hoặc API key.
- Không external provider.
- Không raw SQL.
- Không mutation/upload/import/reindex/scrape.
- Có thể smoke local bằng token ký trong bộ nhớ, không in token.

## 7. Source changes

Đã sửa source backend đúng phạm vi:

- `backend/src/api/dashboard.js`
- `backend/src/infrastructure/repositories/adminUsers.repository.js`
- `backend/src/presentation/http/controllers/dashboard/adminUsers.controller.js`
- `backend/src/presentation/http/routes/dashboard/adminUsers.routes.js`

Không sửa dashboard source, schema/migration/package/env.

## 8. API contract preservation

Giữ nguyên:

- Path: `GET /api/admin-users`
- Auth: `authMiddleware`
- Guard: `platformAdminOnly`
- No-token behavior: 401
- Tenant-token behavior: 403
- Platform-token behavior: 200
- Response shape: array user objects với `id`, `username`, `role`, `tenantId`, `createdAt`
- Excluded field: không trả `passwordHash`
- Error shape: `500 { error: 'Internal server error' }`

`POST /api/admin-users` và `DELETE /api/admin-users/:id` không đổi.

## 9. Backend validation

| Lệnh | Kết quả |
|---|---|
| `node --check src/api/dashboard.js` | PASS |
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/infrastructure/repositories/adminUsers.repository.js` | PASS |
| `node --check src/presentation/http/controllers/dashboard/adminUsers.controller.js` | PASS |
| `node --check src/presentation/http/routes/dashboard/adminUsers.routes.js` | PASS |
| `npm run quality` | PASS |
| `npx prisma validate` | PASS |

## 10. Backend runtime smoke

Smoke chạy bằng Express app tạm chỉ mount source mới `/api`, `/health`, `GET /webhook`; không gọi startup `src/index.js`, không gọi external provider, không gửi POST `/webhook`, không in token.

| Check | Kết quả |
|---|---|
| `GET /health` | PASS 200 |
| `GET /webhook` thiếu params | PASS 403 |
| `POST /chatwoot-webhook` | PASS 404 |
| `GET /api/admin-users` no token | PASS 401 |
| `GET /api/admin-users` tenant token | PASS 403 |
| `GET /api/admin-users` platform token | PASS 200, array không có `passwordHash` |
| `GET /api/prompts` | PASS 200 |
| `GET /api/settings/webhook` | PASS 200 |
| `GET /api/channel-configs` | PASS 200 |
| `GET /api/quick-reply-menus` | PASS 200 |
| `GET /api/campaigns` | PASS 200 |
| `GET /api/stats` | PASS 200 |
| `GET /api/analytics?days=7` | PASS 200 |

## 11. Safety scans

| Scan | Kết quả |
|---|---|
| `$queryRawUnsafe` / `$executeRawUnsafe` trong `backend/src backend/scripts` | Không có source unsafe mới; chỉ README repository lịch sử nhắc từ khóa |
| `new PrismaClient` trong `backend/src` | Chỉ singleton `backend/src/db.js` |
| `chatwoot/CHATWOOT/Chatwoot` trong `backend/src` | Chỉ README layer lịch sử, không runtime mới |
| `prisma db push/accept-data-loss/migrate reset/--force` | Chỉ docs/report/script warning lịch sử, không thêm executable mới |
| `git diff --check` | PASS |

## 12. Dashboard regression gate

| Gate | Kết quả |
|---|---|
| Port audit | `3002` có dashboard Next dev server cũ PID `25480`; `3019/3020/3021` rảnh |
| Stop old dashboard server | PASS, chỉ dừng PID `25480` thuộc workspace dashboard |
| Clean `.next` | PASS, verified `dashboard/.next` rồi xóa |
| Dashboard `npm run typecheck` | PASS |
| Dashboard `npm run build` | PASS |
| Fresh dev server | PASS, `127.0.0.1:3019` |
| Full route smoke | PASS, 15 route thật 200 + fake route 404 |
| Static asset smoke | PASS, 125/125 assets 200 |
| Dev log scan | PASS, 0 hit |

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
- `/dashboard/__fake_21b_5__` trả 404 hợp lệ

## 13. Docs/report updates

Đã cập nhật:

- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/PROJECT_PHASE_BOARD.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/phase-21/README.md`
- `report/phase-21/PROMPT_21B_5_BACKEND_ROUTE_CONSOLIDATION_OR_NO_SAFE_CANDIDATE_REPORT.md`

## 14. Broken-link check

Kết quả sau docs/report update:

- Broken live path trong `docs/` + `report/`: **0**.
- Tổng path refs đã scan: 958.
- Không tạo link root report/docs cũ mới.

## 15. Forbidden areas unchanged

Không sửa:

- `backend/src/webhook/**`
- `backend/src/rag/**`
- `backend/src/bot/**`
- `backend/src/tenants/**`
- `backend/src/telegram/**`
- `backend/src/facebook/**`
- `backend/src/notifications/**`
- `dashboard/src/**`
- Prisma schema/migrations
- package/package-lock
- Docker/start scripts
- `.env`, `.env.local`, `.next`, logs/temp/backup

Không gọi external provider thật, không gửi POST `/webhook`, không claim Meta verified, không claim production ready.

## 16. Final verdict

**PASS**

Bắt buộc trả lời:

- Có candidate không? Có.
- Route nào? `GET /api/admin-users`.
- Vì sao an toàn? GET-only, platform-only, Prisma read-only, không secret/token/passwordHash, không external, không raw SQL, không mutation.
- Có sửa `backend/src/api/dashboard.js` không? Có, chỉ mount route factory và xóa GET handler inline.
- Có sửa dashboard source không? Không.
- Có sửa schema/package/env không? Không.
- Backend quality PASS không? Có.
- Prisma validate PASS không? Có.
- Dashboard typecheck/build PASS không? Có.
- Backend smoke PASS không? Có.
- Dashboard full route smoke PASS không? Có.
- Static asset smoke PASS không? Có, 125/125.
- Dev log scan sạch không? Có.
- Broken-link check PASS không? Có.
- Commit mới là gì? Commit được tạo ở Phase 13; xem final response hoặc `git log -1`.

## 17. Next step

Tiếp theo nên chạy `21B-6-SAFE` chỉ khi audit chứng minh còn route GET/read-only nhỏ thật sự an toàn. Nếu các route còn lại đều thuộc conversations/knowledge/providers/handoff/Facebook/tenants/analytics hoặc domain có mutation/action/PII, trả `NO_SAFE_CANDIDATE` thay vì tách bừa.
