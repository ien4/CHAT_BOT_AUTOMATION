# Content packages feature

Feature module cho trang `/dashboard/content-packages`.

- `hooks/useContentPackages.ts`: state, data loading, CRUD handlers và handler migrate được giữ nguyên behavior.
- `components/**`: render header, list, detail và form modal.
- `types.ts`: type nội bộ của package và item.
- `lib/contentPackageFormatters.ts`: formatter label cho loại item.

Lưu ý an toàn: action migrate từ campaign chỉ được preserve trong UI/hook, không chạy trong smoke Prompt 21C-SAFE.
