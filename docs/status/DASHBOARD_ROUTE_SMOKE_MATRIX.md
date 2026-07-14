# DASHBOARD ROUTE SMOKE MATRIX

Ngày cập nhật: 2026-07-14

## 1. Điều kiện smoke mới nhất

| Hạng mục | Giá trị |
|---|---|
| Prompt | 21Y |
| Mục tiêu | Regression gate sau khi move docs/report vật lý |
| Dev server | `http://127.0.0.1:3019` |
| Port audit | `3002` có dashboard Next server cũ PID `24888`; `3019/3020/3021` rảnh |
| Có dừng server cũ không? | Có, dừng đúng PID `24888` thuộc workspace `dashboard` |
| Có clean `.next` không? | Có, path verified trong `dashboard/.next` rồi xóa |
| Có rebuild sau clean không? | Có, dashboard typecheck/build PASS |
| Có static asset smoke không? | Có, 125 asset từ HTML các route |
| Có dev log scan không? | Có |
| Có chạy mutation/upload/write không? | Không |

## 2. Full dashboard route smoke

| Route | HTTP status | Expected | Pass/Fail | Asset count | Ghi chú |
|---|---:|---:|---|---:|---|
| `/login` | 200 | 200 | PASS | 7 | OK |
| `/dashboard` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/analytics` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/prompts` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/staff` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/appointments` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/content-packages` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/quick-replies` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/campaigns` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/channel-configs` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/conversations` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/knowledge` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/settings` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/tenants` | 200 | 200 | PASS | 8 | OK, không tái hiện bug 21C-3 |
| `/dashboard/handoff` | 200 | 200 | PASS | 8 | OK |
| `/dashboard/__fake_21y__` | 404 | 404 | PASS | 6 | 404 hợp lệ cho route giả |

## 3. Static asset smoke summary

| Chỉ số | Kết quả |
|---|---|
| Tổng asset `_next/static` được request | 125 |
| Asset non-200 | 0 |
| Kết luận | PASS |

## 4. Dev log scan

| Signature | Kết quả |
|---|---|
| `Cannot find module './` | Không có |
| `MODULE_NOT_FOUND` | Không có |
| `Cannot read properties of undefined (reading 'call')` | Không có |
| `webpack.cache.PackFileCacheStrategy` | Không có |
| `ENOENT` | Không có |
| `vendor-chunks` | Không có |
| `_next/static` 404 | Không có |
| Dashboard route 500 | Không có |

## 5. Chưa kiểm thử sâu

- Không chạy upload/create/update/delete campaigns.
- Không chạy mutation quick-replies/content-packages/prompts/staff/appointments/settings/tenants.
- Không gửi POST `/webhook`.
- Không gọi external provider thật.
