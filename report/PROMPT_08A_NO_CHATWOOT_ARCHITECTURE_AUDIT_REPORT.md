# PROMPT 08A — NO-CHATWOOT ARCHITECTURE AUDIT REPORT

## 1. Mục tiêu

Tiếp nhận chỉ thị kiến trúc mới: từ Prompt 08A trở đi, dự án không còn coi Chatwoot là thành phần của kiến trúc đích.

Phạm vi Prompt 08A:

- Scan toàn project để tìm reference Chatwoot.
- Phân loại impact theo backend runtime, schema/migration, env/config, dashboard, DevOps/scripts, docs và historical reports.
- Tạo context kiến trúc No-Chatwoot.
- Cập nhật progress/checklist/refactor roadmap.
- Không xóa hoặc sửa runtime source trong prompt này.

## 2. Lý do chèn Prompt 08A trước RAG/raw SQL

Sau Prompt 07D, kế hoạch cũ là đi vào RAG/raw SQL. User đã đưa directive mới có ảnh hưởng kiến trúc nền: bỏ Chatwoot khỏi target architecture. Nếu tiếp tục RAG/raw SQL trước khi map Chatwoot, các prompt sau có thể tiếp tục thiết kế quanh dependency không còn hợp lệ.

Vì vậy Prompt 08A được chèn trước RAG/raw SQL để:

- Chặn sinh thêm Chatwoot code/config/doc target mới.
- Ghi rõ backend/dashboard/schema/env nào còn phụ thuộc Chatwoot.
- Đặt lại roadmap theo các phase 08B/08C/08D trước Prompt 09 RAG/raw SQL.

## 3. Secret/Git safety

| Check | Kết quả |
|---|---|
| Không mở/in `backend/.env` | PASS |
| Không mở/in `dashboard/.env.local` | PASS |
| Không in `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, token/API key thật | PASS |
| Không dùng `git add .` | PASS |
| Không push remote | PASS |
| Không chạy migration/db push/docker compose/start-all | PASS |
| `.env` tracked/staged | Không phát hiện |

## 4. File/report đã đọc

- `report/PROMPT_07D_LEGACY_GLOBAL_ROUTE_AUTH_CLASSIFICATION_REPORT.md`
- `report/PROMPT_07C_DETAIL_RESOURCE_TENANT_GUARD_REPORT.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/LOCAL_RUN_GUIDE.md`
- `docs/ENV_POLICY.md`
- `backend/src/api/dashboard.js`
- `backend/src/index.js`
- `backend/src/webhook/chatwootHandler.js`
- `backend/src/tenants/webhookHandler.js`
- `backend/src/chatwoot/api.js`
- `backend/src/telegram/handoff.js`
- `backend/prisma/schema.prisma`
- `backend/.env.example`
- `dashboard/.env.example`
- `dashboard/src/lib/api.ts`
- `dashboard/src/lib/config/env.ts`

Không mở `.env` thật.

## 5. Git preflight

| Check | Kết quả |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| Không ở `master/main` | PASS |
| Working tree trước sửa | Clean |
| Remote | Không có output từ `git remote -v` |
| Ignored env | `backend/.env`, `dashboard/.env.local` đều ignored |
| Env tracked | Không có output từ `git ls-files` env patterns |
| Commit Prompt 07D | `b67cc1c` tồn tại |

## 6. Baseline validation

Baseline nhẹ trước docs edit: PASS.

| Command | Kết quả |
|---|---|
| `node --check src/index.js` | PASS |
| `node --check src/db.js` | PASS |
| `node --check src/api/dashboard.js` | PASS |
| `npx prisma validate` | PASS |
| `npx --no-install tsc --noEmit` | PASS |

`npx prisma validate` có đọc env theo cơ chế Prisma nhưng không in secret; output chỉ xác nhận schema valid.

## 7. Chatwoot reference scan summary

Scan đã chạy:

- `rg -n -i "chatwoot" . --glob "!node_modules/**" --glob "!.next/**" --glob "!dist/**" --glob "!build/**" --glob "!coverage/**" --glob "!.git/**"`
- `rg -n "CHATWOOT|Chatwoot|chatwoot" backend dashboard docs report . --glob "!node_modules/**" --glob "!.next/**" --glob "!.git/**" --glob "!dist/**" --glob "!build/**" --glob "!coverage/**"`

Root `scripts/` không tồn tại. `backend/scripts/` tồn tại và có Chatwoot helpers.

Tổng hợp file có reference theo nhóm chính: backend runtime source 15 file, dashboard source 6 file, Prisma schema/migration 3 file, docs current 7 file, historical reports 17 file. Ngoài ra còn `backend/.env.example`, `dashboard/.env.example`, `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt` và `MULTITENANT_PROGRESS.md`.

| Khu vực | File | Dòng/section | Loại reference | Runtime? | Mức rủi ro | Hành động đề xuất |
|---|---|---|---|---|---|---|
| Backend runtime | `backend/src/index.js` | routes `/chatwoot-webhook`, `/chatwoot-webhook/:slug` | Route/webhook | Có | Cao | Prompt 08B bỏ hoặc disable Chatwoot webhook, giữ direct Facebook `/webhook`. |
| Backend runtime | `backend/src/webhook/chatwootHandler.js` | toàn file | Owner Chatwoot webhook | Có | Cao | Prompt 08B loại khỏi entrypoint và quyết định archive/delete sau validation. |
| Backend runtime | `backend/src/tenants/webhookHandler.js` | toàn file | Tenant Chatwoot webhook | Có | Cao | Prompt 08B thay bằng direct tenant Facebook flow nếu còn cần multi-tenant inbound. |
| Backend runtime | `backend/src/chatwoot/api.js`, `backend/src/chatwoot/crypto.js` | toàn file | Chatwoot API/signature helper | Có | Cao | Prompt 08B loại call path; Prompt 08C xử lý credential/schema. |
| Backend runtime | `backend/src/adapters/chatwootAdapter.js` | toàn file | Adapter Chatwoot payload | Có | Cao | Prompt 08B remove sau khi không còn webhook dùng. |
| Backend runtime | `backend/src/telegram/handoff.js`, `backend/src/tenants/handoff.js` | Chatwoot sync/send/links | Handoff relay qua Chatwoot | Có | Cao | Prompt 08B chuyển outbound staff reply sang direct Facebook/backend path. |
| Backend runtime | `backend/src/api/dashboard.js` | `/settings/chatwoot-test`, `/channel-configs/lookup-inboxes`, tenant CRUD/webhook-info Chatwoot fields | Dashboard API Chatwoot config/test | Có | Cao | Prompt 08B/08C bỏ route test và field write sau migration plan. |
| Config helper | `backend/src/infrastructure/services/config.js` | `CHATWOOT_API_TOKEN`, `CHATWOOT_WEBHOOK_SECRET` warnings | Env config | Có gián tiếp | Trung bình | Prompt 08C bỏ khỏi required/placeholder warning list. |
| Prisma | `backend/prisma/schema.prisma` | `Conversation.chatwootConversationId`, `Tenant.chatwoot*` | Schema/data model | Có | Cao | Prompt 08C lập migration cleanup, không `db push`. |
| Prisma migration | `backend/prisma/migrations/20260614120000_multitenant`, `20260615150000_add_conv_chatwoot_and_grace` | `chatwoot_*` columns/index | Historical migration | Không sửa trực tiếp | Trung bình | Giữ migration lịch sử; migration mới phải cleanup an toàn nếu cần. |
| Env/config | `backend/.env.example` | `CHATWOOT_*` | Env example | Không runtime trực tiếp | Cao | Prompt 08C xóa khỏi target env example sau backend removal. |
| Env/config | `dashboard/.env.example`, `dashboard/src/lib/config/env.ts` | `NEXT_PUBLIC_CHATWOOT_URL`, `CHATWOOT_BASE_URL` | Public dashboard config | Có ở UI | Cao | Prompt 08D xóa public env/helper Chatwoot. |
| Dashboard UI/API | `dashboard/src/app/dashboard/settings/page.tsx` | Chatwoot test UI | UI/API call | Có | Cao | Prompt 08D bỏ settings card/API call. |
| Dashboard UI/API | `dashboard/src/app/dashboard/channel-configs/page.tsx` | Chatwoot inbox lookup | UI/API call | Có | Cao | Prompt 08D chuyển channel config khỏi Chatwoot inbox model. |
| Dashboard UI/API | `dashboard/src/app/dashboard/tenants/page.tsx` | tenant Chatwoot model/token/webhook instructions | UI/API payload | Có | Cao | Prompt 08D bỏ form/fields copy sau schema/backend plan. |
| Dashboard API facade | `dashboard/src/lib/api.ts` | tenant handoff + channel/tenant APIs có Chatwoot assumptions | Client API | Có | Trung bình | Prompt 08D cập nhật facade theo backend no-chatwoot API. |
| DevOps/scripts | `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt` | khởi động/dừng Chatwoot, flow Facebook -> Chatwoot | Script/runtime ops | Có nếu chạy | Cao | Prompt 10/DevOps cleanup; không chạy trong 08A. |
| Backend scripts | `backend/scripts/update-chatwoot-agentbot-url.js`, `check_tenant_config.js`, `fix_tenant_token.js`, `test_decrypt.js` | Chatwoot helper/debug | Script | Có nếu chạy | Trung bình | Prompt 08C/10 remove/archive sau runtime removal. |
| Docs current | `docs/ARCHITECTURE.md`, `docs/ENV_POLICY.md`, `docs/FEATURE_INVENTORY.md`, `docs/LOCAL_RUN_GUIDE.md`, `docs/PROJECT_PROGRESS.md`, `docs/REFACTOR_PLAN.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`, `MULTITENANT_PROGRESS.md` | current/future docs vẫn nhắc Chatwoot | Docs | Không | Trung bình | Prompt 08A thêm context mới; prompt sau cập nhật dần docs current. |
| Historical reports | `report/PROMPT_01...` đến `PROMPT_07D...` | audit history | Historical immutable report | Không | Thấp | Giữ nguyên; không dùng làm target architecture. |

## 8. Runtime blockers for no-chatwoot

- `backend/src/index.js` đăng ký `POST /chatwoot-webhook` và `POST /chatwoot-webhook/:slug`.
- `backend/src/webhook/chatwootHandler.js` xử lý owner/backward-compatible Chatwoot webhook và gửi reply qua Chatwoot API.
- `backend/src/tenants/webhookHandler.js` xử lý tenant Chatwoot webhook, validate `X-Chatwoot-*`, adapt event và gửi reply qua tenant Chatwoot client.
- `backend/src/chatwoot/api.js` là client gọi Chatwoot API cho send message, private note, handoff, assignment, contact lookup.
- `backend/src/adapters/chatwootAdapter.js` convert Chatwoot event sang unified message.
- `backend/src/telegram/handoff.js` và `backend/src/tenants/handoff.js` có Chatwoot relay/sync/link trong handoff.
- `backend/src/api/dashboard.js` còn route test Chatwoot, lookup inboxes từ Chatwoot, tenant CRUD fields Chatwoot và webhook-info dạng `/chatwoot-webhook/:slug`.

## 9. Schema/env blockers for no-chatwoot

Schema blockers:

- `Conversation.chatwootConversationId`
- `Tenant.chatwootModel`
- `Tenant.chatwootAccountId`
- `Tenant.chatwootBaseUrl`
- `Tenant.chatwootApiTokenEnc`
- `Tenant.chatwootTeamId`
- Migrations lịch sử tạo các cột/index Chatwoot.

Env/config blockers:

- `backend/.env.example` còn `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_TEAM_ID`, `CHATWOOT_WEBHOOK_SECRET`.
- `dashboard/.env.example` còn `NEXT_PUBLIC_CHATWOOT_URL`.
- `dashboard/src/lib/config/env.ts` export `CHATWOOT_BASE_URL`.
- `docs/ENV_POLICY.md` còn policy cho Chatwoot env.
- `backend/src/infrastructure/services/config.js` còn warning placeholder cho Chatwoot secrets.

## 10. Dashboard blockers for no-chatwoot

- Settings page có card/test Chatwoot và gọi `/api/settings/chatwoot-test`.
- Channel configs page lấy inbox từ Chatwoot và copy vẫn nói "kênh Chatwoot".
- Tenants page có form `chatwootModel`, `chatwootAccountId`, `chatwootBaseUrl`, `chatwootApiToken`, `chatwootTeamId`, hướng dẫn Chatwoot Agent Bot.
- Dashboard env helper và env example expose `NEXT_PUBLIC_CHATWOOT_URL`.
- `dashboard/src/lib/api.ts` vẫn có endpoint liên quan tenant/channel assumptions từ Chatwoot.

## 11. Docs/current architecture blockers

- `docs/ARCHITECTURE.md` còn mô tả Chatwoot trong current architecture và target infrastructure integrations.
- `docs/ENV_POLICY.md` còn Chatwoot env policy.
- `docs/FEATURE_INVENTORY.md` và `MULTITENANT_PROGRESS.md` còn flow Facebook -> Chatwoot -> Backend.
- `docs/LOCAL_RUN_GUIDE.md` còn nhắc không dùng token Chatwoot và cảnh báo script Chatwoot; phần cảnh báo vẫn hữu ích nhưng không phải target architecture.
- `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`, `docs/REFACTOR_PLAN.md` đã được cập nhật để ghi directive mới và phase mới.

## 12. Historical report policy

Các report cũ trong `report/` giữ nguyên nội dung Chatwoot vì đó là bằng chứng audit tại thời điểm trước Prompt 08A. Không rewrite historical reports hàng loạt vì:

- Dễ mất trace quyết định bảo mật trước đó.
- Dễ tạo diff lớn không cần thiết.
- Prompt 08A yêu cầu phân biệt historical immutable report với docs/current architecture.

Từ Prompt 08A trở đi, report mới phải ghi Chatwoot là deprecated/removed target.

## 13. Direct architecture context validation

| Claim trong context mới | Codebase hiện tại | Kết luận | Cần sửa ở Prompt nào |
|---|---|---|---|
| Backend default port là 3001 | `backend/.env.example` có `PORT=3001`; `backend/src/index.js` fallback `3001`; config helper default `3001`; Dockerfile expose `3001` | PASS | Không cần sửa trong 08A |
| Dashboard dev port là 3002 | `dashboard/package.json` dùng `next dev -p 3002` và `next start -p 3002` | PASS | Không cần sửa trong 08A |
| Local DB dùng `localhost:5433` với pgvector | `docs/LOCAL_RUN_GUIDE.md` và `docker-compose.yml` map `5433:5432`; local guide ghi `bbotech-pgvector-local` image `pgvector/pgvector:pg16` | PASS | Giữ trong docs; tránh sample 5432 gây hiểu nhầm |
| PostgreSQL/pgvector | `docker-compose.yml` image `pgvector/pgvector:pg16`; local guide dùng `pgvector/pgvector:pg16` | PASS | DevOps prompt sau |
| Prisma version | `backend/package.json` và lockfile dùng Prisma `5.22.0`, `@prisma/client 5.22.0` | PASS | Không đổi package trong 08A |
| Facebook webhook endpoint | `backend/src/index.js` đăng ký `GET /webhook`, `POST /webhook` cho direct Facebook | PASS | Prompt 08B giữ direct endpoint |
| `/api/settings/webhook` là Meta webhook endpoint | `settings.routes.js`/controller trả config dashboard, không phải callback Meta | MISMATCH | Docs/prompt sau phải gọi đúng `/webhook` |
| Socket.io/WebSocket có thật | Scan không thấy `socket.io`, `io.on`, package Socket.io trong backend/dashboard source/package | NOT FOUND | Không claim event names; chỉ thêm khi code thật xuất hiện |
| Chatwoot removal target | Code hiện còn nhiều runtime/schema/dashboard/env blockers | PASS WITH WARNINGS | 08B/08C/08D |

## 14. Mismatch cần user biết

- Local DB hiện tại dùng `localhost:5433` với container `bbotech-pgvector-local` nếu theo docs/runtime trước đó. Một số sample/dummy trong docs như `localhost:5432` chỉ dùng minh họa validate schema, không đại diện DB local hiện tại.
- `POST /api/settings/webhook` cần được hiểu lại: endpoint actual Meta/Facebook webhook trong code là `POST /webhook`; `/api/settings/webhook` là dashboard config endpoint.
- Socket.io/event names chỉ được claim nếu code có thật. Prompt 08A chưa tìm thấy Socket.io trong source/package.
- Root `scripts/` không tồn tại, nhưng `backend/scripts/` có Chatwoot helper scripts và root `.bat` scripts vẫn chứa Chatwoot flow.
- `webhook-urls-current.txt` chứa URL public cũ/stale cho Chatwoot/ngrok; không coi là config target mới.

## 15. Docs created/updated

Created:

- `docs/NO_CHATWOOT_DIRECT_ARCHITECTURE_CONTEXT.md`
- `report/PROMPT_08A_NO_CHATWOOT_ARCHITECTURE_AUDIT_REPORT.md`

Updated:

- `docs/PROJECT_PROGRESS.md`
- `docs/FEATURE_AUDIT_CHECKLIST.md`
- `docs/REFACTOR_PLAN.md`

## 16. Source runtime changes

KHÔNG.

Prompt 08A không sửa:

- Backend runtime source.
- Prisma schema/migrations.
- RAG/raw SQL.
- Webhook handler logic.
- Dashboard frontend source.
- Package files.
- Dockerfile/scripts.

## 17. Remaining risks

- Backend Chatwoot runtime references vẫn active cho `/chatwoot-webhook*`, Chatwoot API client/adapter và handoff sync.
- Prisma schema/migration references vẫn còn `chatwoot*` fields/index.
- Dashboard UI/API references vẫn còn settings/channel-configs/tenants/env helper.
- Env example/config references vẫn còn `CHATWOOT_*` và `NEXT_PUBLIC_CHATWOOT_URL`.
- RAG/raw SQL vẫn chưa xử lý sau 07D vì Prompt 08A chèn architecture directive trước.
- DevOps script risk vẫn còn trong `start-all.bat`, `stop-all.bat`, `webhook-urls-current.txt`, `backend/scripts/*`.

## 18. Final verdict

**PASS WITH WARNINGS — directive captured, blockers found.**

Lý do không phải PASS sạch: codebase hiện còn nhiều Chatwoot references active ở runtime/schema/dashboard/env. Prompt 08A đã map đầy đủ và không xóa runtime khi chưa có phase removal cụ thể.

## 19. Next Step & Goal

Khuyến nghị thứ tự tiếp theo:

1. **Prompt 08B — Backend Chatwoot runtime removal**: bỏ/disable route `/chatwoot-webhook*`, Chatwoot client/adapter, tenant Chatwoot webhook và handoff sync; giữ direct Facebook `/webhook`; validation bằng `node --check`, Prisma validate và smoke không gọi external thật.
2. **Prompt 08C — Schema/env cleanup plan**: thiết kế migration safe cho `chatwoot*` fields và xóa `CHATWOOT_*`/`NEXT_PUBLIC_CHATWOOT_URL` khỏi env examples/config; không dùng `db push`.
3. **Prompt 08D — Dashboard cleanup**: bỏ UI/API Chatwoot khỏi settings, tenants, channel-configs và dashboard env helper.
4. **Prompt 09 — RAG/raw SQL hardening**: xử lý `$queryRawUnsafe`, pgvector query, upload/scrape tenant/RAG side effect sau khi No-Chatwoot path rõ.
