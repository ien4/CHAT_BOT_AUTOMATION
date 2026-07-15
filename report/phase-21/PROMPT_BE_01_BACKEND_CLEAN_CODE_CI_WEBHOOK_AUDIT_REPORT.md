# PROMPT BE-01 - BACKEND CLEAN CODE CI WEBHOOK AUDIT REPORT

Ngay thuc hien: 2026-07-15
Verdict: **PASS WITH WARNINGS**

## 1. Muc tieu

Audit backend clean-code hien tai, them CI baseline toi thieu, kiem tra Facebook `/webhook` cho App Review readiness va cap nhat docs/runbook. Khong refactor frontend, khong code Website Chatwoot runtime, khong sua schema/migration/env/package lock.

## 2. Preflight

| Check | Ket qua |
|---|---|
| Branch | `chore/prompt-05r-docs-local-run` |
| HEAD truoc prompt | `57385ec Normalize dashboard settings API client usage` |
| Working tree truoc prompt | Sach, chi ignored artifacts |
| Ignored artifacts | `.claude/`, `backend/.env`, `backend/node_modules/`, `backups/`, `dashboard/.env.local`, `dashboard/.next/`, `dashboard/node_modules/`, `dashboard/tsconfig.tsbuildinfo`, `tmp-runtime/` |
| Tracked env scan | Chi co `backend/.env.example` sample tracked hop le |
| `.github/workflows` | Khong ton tai truoc BE-01 |

Khong doc/in secret hoac env that.

## 3. Context da doc

Da doc cac status/report moi nhat, backend source trong `index.js`, `api/dashboard.js`, `webhook`, `facebook`, `bot`, `rag`, `tenants`, `telegram`, `db`, `package.json`, `.env.example` sample va runbook Meta hien co. Da xac nhan 21B-6 ket luan `NO_SAFE_CANDIDATE` cho route read split thong thuong; 23B la Website Chatwoot plan docs-only; 19E la dashboard settings API client normalization.

## 4. Baseline validation

| Lenh | Ket qua |
|---|---|
| `cd backend && npm run quality` | PASS |
| `cd backend && npx prisma validate` | PASS |
| `cd dashboard && npm run typecheck` | PASS sau khi chay sequential; lan parallel dau bi nhiem do `.next/types` dang build |
| `cd dashboard && npm run build` | PASS |
| Root `git diff --check` truoc docs | PASS |

Ghi chu: dashboard `typecheck` khong nen chay song song voi `next build` trong local workspace vi `.next/types`/tsbuildinfo co the bi build process lam nhiem. CI baseline chay sequential.

## 5. Backend clean-code audit

| Hang muc | Ket qua |
|---|---|
| `backend/src/api/dashboard.js` | 1986 dong, con monolith high-risk. |
| Largest backend files | `telegram/handoff.js` 762, `tenants/handoff.js` 663, `rag/docParser.js` 464, `bot/tools.js` 431, `webhook/handler.js` 428, `rag/pipeline.js` 420. |
| Runtime raw unsafe | Khong thay `$queryRawUnsafe`/`$executeRawUnsafe` trong runtime; chi thay text lich su trong README. |
| Prisma singleton | Runtime dung `backend/src/db.js`; scripts ad hoc van co `new PrismaClient`. |
| Chatwoot runtime trong `backend/src` | Khong co match `chatwoot|/chatwoot-webhook|/integrations/website-chat`. |
| Clean Architecture shell | `presentation/http` + `infrastructure/repositories` dung cho route da tach; `application/domain` van la shell README. |

Ket luan: backend khong nen tiep tuc "safe small route split" kieu 21B. Vung con lai can prompt rieng theo domain.

## 6. Code smell / security scan

| Scan | Ket qua |
|---|---|
| Raw unsafe | PASS runtime. |
| Secret/token keyword | Khong thay service role/client leak trong backend source; provider/API key adjacency can tiep tuc review rieng. |
| Logs | WARN: ngoai `webhook/handler.js`, mot so module log raw sender/payload/message preview/tool data: `bot/agent.js`, `bot/engine.js`, `telegram/handoff.js`, `tenants/handoff.js`, `rag/*`, `llm/*`, `facebook/menu.js`, `api/dashboard.js` test-message. |
| Destructive command scan | Chi thay noi dung lich su/docs/script; khong them executable destructive change. |

BE-01 khong patch cac module log tren vi day la bot/handoff/RAG/provider high-risk. Can BE-02 log redaction rieng.

## 7. Facebook `/webhook` readiness

| Check | Ket qua |
|---|---|
| Source mount | `backend/src/index.js` mount `GET /webhook`, `POST /webhook`. |
| Verify challenge | Handler doc `hub.mode`, `hub.verify_token`, `hub.challenge`; token sai/thieu tra 403. |
| POST page object | Handler chi xu ly `body.object === 'page'`; object khac 404. |
| Rate-limit | Co rate-limit truoc bot processing trong handler. |
| Log redaction trong webhook handler | Mask sender/recipient/page id, log boolean/length metadata; khong log raw message/base64/token. |
| Chatwoot legacy | Backend source khong khoi phuc `/chatwoot-webhook*`; smoke local 404. |
| Website Chatwoot | Van docs-only/planned; khong code endpoint runtime. |

Khong claim Meta verified, App Review passed hoac production ready. Operator van can verify callback trong Meta UI va test event that.

## 8. CI baseline

Da them `.github/workflows/ci.yml`:

- Backend job: `npm ci`, `npm run quality`, `npx prisma validate`.
- Dashboard job: `npm ci`, `npm run typecheck`, `npm run build`.
- Node 20, cache npm theo tung `package-lock.json`.
- Khong secret, khong DB service, khong deploy, khong external provider.

Khong sua `package.json`, khong sua `package-lock.json`, khong them dependency.

## 9. Runtime smoke an toan

Backend process co san tren `http://127.0.0.1:3001` PID `27752`; khong tu start app de tranh startup side effects Facebook/Telegram. Smoke bang Node `fetch`, khong in token/secret, khong POST fake page object vao `/webhook`.

| Check | Ket qua |
|---|---|
| `GET /health` | PASS 200 |
| `GET /webhook` thieu params | PASS 403 |
| `POST /chatwoot-webhook` | PASS 404 |
| `POST /api/auth/login` invalid credential | PASS 401, khong token |
| `GET /api/prompts` no token | PASS 401 |
| `GET /api/settings/webhook` no token | PASS 401 |
| `GET /api/channel-configs` no token | PASS 401 |
| `GET /api/quick-reply-menus` no token | PASS 401 |
| `GET /api/campaigns` no token | PASS 401 |
| `GET /api/stats` no token | PASS 401 |
| `GET /api/admin-users` no token | PASS 401 |

Auth 200 read-route smoke khong chay lai trong BE-01 vi khong doc env/secret va khong co credential test cong khai an toan. Bang chung 200 gan nhat nam trong report 21B-6; BE-01 chi xac nhan guard/endpoint an toan hien tai.

## 10. Dashboard regression light

Vi BE-01 khong sua dashboard source, regression light dua tren baseline:

- `npm run typecheck`: PASS sequential.
- `npm run build`: PASS.
- Khong clean `.next`/fresh route smoke vi khong co FE source change trong BE-01.

## 11. Docs/runbook cap nhat

Da them/cap nhat:

- `docs/status/BACKEND_CLEAN_CODE_AUDIT_MATRIX.md`
- `docs/runbooks/META_APP_REVIEW_SUBMISSION_CHECKLIST.md`
- `.github/workflows/ci.yml`
- Cac master status/index/roadmap/checklist lien quan.

## 12. Goi y tiep theo

1. **BE-02 - Backend log redaction/safety hardening**: bot/LLM/RAG/handoff/Facebook menu/dashboard test-message logs, khong doi behavior.
2. **Meta App Review operator checkpoint**: dung checklist moi, verify HTTPS callback `/webhook`, test event Messenger that, video khong lo secret/PII.
3. **BE-03 - Startup side-effect split**: de local smoke/test import app khong goi Facebook/Telegram ngoai y muon.
4. **BE-04 - Handoff tenant/Telegram hardening**: prompt rieng, co data fixture/smoke/rollback.

## 13. Diem can tu sua

- Backend monolith `dashboard.js` con lon va high-risk.
- Logs ngoai webhook handler chua dat chuan redaction.
- `index.js` startup co side effect external, can tach app/bootstrap.
- Scripts ad hoc con PrismaClient rieng va legacy Chatwoot refs, can cleanup plan rieng.
- App Review chua the pass neu operator chua verify Meta UI va quyen xin review chua khop video.

## 14. Final validation

| Gate | Ket qua |
|---|---|
| `backend npm run quality` | PASS |
| `backend npx prisma validate` | PASS |
| `dashboard npm run typecheck` | PASS |
| `dashboard npm run build` | PASS |
| Root `git diff --check` | PASS, chi co line-ending warnings LF/CRLF |
| Docs/report broken-link check | PASS, 118 Markdown files |
| Final safe smoke | PASS, xem muc 9 |

Ghi chu: Prisma/Next CLI co in dong thong bao load `.env`/`.env.local` nhung khong in gia tri secret. BE-01 khong mo noi dung env that.

## 15. Final verdict

**PASS WITH WARNINGS**. CI baseline da them, webhook source path dung va smoke an toan PASS. Backend clean-code chua hoan tat; can BE-02/BE-03 truoc khi tang claim ve security/maintainability.
