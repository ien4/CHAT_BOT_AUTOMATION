# PROMPT 21B-4 — BACKEND ROUTE CONSOLIDATION REPORT

Ngày thực hiện: 2026-07-13
Trạng thái: **PASS**

## 1. Mục tiêu

Tiếp tục Phase 21 backend structure consolidation bằng cách chọn tối đa 1 nhóm route GET read-only/low-risk còn lại trong `backend/src/api/dashboard.js`, tách sang repository/controller/routes theo hướng Clean Architecture nhỏ, không đổi behavior và không đụng vùng rủi ro cao.

## 2. Preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run`, không switch branch |
| Commit nền | `80a8652 Confirm Meta webhook staging real event and log safety` tồn tại |
| Working tree trước patch | Sạch, chỉ ignored env/node_modules/.next/backups/tmp-runtime |
| Env safety | `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đều ignored |
| Tracked sensitive env exact scan | Không có env thật tracked/staged |
| Regex scan theo prompt | Match `backend/.env.example`; đây là sample tracked hợp lệ, không phải env thật |

Không mở/in env thật, token hoặc secret.

## 3. Context files read

- `report/phase-22/PROMPT_22C_META_REAL_EVENT_REPORT.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/status/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md`
- `docs/status/META_WEBHOOK_STAGING_READINESS.md`
- `backend/src/api/dashboard.js`
- Existing repositories/controllers/routes dưới:
  - `backend/src/infrastructure/repositories/`
  - `backend/src/presentation/http/controllers/dashboard/`
  - `backend/src/presentation/http/routes/dashboard/`

Không đọc env thật.

## 4. Baseline validation

| Lệnh | Kết quả |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS |
| Root `git diff --check/stat/name-status` trước patch | Sạch |

## 5. Route map

Route map `backend/src/api/dashboard.js` được audit bằng `rg -n "router\\.(get|post|put|delete|use)"`.

| Route | Method | Domain | Auth/Guard | Read-only? | External? | Mutation? | Raw SQL? | Secret risk? | Candidate? | Lý do |
|---|---|---|---|---|---|---|---|---|---|---|
| `/stats` | GET | dashboard stats | `authMiddleware`, `platformAdminOnly` | Có | Không | Không | Không | Không | Có | GET-only, Prisma count/findMany/groupBy, response shape rõ |
| `/conversations*` | GET | conversations | `authMiddleware` | Có | Không | Không | Không | Có PII/message context | Không | Dữ liệu hội thoại/customer, tenant/message scope rủi ro hơn |
| `/knowledge*` | GET/POST/PUT/DELETE | knowledge/RAG | `authMiddleware` | Một phần | Có thể qua RAG/scrape | Có | Không unsafe mới | Có content data | Không | Có upload/scrape/reindex/write risk |
| `/providers*` | GET/POST/PUT/DELETE/test | providers | platform-only | Một phần | Có test provider | Có | Không | Có API key encrypted | Không | Secret/external provider risk |
| `/content-packages*` | GET/POST/PUT/DELETE/action | content packages | `authMiddleware` | Một phần | Không | Có | Không | Thấp | Không | Có migrate/action/write risk |
| `/appointments*` | GET/PUT | appointments | `authMiddleware` | Một phần | Notification side effect ở PUT | Có | Không | PII lịch hẹn | Không | Gần notification mutation |
| `/staff*` | GET/POST/PUT/DELETE | staff | platform-only | Một phần | Không | Có | Không | Staff data | Không | Có write routes cùng domain |
| `/handoff*` | GET/POST | handoff | platform-only | Một phần | Telegram/handoff realtime | Có | Không | Conversation/staff | Không | Realtime side effect |
| `/facebook-pages*`, `/settings/facebook-menu`, `/fb-subscription`, `/test-message` | GET/POST/PUT/DELETE | Facebook settings | platform-only | Một phần | Có | Có | Không | Token/config risk | Không | External/secret/webhook adjacency |
| `/analytics` | GET | analytics | platform-only | Có | Không | Không | Tagged raw SQL | Không | Không | Lớn hơn stats, raw SQL query phức tạp hơn |
| `/tenants*` | GET/POST/PUT/DELETE | tenants core | platform/tenant path | Một phần | Không | Có | Không | Tenant core | Không | Tenant core/auth scope risk |

## 6. Candidate selection

Chọn `GET /api/stats`.

Không chọn route khác vì hoặc có external provider, mutation/write, upload/migrate/action, tenant/core risk, conversation/message PII risk, handoff realtime, RAG/knowledge side effect hoặc secret/token field.

## 7. Vì sao an toàn

- GET-only, không có detail/write/fall-through cùng path.
- Có `authMiddleware` và `platformAdminOnly` rõ ràng.
- Chỉ đọc bằng Prisma:
  - `count()` trên conversation/message/appointment/knowledge.
  - `findMany()` chỉ select `createdAt` để tính `messagesByDay`.
  - `groupBy()` intent distribution.
- Không external provider.
- Không mutation.
- Không raw SQL.
- Không token/secret field.
- Không upload, migrate, notification, handoff, RAG, webhook hoặc bot context.

## 8. Patch summary

Thay đổi source:

- Tạo `backend/src/infrastructure/repositories/dashboardStats.repository.js`.
- Tạo `backend/src/presentation/http/controllers/dashboard/stats.controller.js`.
- Tạo `backend/src/presentation/http/routes/dashboard/stats.routes.js`.
- `backend/src/api/dashboard.js` thêm require `createStatsRoutes` và mount `router.use('/stats', createStatsRoutes({ authMiddleware, platformAdminOnly, prisma }))`.
- Xóa handler inline `router.get('/stats', ...)` khỏi `dashboard.js`.

## 9. API contract preservation

Giữ nguyên:

- Public path: `GET /api/stats`.
- Auth: `authMiddleware`.
- Guard: `platformAdminOnly`.
- No-token behavior: 401.
- Tenant token behavior: 403.
- Platform token behavior: 200.
- Response JSON shape:
  - `totalConversations`
  - `activeConversations`
  - `totalMessages`
  - `totalAppointments`
  - `pendingAppointments`
  - `knowledgeCount`
  - `messagesByDay`
  - `intentDistribution`
- Error behavior: log `Stats error:` và trả `500 { error: 'Lỗi máy chủ nội bộ' }`.

## 10. Runtime smoke

Local readiness:

| Check | Kết quả |
|---|---|
| Docker client/server | PASS |
| `bbotech-pgvector-local` | PASS, container Up |
| DB port `5433` | PASS |
| Backend port `3001` | PASS |
| `npx prisma migrate deploy` | PASS, no pending migrations |

Smoke:

| Check | Kết quả |
|---|---|
| `GET /health` trên backend hiện có | PASS 200 |
| `GET /webhook` thiếu params trên backend hiện có | PASS 403 |
| `POST /chatwoot-webhook` body `{}` trên backend hiện có | PASS 404 |
| `GET /api/stats` no token trên app tạm source mới | PASS 401 |
| `GET /api/stats` tenant token trên app tạm source mới | PASS 403 |
| `GET /api/stats` platform token trên app tạm source mới | PASS 200 đúng shape |
| `GET /api/prompts` | PASS 200 |
| `GET /api/settings/webhook` | PASS 200 |
| `GET /api/channel-configs` | PASS 200 |
| `GET /api/quick-reply-menus` | PASS 200 |
| `GET /api/campaigns` | PASS 200 |
| `GET /api/analytics?days=7` | PASS 200 |
| Cleanup admin tạm | PASS, deleted 1 |

Smoke không in credential/token/secret và không gọi external provider.

## 11. Safety scans

| Scan | Kết quả |
|---|---|
| `$queryRawUnsafe` / `$executeRawUnsafe` trong `backend/src backend/scripts` | Không có source unsafe; chỉ còn README lịch sử nhắc từ khóa |
| `chatwoot` trong `backend/src` | Chỉ README lịch sử, không runtime mới |
| `prisma db push` / `accept-data-loss` / `migrate reset` | Chỉ docs/report/comment lịch sử và warning script; không thêm executable mới |
| `new PrismaClient` trong `backend/src` | Chỉ singleton `backend/src/db.js` |

Không thêm raw unsafe, Chatwoot runtime, destructive command hoặc PrismaClient mới.

## 12. Docs changed

- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `report/phase-21/PROMPT_21B_4_BACKEND_ROUTE_CONSOLIDATION_REPORT.md`

## 13. Không thay đổi

- Không sửa webhook.
- Không sửa RAG.
- Không sửa bot.
- Không sửa tenants/handoff.
- Không sửa telegram/facebook/notifications.
- Không sửa dashboard source.
- Không sửa Prisma schema/migrations.
- Không sửa package/package-lock.
- Không sửa Dockerfile/docker-compose/start scripts.
- Không sửa env thật, `.next`, backups, tmp-runtime, logs.
- Không gọi Meta/Facebook/Telegram/Gemini/Jina/LLM thật.
- Không gửi POST `/webhook`.
- Không claim Meta verified hoặc production ready.

## 14. Remaining risks

- Phase 21 vẫn **Started**, chưa Done; `dashboard.js` vẫn còn route debt.
- Các route conversations/knowledge/providers/handoff/facebook/tenants/settings external vẫn cần prompt riêng hoặc nên để nguyên.
- Meta verify vẫn pending; Meta POST event thật pending; production rollout pending.

## 15. Final verdict

**PASS**

`GET /api/stats` đã được tách an toàn, contract giữ nguyên, validation/smoke/safety scans PASS.

## 16. Next step

Nếu tiếp tục Phase 21, chạy prompt 21B-5 chỉ khi audit tìm được một route GET read-only nhỏ khác không external/mutation/raw SQL/secret. Nếu không có candidate đủ an toàn, dừng với `NO_SAFE_CANDIDATE` thay vì tách route rủi ro.
