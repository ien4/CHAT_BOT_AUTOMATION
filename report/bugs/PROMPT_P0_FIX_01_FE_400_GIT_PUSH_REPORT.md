# PROMPT P0-FIX-01 — FE 400 ROOT CAUSE + DASHBOARD PROOF + GIT PUSH REPORT

Ngày thực hiện: 2026-07-15
Branch: `chore/prompt-05r-docs-local-run`
HEAD trước prompt: `2b02dbc Audit backend readiness and add CI baseline`
Verdict: **STABILIZED — dashboard runtime PROVEN CLEAN; specific 400 request NOT captured (needs operator DevTools evidence)**

> Không claim Meta verified / App Review passed / production ready. Không sửa schema/migration/env thật. Không sửa Facebook `/webhook`. Không tạo `/integrations/website-chat/events`. Không khôi phục `/chatwoot-webhook*`.

## 1. FE 400 request — trạng thái nhận diện

**Không tái hiện được HTTP 400 nào trong môi trường sạch (fresh `.next` + dev server 3019 + backend 3001 + token admin hợp lệ).**

Đã cố tái hiện đầy đủ theo phương pháp không đoán:
- Login backend thật bằng temp platform admin (password random, không in token, cleanup sau) → `POST /api/auth/login` = **200**.
- GET 24 read endpoint mà dashboard thực sự gọi → **tất cả 200** (chi tiết mục 6).
- GET 15 dashboard route + fake route + 64 static asset trên dev server 3019 → **tất cả 200 / fake 404** (mục 7).
- Dev log scan → **không có** `400/500/ChunkLoadError/Cannot find module/MODULE_NOT_FOUND/webpack.cache/vendor-chunks/ENOENT/_next/static 404`.

Vì không có DevTools Network request cụ thể từ người vận hành (method/URL/payload/response body của request 400 thật) và cache của dev server cũ đã bị xóa trong bước ổn định, **request 400 cụ thể không được capture**. Theo nguyên tắc P0 (không patch khi chưa xác định request 400 cụ thể), **không thực hiện source patch chắp vá**.

## 2. Root cause (phân loại)

- **Primary (most-probable): F — Stale `.next` / mixed dev server.**
  Tại thời điểm preflight, một Next dev server cũ của workspace đang chạy trên **port 3002** (PID `4500`, cmdline `...\dashboard\node_modules\next\dist\server\lib\start-server.js`) phục vụ `.next` cache cũ. Script `dashboard/package.json` → `"dev": "next dev -p 3002"`, trong khi workflow đã ổn định/tài liệu hoá dùng **3019**. Đây đúng là pattern lỗi runtime tái diễn đã ghi nhận trong `BUG-21C-SAFE`, `BUG-21C-3`, `Prompt 21X/21Y` (server cũ trên 3002 + `.next` stale gây lỗi runtime).
- **Không phải các nhóm khác:**
  - A/B (FE facade sai endpoint/payload): loại — 24 endpoint đúng contract, all 200.
  - C (auth/token): loại — login 200, `/auth/me` 200, guard no-token 401 đúng.
  - D (backend trả 400 sai): loại — không endpoint read nào trả 400; các 400 trong `dashboard.js` đều là validation của mutation (hành vi đúng).
  - E (env/config runtime): loại — `NEXT_PUBLIC_API_URL=http://localhost:3001/api` đúng; fallback config đúng.
  - G (DB state): loại — read endpoint 200 với dữ liệu hiện có.

## 3. Files changed

**Không sửa source (FE hoặc BE).** Source/API/route/static đã chứng minh sạch → không có root cause source để vá.
Chỉ cập nhật tài liệu:
- `report/bugs/PROMPT_P0_FIX_01_FE_400_GIT_PUSH_REPORT.md` (file này).
- `docs/status/BUG_TRACKER.md` (thêm entry BUG-P0-FIX-01).

## 4. Vì sao đây không phải fix chắp vá

- Không đổi UI/text/layout, không bỏ validate, không catch nuốt lỗi, không đổi 400→200, không xóa feature.
- Không đổi API contract, không đổi schema/env/webhook.
- Cách xử lý là **ổn định runtime** (dừng dev server cũ 3002, xóa `.next`, dựng lại server sạch 3019) + chứng minh bằng full smoke — đúng quy trình đã ghi trong BUG_TRACKER cho pattern stale-cache, không phải che lỗi.
- Không tự ý đổi port trong `package.json` (ngoài phạm vi bug đã chứng minh), chỉ ghi nhận mismatch 3002↔3019 như contributing factor cần quyết định riêng.

## 5. Validation (trước & sau)

| Gate | Kết quả |
|---|---|
| `backend npm run quality` (syntax + prisma validate) | PASS |
| `backend npx prisma validate` | PASS (`schema is valid`) |
| `dashboard npm run typecheck` (`tsc --noEmit`) | PASS |
| `dashboard npm run build` (`next build`) | PASS — 17 routes compiled |

Ghi chú: typecheck chạy tuần tự trước build (không song song) theo ghi chú BE-01.

## 6. API read-endpoint smoke (token platform-admin hợp lệ)

Temp admin tạo qua Prisma (random password), login backend thật, GET, rồi xoá temp admin. 24/24 = **200**:

`/auth/me`, `/stats`, `/conversations`, `/knowledge`, `/prompts`, `/providers`, `/campaigns`, `/content-packages`, `/quick-reply-menus`, `/appointments`, `/staff`, `/settings/handoff`, `/settings/webhook`, `/settings/telegram-destinations`, `/settings/facebook-menu`, `/handoff/active`, `/handoff/staff-status`, `/handoff/bot-queue`, `/facebook-pages`, `/channel-configs`, `/tenants`, `/admin-users`, `/analytics`, `/analytics?days=7` → **0 non-200**.

## 7. Full dashboard route / static / dev-log gate (dev server 3019, clean `.next`)

- Routes (15): `/login`, `/dashboard`, `/dashboard/settings`, `/dashboard/analytics`, `/dashboard/prompts`, `/dashboard/staff`, `/dashboard/appointments`, `/dashboard/content-packages`, `/dashboard/quick-replies`, `/dashboard/campaigns`, `/dashboard/conversations`, `/dashboard/knowledge`, `/dashboard/handoff`, `/dashboard/tenants`, `/dashboard/channel-configs` → **tất cả 200**.
- Fake route `/dashboard/__fake_p0_fix_01__` → **404** (hợp lệ).
- Static assets `_next/static` trích từ HTML: **64/64 = 200**.
- Dev log scan: **sạch** — không `400/500/ChunkLoadError/Cannot find module/MODULE_NOT_FOUND/webpack.cache/vendor-chunks/ENOENT/_next/static 404`.

## 8. Backend regression gate

| Check | Kết quả |
|---|---|
| `GET /health` | PASS 200 |
| `GET /webhook` thiếu params | PASS 403 |
| `POST /chatwoot-webhook` | PASS 404 |
| `POST /api/auth/login` invalid | PASS 401 |
| `GET /api/prompts` no-token | PASS 401 |
| `GET /api/stats` no-token | PASS 401 |
| `GET /api/channel-configs` no-token | PASS 401 |

Không gọi external provider thật. Không POST fake `page` object vào `/webhook`. Temp admin đã cleanup.

## 9. Secret / public-repo safety scan

Repo đích public → scan tree + history:
- Tracked file scan (current): chỉ `backend/.env.example` (placeholder). PASS.
- History scan (mọi commit từng ADD secret/env file): chỉ `backend/.env.example`. **Không có `.env`/secret thật nào từng được commit.** PASS.
- Content secret scan: chỉ match placeholder trong docs/`.env.example` (`<local_password>`, `POSTGRES_PASSWORD`, token rỗng, `user:pass` mẫu). Không có giá trị secret thật. PASS.
- `backend/.env`, `dashboard/.env.local`, `dashboard/.next` đã gitignore. `tmp-runtime/` untracked và **không** được stage/commit.

## 10. CI file check

`.github/workflows/ci.yml` hợp lệ: 2 job (backend quality + prisma validate; dashboard typecheck + build), Node 20, không secret/deploy. Không cần sửa.

## 11. Git remote / push result

Xem mục cập nhật cuối file (Phase 10/13 thực thi).

## 12. Commit hash

Xem mục cập nhật cuối file.

## 13. GitHub pushed branch / URL

Xem mục cập nhật cuối file.

## 14. Remaining risks

1. **Request 400 cụ thể chưa được capture.** Nếu người vận hành vẫn thấy 400, cần cung cấp DevTools → Network: method, URL, request payload, response body, và họ đang chạy dashboard trên port nào (3002 hay 3019). Rất có thể họ đang dùng `npm run dev` → server cũ 3002 với `.next` stale.
2. **Port mismatch 3002 (`npm run dev`) ↔ 3019 (đã ổn định/tài liệu).** Là contributing factor tái diễn; nên có quyết định riêng (đổi default port hoặc chuẩn hoá runbook) — chưa tự sửa trong prompt này.
3. BE-01 WARN vẫn còn: `dashboard.js` monolith, log redaction (BE-02), startup side-effect (BE-03). Không thuộc phạm vi P0-FIX-01.
