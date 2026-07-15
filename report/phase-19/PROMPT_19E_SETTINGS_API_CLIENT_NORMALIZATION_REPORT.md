# PROMPT 19E - SETTINGS API CLIENT NORMALIZATION REPORT

Ngay thuc hien: 2026-07-15
Ket luan: **PASS WITH NOTES**

## 1. Muc tieu

Normalize cac API call trong `dashboard/src/app/dashboard/settings/page.tsx` ve API facade dung chung, giam direct `fetch()` trong component ma khong split toan bo settings page.

## 2. Pham vi duoc phep

- `dashboard/src/app/dashboard/settings/page.tsx`
- `dashboard/src/lib/api.ts`
- Tai lieu/status/report lien quan den Phase 19E va priority matrix.

## 3. Pham vi khong dung

- Khong sua backend source.
- Khong sua Prisma schema/migration.
- Khong sua package/package-lock.
- Khong sua env/env example/local.
- Khong sua Docker/start scripts.
- Khong sua Facebook `GET/POST /webhook`.
- Khong tao `/integrations/website-chat/events`.
- Khong khoi phuc `/chatwoot-webhook*`.
- Khong goi external provider.

## 4. Audit truoc khi sua

- Settings page co 6 direct `fetch()`.
- Direct fetch nam o cac luong: webhook config, Facebook menu read/setup, Facebook Pages list/create/reload.
- `dashboard/src/lib/api.ts` da co `facebookPagesApi.list/create`.

## 5. Thay doi API facade

Da them vao `dashboard/src/lib/api.ts`:

- `settingsApi.getWebhookConfig()` -> `GET /settings/webhook`
- `facebookMenuApi.get()` -> `GET /settings/facebook-menu`
- `facebookMenuApi.setup(data)` -> `POST /settings/facebook-menu`

Da tai su dung facade san co:

- `facebookPagesApi.list()`
- `facebookPagesApi.create(data)`

## 6. Thay doi settings page

- Them import `settingsApi`, `facebookMenuApi`, `facebookPagesApi`.
- Bo import `API_BASE_URL`.
- Bo hang `const API_BASE = API_BASE_URL`.
- Thay cac direct `fetch()` bang facade tuong ung.

## 7. So luong direct fetch

| Moc | So luong |
|---|---:|
| Truoc patch | 6 |
| Sau patch | 0 |

Lenh xac nhan sau patch: `rg -n "fetch\\(" dashboard/src/app/dashboard/settings/page.tsx` khong tra ve match.

## 8. UI/behavior

- Khong doi route `/dashboard/settings`.
- Khong doi layout/card/className.
- Khong doi text/toast/confirm co chu dich.
- Khong tach component/hook trong prompt nay.
- Khong click cac action mutation/external trong runtime smoke.

## 9. External action lock

Trong smoke runtime, cac action sau chi duoc preserve code path, khong thuc thi:

- Setup Facebook menu/greeting.
- Them Facebook Page.
- Test provider.
- Test Telegram destination.
- Save/update/delete cac settings co mutation.

Trang thai: **EXTERNAL_ACTION_LOCKED_NOT_EXECUTED**.

## 10. Validation tinh

| Gate | Ket qua | Ghi chu |
|---|---|---|
| Dashboard `npm run build` | PASS | Chay sach sau khi clean `.next`; build route `/dashboard/settings` PASS. |
| Dashboard `npm run typecheck` | PASS | Chay sau build de Next generate lai `.next/types`. |
| Dashboard `npm run quality` | PASS | `typecheck && build` PASS. |
| Dashboard `npm run lint` | BLOCKED_BY_PROJECT_CONFIG | `next lint` yeu cau tao ESLint config tuong tac; khong tao config vi ngoai scope. |
| Backend `npm run quality` | PASS | Backend khong sua nhung da validate baseline. |
| Backend `npx prisma validate` | PASS | Prisma schema khong doi. |
| Root `git diff --check` | PASS | Chi co canh bao CRLF tu Git, khong co whitespace error. |
| Markdown broken-link check | PASS | 3 Markdown links duoc scan, broken = 0; matrix link co trong 3 file bat buoc. |

## 11. Runtime dashboard gate

- Da dung Next dev server cu tren port `3002` thuoc workspace dashboard.
- Da clean `dashboard/.next` sau khi verify path.
- Da start fresh dev server: `127.0.0.1:3019`.
- Route smoke PASS: `/` 307 expected redirect, `/login` 200, tat ca route dashboard that 200, `/dashboard/__fake_19e__` 404 expected.
- Static asset smoke: 22 `_next/static` assets, failed = 0.
- Dev log scan: PASS; khong co missing chunk, `MODULE_NOT_FOUND`, `ChunkLoadError`, `_next/static` 404, route 500.
- Dev server tam thoi da dung sau smoke.

## 12. Safety scans

- Settings page direct `fetch()`: 0.
- Settings page `API_BASE_URL`/`API_BASE`: 0.
- Shared API client van dung `axios` va config API base tap trung.
- Khong them `NEXT_PUBLIC_GEMINI_API_KEY`, service role, secret, token log, base64 log.
- Khong sua Chatwoot/Facebook webhook runtime.

## 13. Tai lieu da cap nhat

- `docs/status/PHASE_EXECUTION_PRIORITY_MATRIX.md`
- `docs/status/PROJECT_PROGRESS_MASTER.md`
- `docs/status/PROJECT_STATUS_MASTER.md`
- `docs/status/PROJECT_PHASE_BOARD.md`
- `docs/status/FEATURE_AUDIT_CHECKLIST.md`
- `docs/index/CURRENT_STATUS_INDEX.md`
- `docs/roadmap/REFACTOR_PLAN.md`
- `docs/roadmap/PROJECT_STRUCTURE_CONSOLIDATION_PLAN.md`
- `report/phase-19/README.md`
- `report/phase-19/PROMPT_19E_SETTINGS_API_CLIENT_NORMALIZATION_REPORT.md`

## 14. Phase health

- Phase 19: **STARTED**, Prompt 19E PASS; settings API client da normalize, settings page chua split.
- Phase 21: **STARTED / HIGH_RISK_ONLY_REMAINING**, khong tiep tuc 21B thong thuong neu khong co prompt high-risk rieng.
- Phase 22: **BLOCKED**, thieu operator Meta verify confirmation.
- Phase 23: **PLANNED / NOT_STARTED_RUNTIME**, khong code Website Chatwoot runtime.

## 15. Rui ro con lai

- Settings page van la page lon va co nhieu state/action; prompt nay chi normalize API client, chua giam do phuc tap UI.
- `next lint` chua co config nen khong the PASS non-interactive.
- Runtime smoke la GET-only; mutation/external actions duoc khoa, khong xac nhan provider/Facebook/Telegram action that.

## 16. Diem can tu sua

- Can Prompt 19F de tach settings page thanh hook/components nho sau khi API facade da on dinh.
- Nen tao ESLint config trong prompt rieng neu du an muon dung `npm run lint` lam gate bat buoc.
- Nen them automated browser CI cho dashboard route/static asset smoke de tranh lap lai stale chunk issue bang tay.

## 17. Goi y tiep theo

1. **Prompt 19F - Settings feature split**: tach settings page sau khi API normalization da PASS.
2. **Prompt 19G - Dashboard page split next**: chon page con lai theo risk audit rieng.
3. **Prompt 19H - Dashboard FE audit/cleanup/phase closure**: audit debt Phase 19 va cap nhat closure criteria.

## 18. Ket luan

Prompt 19E dat muc tieu chinh: direct `fetch()` trong settings page giam tu 6 ve 0, UI/route/behavior duoc giu nguyen, dashboard typecheck/build/quality va runtime smoke PASS. Lint rieng bi chan do du an chua co ESLint config non-interactive, khong phai loi source cua patch 19E.
