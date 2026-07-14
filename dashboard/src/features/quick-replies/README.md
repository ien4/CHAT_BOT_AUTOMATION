# Quick replies feature

Feature module cho trang `/dashboard/quick-replies`.

- `hooks/useQuickReplies.ts`: state, data loading và handlers create/update/delete menu.
- `components/**`: render header, loading/error/empty state, list menu và form modal.
- `types.ts`: type nội bộ cho menu, item và form state.
- `lib/quickReplyFormatters.ts`: intent type labels và helper label.

Lưu ý an toàn: mutation create/update/delete được preserve nhưng không chạy trong smoke Prompt 21C-2-SAFE.
