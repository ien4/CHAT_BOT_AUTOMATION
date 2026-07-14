# Campaigns feature

Feature module cho campaign legacy UI.

Prompt 21C-3 đã tách route `/dashboard/campaigns` khỏi page monolith sang hook/components/types/lib trong folder này.

Lưu ý an toàn:

- Giữ nguyên API facade `campaignsApi` từ `dashboard/src/lib/api.ts`.
- Giữ nguyên upload/create/update/delete handlers nhưng runtime smoke không chạy các action này.
- Không migrate dữ liệu, không gọi external provider, không đổi backend/schema/package.
