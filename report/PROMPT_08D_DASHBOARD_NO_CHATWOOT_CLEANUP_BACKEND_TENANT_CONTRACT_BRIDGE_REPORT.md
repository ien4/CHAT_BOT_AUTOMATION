# Prompt 08D - Dashboard no-Chatwoot cleanup + backend tenant contract bridge

Ngày thực hiện: 2026-07-09

## Mục tiêu

- Làm sạch Dashboard source khỏi Chatwoot runtime/reference.
- Gỡ các call Dashboard tới route legacy test/lookup.
- Giữ tenant create/update hoạt động dù Dashboard không gửi legacy fields.
- Không sửa Prisma schema/migrations, RAG, webhook handler, tenant handoff, bot engine/tools, package, Dockerfile hoặc scripts.

## Việc đã làm

- Gỡ `CHATWOOT_BASE_URL` và `NEXT_PUBLIC_CHATWOOT_URL` khỏi `dashboard/src/lib/config/env.ts`.
- Gỡ `channelConfigsApi.lookupInboxes()` khỏi `dashboard/src/lib/api.ts`.
- Gỡ block test kết nối legacy khỏi `dashboard/src/app/dashboard/settings/page.tsx`.
- Gỡ inbox picker và lookup route khỏi `dashboard/src/app/dashboard/channel-configs/page.tsx`.
- Gỡ model/account/token/team/base URL/webhook secret legacy khỏi `dashboard/src/app/dashboard/tenants/page.tsx`.
- Cập nhật README feature nằm trong `dashboard/src/features` để không còn nhắc Chatwoot.
- Thêm bridge trong `backend/src/api/dashboard.js`: `POST /tenants` chỉ còn bắt buộc `slug` và `name`, backend tự điền `direct-facebook` vào các cột schema cũ khi client không gửi.

## Validation

- Baseline trước sửa: các `node --check` backend trọng yếu PASS, `npx prisma validate` PASS, `dashboard tsc --noEmit` PASS.
- `rg -n -i "chatwoot|NEXT_PUBLIC_CHATWOOT|lookupInboxes|chatwoot-test|lookup-inboxes" dashboard/src` không còn kết quả.
- `node --check backend/src/api/dashboard.js` PASS.
- `npx prisma validate` PASS.
- `npx --no-install tsc --noEmit` trong `dashboard` PASS.
- `npm run --if-present build` trong `dashboard` PASS.
- `git diff --check` PASS, chỉ có warning CRLF/LF của Git trên Windows.
- Runtime nhẹ: backend đang chạy sẵn `/health` trả `status=ok`; dashboard đang chạy sẵn trả HTTP 200.

## Giới hạn

- `npm run --if-present lint` bị chặn bởi prompt tương tác cấu hình ESLint vì project chưa có ESLint config.
- Chưa chạy create/update tenant mutating smoke để tránh ghi DB ngoài phạm vi prompt.
- Chưa cleanup schema legacy; các cột cũ trong Prisma vẫn còn theo ràng buộc Prompt 08D.

## Gợi ý tiếp theo

- Tạo prompt migration/schema cleanup riêng cho `Tenant` legacy columns, có backup/rollback plan.
- Tạo prompt lint quality gate để `next lint` chạy non-interactive.
- Chạy tenant create/update smoke trên DB test riêng để xác nhận contract mới end-to-end.

## Điểm cần tu sửa

- Backend vẫn còn tên field legacy trong schema/API vì chưa có migration cleanup.
- Backend route lookup/test legacy nếu còn tồn tại cần được xử lý ở prompt backend cleanup riêng.
- Dashboard tenant form hiện giữ contract tối giản; nếu cần thêm cấu hình page/tenant mới, nên thiết kế contract mới không phụ thuộc legacy schema.

## Kết luận

**PASS WITH WARNINGS**. Dashboard source đã sạch theo scan Prompt 08D, build/typecheck pass, backend tenant create có compatibility bridge. Warning còn lại là lint chưa cấu hình và chưa có mutating runtime smoke cho tenant create/update.
