# PHASE EXECUTION PRIORITY MATRIX

Ngay cap nhat: 2026-07-15
Nguon cap nhat: Prompt BE-01/4 - Backend clean-code audit + CI baseline + Facebook webhook readiness

## 1. Doc nhanh

| Phase | Trang thai | Uu tien hien tai | Ghi chu |
|---|---|---|---|
| Phase 17 | DONE | Thap | No-Chatwoot cho Facebook path da chot; khong khoi phuc Chatwoot runtime cho Facebook. |
| Phase 18 | DONE | Thap | RAG/raw SQL hardening da xong; giu regression scan khi sua query. |
| Phase 19 | STARTED | Trung binh | Dashboard FE con no; tam khong uu tien hon BE/App Review readiness. |
| Phase 20 | DONE WITH PENDING ROLLOUT | Trung binh | DevOps/deploy policy da xong; production rollout that chua chay. |
| Phase 21 | STARTED / HIGH_RISK_ONLY_REMAINING | Cao | BE-01 them CI/audit; tiep theo nen log redaction/safety hardening, khong route split thuong. |
| Phase 22 | BLOCKED / OPERATOR_PENDING | Cao khi operator san sang | Thieu Meta UI verify va POST event that; khong claim Meta verified hoac App Review pass. |
| Phase 23 | PLANNED / NOT_STARTED_RUNTIME | Trung binh thap | Sau 23B moi co contract docs; chua code schema/env/runtime/dashboard UI Website Chatwoot. |
| Phase 24 | NOT_STARTED | Thap | Chua mo scope. |

## 2. Quyet dinh hien tai

- Khong tiep tuc 21B thong thuong: audit 21B-6 ket luan khong con candidate GET/read-only nho du an toan.
- Prompt BE-01 da them CI baseline va audit matrix; backend con high-risk log/PII gaps ngoai webhook handler.
- Uu tien tiep theo nen la **BE-02 Backend log redaction/safety hardening** truoc khi quay lai dashboard split.
- Phase 22 chi tiep tuc khi operator co public HTTPS callback `/webhook`, verify token that va event Messenger that.
- Phase 23 khong code runtime cho Website Chatwoot trong cac prompt BE/App Review; no van NOT_STARTED runtime.
- Khong sua Facebook `GET/POST /webhook`, khong khoi phuc `/chatwoot-webhook*`, khong tao `/integrations/website-chat/events` khi chua co prompt rieng.

## 3. Bang 4 prompt code uu tien

| Thu tu | Prompt de xuat | Muc tieu | Dieu kien PASS |
|---|---|---|---|
| 1 | BE-02 Backend log redaction/safety hardening | Giam leak PII/secret trong bot/RAG/handoff/LLM/Facebook menu/test-message logs. | Source scan sach hon, behavior/API khong doi, backend quality + smoke PASS. |
| 2 | Meta App Review operator checkpoint | Verify public HTTPS `/webhook`, event Messenger that, video/quyen dung. | Khong in secret/PII, Meta UI verify co bang chung operator, khong claim qua muc. |
| 3 | BE-03 Startup side-effect split | Tach app/bootstrap de local smoke/test khong vo tinh goi Facebook/Telegram. | Import app khong external side effect, existing runtime behavior giu nguyen, smoke PASS. |
| 4 | BE-04 Handoff tenant/Telegram hardening | Xu ly high-risk handoff voi tenant isolation/log/smoke rieng. | Fixture/smoke ro, rollback ro, khong pha webhook/bot flow. |

## 4. Trang thai Prompt BE-01

- Da them CI baseline `.github/workflows/ci.yml`.
- Da tao `docs/status/BACKEND_CLEAN_CODE_AUDIT_MATRIX.md`.
- Da tao `docs/runbooks/META_APP_REVIEW_SUBMISSION_CHECKLIST.md`.
- Backend smoke an toan PASS cho health/webhook/legacy/auth guard.
- Khong sua backend runtime source vi cac vung con lai can prompt high-risk/log-redaction rieng.
- Verdict: **PASS WITH WARNINGS**.

## 5. Trang thai Prompt 19E

- Da them `settingsApi.getWebhookConfig`, `facebookMenuApi.get`, `facebookMenuApi.setup` trong `dashboard/src/lib/api.ts`.
- Da dung lai `facebookPagesApi.list/create` san co.
- `dashboard/src/app/dashboard/settings/page.tsx` khong con direct `fetch()` va khong import `API_BASE_URL` truc tiep.
- Khong split settings page trong prompt nay.
- Khong sua backend source, Prisma schema/migration, package/lock, env/env example/local, Docker/start scripts, webhook, RAG, tenants, handoff hoac Website Chatwoot runtime.

## 6. Can doc tiep

- Backend audit matrix: `docs/status/BACKEND_CLEAN_CODE_AUDIT_MATRIX.md`.
- Meta App Review checklist: `docs/runbooks/META_APP_REVIEW_SUBMISSION_CHECKLIST.md`.
- Report BE-01: `report/phase-21/PROMPT_BE_01_BACKEND_CLEAN_CODE_CI_WEBHOOK_AUDIT_REPORT.md`.
- Report chi tiet: `report/phase-19/PROMPT_19E_SETTINGS_API_CLIENT_NORMALIZATION_REPORT.md`.
- Status master: `docs/status/PROJECT_STATUS_MASTER.md`.
- Progress master: `docs/status/PROJECT_PROGRESS_MASTER.md`.
- Current index: `docs/index/CURRENT_STATUS_INDEX.md`.
