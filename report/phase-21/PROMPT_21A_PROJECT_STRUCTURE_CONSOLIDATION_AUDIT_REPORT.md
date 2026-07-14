# PROMPT 21A — PROJECT STRUCTURE CONSOLIDATION AUDIT REPORT

Ngày thực hiện: 2026-07-11
Trạng thái: **PASS** (audit/plan-only, không move code)

## 1. Mục tiêu

Rà soát toàn bộ cấu trúc dự án sau nhiều phase, lập bản đồ backend/dashboard/docs/report/scripts, đánh giá readiness cấu trúc cho public/production, và tạo kế hoạch Phase 21B/21C/21D theo hướng an toàn từng bước nhỏ. **Audit-only / Plan-only** — không sửa source runtime, không move file, không rename, không đổi import/behavior, không đụng package/schema/migrations.

## 2. Preflight

- Branch: `chore/prompt-05r-docs-local-run` (không phải master/main).
- Commit 19D `284a610 Split appointments dashboard feature` tồn tại.
- `git remote -v` rỗng (không push remote — đúng yêu cầu).
- `.env`, `.env.local`, `.next` đều gitignored; chỉ `backend/.env.example` tracked. Không env secret tracked/staged.
- Working tree sạch trước khi sửa docs/report (ignored: `.claude/`, `node_modules/`, `.next/`, `backups/`, `tmp-runtime/`, `dashboard/tsconfig.tsbuildinfo`).

## 3. Validation baseline (read-only, no mutation)

| Check | Lệnh | Kết quả |
|---|---|---|
| Backend quality | `npm run quality` (syntax + prisma validate) | PASS |
| Backend prisma | `npx prisma validate` | PASS (schema valid) |
| Dashboard typecheck | `npm run typecheck` | PASS |
| Dashboard build | `npm run build` | PASS (19 route) |
| Diff sạch | `git diff --check` / `--stat` | Không có source/runtime diff |

## 4. Backend structure audit

| Khu vực | Hiện trạng | Vấn đề | Đề xuất |
|---|---|---|---|
| `src/index.js` (388) | Entry Express + startup | Nhiều concern | Giữ nguyên |
| `src/api/dashboard.js` (**2363 LOC, 96 route**) | Monolith đa domain, Prisma scattered | Nợ cấu trúc lớn nhất | Rút route low-risk từng nhóm (21B) |
| `src/presentation/http/**` | Đã tách prompts (GET) + settings (handoff/telegram) ~5 route | Mới rút ~5/96 | Tiếp tục pattern |
| `src/infrastructure/repositories/**` | 3 repo (handoffSettings/promptTemplates/telegramDestinations) | Đúng hướng, còn ít | Gom thêm (21B) |
| `src/domain/**`, `src/application/**` | README-only shell rỗng | Chưa dùng | Điền khi có use-case thật |
| `src/bot,rag,webhook,tenants,telegram,facebook,llm,notifications` | Runtime flat modules | Chưa vào integrations | **KHÔNG move** (rủi ro cao) |
| `src/chatwoot`, `src/adapters`, `integrations/chatwoot` | **Dir rỗng 0 file** | Legacy placeholder | Cleanup 21D |
| `prisma/schema.prisma` (338), `migrations/**` (12) | Ổn định | — | KHÔNG đụng |

Findings: dependency ngược layer chưa xuất hiện (domain/application rỗng); Prisma access vẫn scattered trong `dashboard.js`; không còn `$queryRawUnsafe`/`$executeRawUnsafe`; không có Chatwoot runtime mới (chỉ 3 README lịch sử).

## 5. Dashboard structure audit

| Page | LOC | Side effect | Split? | Rủi ro |
|---|---:|---|---|---|
| analytics | 54 | read | ✅ 19A | Thấp |
| prompts | 52 | write nhẹ | ✅ 19B | Thấp |
| staff | 51 | write | ✅ 19C | Thấp |
| appointments | 37 | write+notif | ✅ 19D | TB |
| quick-replies | 181 | write nhẹ | ❌ | Thấp |
| conversations | 193 | read+handoff | ❌ | TB |
| campaigns | 196 | write | ❌ | Thấp |
| channel-configs | 317 | write | ❌ | TB |
| knowledge | 358 | upload/reindex/crawl | ❌ | Cao |
| handoff | 581 | realtime | ❌ | Cao |
| content-packages | 671 | write/migrate | ❌ | TB-Cao |
| settings | 725 | write+external+direct fetch | ❌ | Cao |
| tenants | 1127 | write nặng | ❌ | Cao |

Findings: 4/13 page là orchestrator mỏng; feature còn lại là placeholder README (không circular import). `settings/page.tsx` có **6 `fetch()` trực tiếp** (webhook/facebook-menu/facebook-pages) bỏ qua `lib/api.ts`. Không có direct fetch mới ngoài settings. `lib/api.ts` (265) là facade; `lib/api/client.ts` axios entry hợp lệ.

## 6. Docs/report audit

- Current docs đầy đủ và cập nhật (progress/refactor/checklist/quality/deploy/rollout/architecture/env/inventory/local-run/phase19).
- `report/` có 44 file historical — giữ nguyên, đề xuất `report/archive/` ở 21D (không rewrite/xóa).
- Root `MULTITENANT_PROGRESS.md` + `ROADMAP.md`: **stale**, mô tả `backend/src/chatwoot/api.js`, `tenants/webhookHandler.js`, `/chatwoot-webhook/:slug` đã bị gỡ ở 08B → cần gắn nhãn/archive.
- `webhook-urls-current.txt`: log local/stale, không dùng làm nguồn prod.

## 7. Safety/risk scans

| Scan | Kết quả |
|---|---|
| Chatwoot trong `backend/src`/`dashboard/src` | Chỉ 3 README lịch sử; 0 runtime |
| Chatwoot trong `start-all.bat` | **Còn nhiều** (bootstrap tunnel/agent-bot/`/chatwoot-webhook`) — legacy local-only |
| Chatwoot trong `docker-compose.yml`/`Dockerfile`/env.example | 0 (sạch) |
| `$queryRawUnsafe` / `$executeRawUnsafe` (src+scripts) | **0** |
| Destructive (`db push`/`--accept-data-loss`/`reset`/`DROP`/`TRUNCATE`) | 0 thật (chỉ comment cảnh báo + `migrate deploy` trong start-all.bat) |
| Direct fetch/localhost dashboard | 6 `fetch()` ở `settings/page.tsx`; `lib/api/client.ts` axios; `lib/config/env.ts` localhost fallback (config) |

## 8. Production readiness structure view

Auth/login hardened; No-Chatwoot runtime sạch; migration policy `migrate deploy`; RAG/raw SQL sạch; dashboard 19 route build PASS; env/secret gitignored + guard; quality gate PASS (ESLint chưa cài). **Production rollout thật CHƯA chạy** (chưa backup + migrate deploy + smoke prod). Chỉ ghi nhận **local/staging readiness improved**, KHÔNG "production ready".

## 9. Phase 21B/21C/21D proposal

- **21B (backend):** rút route read-only/low-risk từ `api/dashboard.js` sang `presentation/http/**`; gom repository. KHÔNG move webhook/RAG/handoff/tenants. Risk thấp–TB.
- **21C (dashboard):** chỉ tách `content-packages/page.tsx` nếu khóa rõ action migrate; chuẩn hóa naming feature. KHÔNG tách settings/knowledge/tenants. Risk TB.
- **21D (docs):** docs index; archive plan cho report cũ + docs stale; đề xuất dọn dir rỗng legacy. Risk thấp.

(Chi tiết scope/allowed/forbidden/validation/smoke/rollback/risk: `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` mục 7–9.)

## 10. Files changed

- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md` (mới)
- `docs/status/PROJECT_PROGRESS.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `report/phase-21/PROMPT_21A_PROJECT_STRUCTURE_CONSOLIDATION_AUDIT_REPORT.md` (mới)

## 11. Không thay đổi

- Không sửa `backend/src/**`, `dashboard/src/**`.
- Không sửa `schema.prisma`, `migrations/**`, package.json/lock.
- Không sửa Dockerfile/`start-all.bat`/`docker-compose.yml`/deploy scripts.
- Không move/rename/xóa file, không đổi import path.
- Không chạy mutation DB, không gọi external service thật, không `git add .`.

## 12. Remaining risks

- `start-all.bat` còn bootstrap Chatwoot (local-only backlog).
- `MULTITENANT_PROGRESS.md`/`ROADMAP.md` stale mô tả kiến trúc Chatwoot đã gỡ.
- `settings/page.tsx` direct fetch + Facebook external → chặn tách settings trước.
- `api/dashboard.js` 2363 LOC/96 route — nợ cấu trúc backend.
- 3 dir legacy rỗng chưa dọn.

## 13. Final verdict

**PASS** — audit/plan-only hoàn tất, baseline validation PASS, docs/report cập nhật đúng trạng thái, không đổi source runtime.

## 14. Next step

Prompt 21B (backend route consolidation nhỏ) để giảm nợ `api/dashboard.js` an toàn, hoặc Prompt 19E (`content-packages` với action locked). Không chọn settings/knowledge/tenants nếu chưa có external rollback plan.
