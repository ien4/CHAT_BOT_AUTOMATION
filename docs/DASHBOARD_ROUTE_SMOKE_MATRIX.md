# DASHBOARD ROUTE SMOKE MATRIX

Ngày cập nhật: 2026-07-14

## 1. Điều kiện smoke mới nhất

| Hạng mục | Giá trị |
|---|---|
| Prompt | 21X |
| Commit nền | `366b72d Split dashboard campaigns feature` |
| Dev server | `http://127.0.0.1:3019` |
| Có dừng server cũ không? | Có, dừng đúng dashboard Next dev server cũ PID `20916/3524` trên port `3002` |
| Có clean `.next` không? | Có |
| Có static asset smoke không? | Có, 125 asset từ HTML các route |
| Có dev log scan không? | Có |
| Có chạy mutation/upload/write không? | Không |

## 2. Full dashboard route smoke

| Route | HTTP status | Có 500? | Có redirect? | HTML có lỗi runtime? | Ghi chú |
|---|---:|---|---|---|---|
| `/login` | 200 | Không | Không | Không | OK |
| `/dashboard` | 200 | Không | Không | Không | OK |
| `/dashboard/analytics` | 200 | Không | Không | Không | OK |
| `/dashboard/prompts` | 200 | Không | Không | Không | OK |
| `/dashboard/staff` | 200 | Không | Không | Không | OK |
| `/dashboard/appointments` | 200 | Không | Không | Không | OK |
| `/dashboard/content-packages` | 200 | Không | Không | Không | OK |
| `/dashboard/quick-replies` | 200 | Không | Không | Không | OK |
| `/dashboard/campaigns` | 200 | Không | Không | Không | OK |
| `/dashboard/channel-configs` | 200 | Không | Không | Không | OK |
| `/dashboard/conversations` | 200 | Không | Không | Không | OK |
| `/dashboard/knowledge` | 200 | Không | Không | Không | OK |
| `/dashboard/settings` | 200 | Không | Không | Không | OK |
| `/dashboard/tenants` | 200 | Không | Không | Không | Bug route 21C-3 đã hết 500 |
| `/dashboard/handoff` | 200 | Không | Không | Không | OK |
| `/dashboard/__fake_21x__` | 404 | Không | Không | Không | 404 hợp lệ cho route giả |

## 3. Static asset smoke summary

| Route nguồn | Asset scope | Số asset | Status | Pass/Fail |
|---|---|---:|---|---|
| `/login` | `_next/static` CSS/JS từ HTML | 7 | 200 x7 | PASS |
| `/dashboard` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/analytics` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/prompts` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/staff` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/appointments` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/content-packages` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/quick-replies` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/campaigns` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/channel-configs` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/conversations` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/knowledge` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/settings` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/tenants` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/handoff` | `_next/static` CSS/JS từ HTML | 8 | 200 x8 | PASS |
| `/dashboard/__fake_21x__` | `_next/static` CSS/JS từ HTML not-found page | 6 | 200 x6 | PASS |

## 4. Asset signatures từng bị lỗi

| Asset signature | Trạng thái 21X | Ghi chú |
|---|---|---|
| `/_next/static/css/app/layout.css?...` | PASS 200 | Không còn CSS layout 404 |
| `/_next/static/chunks/main-app.js?...` | PASS 200 | Không còn main app chunk 404 |
| `/_next/static/chunks/app-pages-internals.js` | PASS 200 | Không còn internals chunk 404 |
| `/_next/static/chunks/app/dashboard/tenants/page.js` | PASS 200 | Route bug cụ thể đã có page chunk |
| `/_next/static/chunks/app/dashboard/*/page.js` | PASS 200 | Tất cả page chunks từ route smoke đều 200 |
| `/_next/static/chunks/app/dashboard/layout.js` | PASS 200 | Dashboard layout chunk OK |
| `/_next/static/chunks/app/layout.js` | PASS 200 | Root layout chunk OK |

## 5. Dev log scan

| Signature | Kết quả |
|---|---|
| `Cannot find module './` | Không có |
| `Cannot read properties of undefined (reading 'call')` | Không có |
| `MODULE_NOT_FOUND` | Không có |
| `webpack.cache.PackFileCacheStrategy` kèm `ENOENT` | Không có |
| `vendor-chunks` | Không có |
| `_next/static` 404 lỗi | Không có |
| `/dashboard/tenants 500` | Không có |

## 6. Chưa kiểm thử sâu

- Không chạy upload/create/update/delete campaigns.
- Không chạy mutation quick-replies/content-packages/prompts/staff/appointments/settings/tenants.
- Không gửi POST `/webhook`.
- Không gọi external provider thật.
