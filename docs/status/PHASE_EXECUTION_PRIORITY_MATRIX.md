# PHASE EXECUTION PRIORITY MATRIX

Ngay cap nhat: 2026-07-15
Nguon cap nhat: Prompt 19E - Settings API client normalization

## 1. Doc nhanh

| Phase | Trang thai | Uu tien hien tai | Ghi chu |
|---|---|---|---|
| Phase 17 | DONE | Thap | No-Chatwoot cho Facebook path da chot; khong khoi phuc Chatwoot runtime cho Facebook. |
| Phase 18 | DONE | Thap | RAG/raw SQL hardening da xong; giu regression scan khi sua query. |
| Phase 19 | STARTED | Cao nhat | Dashboard FE con no; Prompt 19E da normalize Settings API client, chua split page. |
| Phase 20 | DONE WITH PENDING ROLLOUT | Trung binh | DevOps/deploy policy da xong; production rollout that chua chay. |
| Phase 21 | STARTED / HIGH_RISK_ONLY_REMAINING | Trung binh thap | 21B thong thuong tam dung sau NO_SAFE_CANDIDATE; chi mo prompt rieng cho vung high-risk. |
| Phase 22 | BLOCKED | Blocked | Thieu `META_VERIFY_OPERATOR_CONFIRMED=YES`; khong claim Meta verified hoac POST event that. |
| Phase 23 | PLANNED / NOT_STARTED_RUNTIME | Trung binh thap | Sau 23B moi co contract docs; chua code schema/env/runtime/dashboard UI Website Chatwoot. |
| Phase 24 | NOT_STARTED | Thap | Chua mo scope. |

## 2. Quyet dinh hien tai

- Khong tiep tuc 21B thong thuong: audit 21B-6 ket luan khong con candidate GET/read-only nho du an toan.
- Prompt hien tai la **Phase 19E Settings API client normalization**: chi normalize direct `fetch()` trong `dashboard/src/app/dashboard/settings/page.tsx` sang API facade.
- 4 prompt uu tien tiep theo nen tap trung Dashboard FE code, vi Phase 19 con page nang va co lich su stale chunk/cache.
- Phase 23 khong code runtime cho Website Chatwoot cho den khi Phase 19/21 ro hon hoac priority thay doi bang prompt rieng.
- Phase 22 chi tiep tuc khi operator xac nhan Meta UI verify bang `META_VERIFY_OPERATOR_CONFIRMED=YES`.
- Khong sua Facebook `GET/POST /webhook`, khong khoi phuc `/chatwoot-webhook*`, khong tao `/integrations/website-chat/events` trong cac prompt Phase 19.

## 3. Bang 4 prompt code uu tien

| Thu tu | Prompt de xuat | Muc tieu | Dieu kien PASS |
|---|---|---|---|
| 1 | 19E Settings API client normalization | Dua direct `fetch()` cua settings page ve API facade dung chung. | Direct fetch trong settings page = 0; route `/dashboard/settings` gate PASS. |
| 2 | 19F Settings feature split | Sau khi API da normalize, tach settings page thanh hook/components feature nho. | Page settings mong hon, UI/behavior giu nguyen, full dashboard gate PASS. |
| 3 | 19G Dashboard page split next hoac channel-configs/conversations safe split | Giam no page dashboard tiep theo bang scope nho, co mutation/action lock ro. | Route target va regression routes PASS, static asset PASS, dev log sach. |
| 4 | 19H Dashboard FE audit/cleanup/phase closure | Audit cac page con lai, dong Phase 19 neu du dieu kien hoac lap danh sach no ro. | Khong bug runtime moi, status/docs/report cap nhat, roadmap tiep theo ro rang. |

## 4. Trang thai Prompt 19E

- Da them `settingsApi.getWebhookConfig`, `facebookMenuApi.get`, `facebookMenuApi.setup` trong `dashboard/src/lib/api.ts`.
- Da dung lai `facebookPagesApi.list/create` san co.
- `dashboard/src/app/dashboard/settings/page.tsx` khong con direct `fetch()` va khong import `API_BASE_URL` truc tiep.
- Khong split settings page trong prompt nay.
- Khong sua backend source, Prisma schema/migration, package/lock, env/env example/local, Docker/start scripts, webhook, RAG, tenants, handoff hoac Website Chatwoot runtime.

## 5. Can doc tiep

- Report chi tiet: `report/phase-19/PROMPT_19E_SETTINGS_API_CLIENT_NORMALIZATION_REPORT.md`.
- Status master: `docs/status/PROJECT_STATUS_MASTER.md`.
- Progress master: `docs/status/PROJECT_PROGRESS_MASTER.md`.
- Current index: `docs/index/CURRENT_STATUS_INDEX.md`.
