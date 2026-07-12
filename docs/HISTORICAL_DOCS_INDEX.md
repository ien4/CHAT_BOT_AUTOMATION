# HISTORICAL DOCS INDEX

Ngày cập nhật: 2026-07-12

## 1. Mục đích

Repo giữ nhiều tài liệu và report từ các prompt trước để làm audit trail. Các tài liệu này hữu ích để hiểu quyết định quá khứ, nhưng không luôn phản ánh kiến trúc hiện tại.

Trước khi đọc tài liệu cũ, đọc `docs/CURRENT_STATUS_INDEX.md` và `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md` để biết source of truth hiện tại.

## 2. Historical reports

| Nhóm | File | Trạng thái | Cách đọc |
|---|---|---|---|
| Prompt reports | `report/PROMPT_*.md` | HISTORICAL_REPORT | Giữ nguyên làm bằng chứng từng prompt; không rewrite/xóa chỉ vì nhắc Chatwoot hoặc trạng thái cũ. |
| No-Chatwoot reports | `report/PROMPT_08*.md` | HISTORICAL_REPORT | Dùng để trace quá trình bỏ Chatwoot; trạng thái cuối cùng phải đối chiếu với current status docs. |
| Runtime/readiness reports | `report/PROMPT_21R*.md`, `report/PROMPT_21S*.md`, `report/PROMPT_21B*.md` | RECENT_HISTORY | Gần hiện tại hơn, nhưng vẫn là report theo thời điểm. |

## 3. Root docs stale/historical

| File | Phân loại | Lý do | Hành động |
|---|---|---|---|
| `MULTITENANT_PROGRESS.md` | HISTORICAL_OR_STALE_ROOT_DOC | Mô tả Chatwoot inbox, `/chatwoot-webhook/:slug`, `backend/src/chatwoot/api.js` như flow hiện tại. | Đã gắn header stale; không rewrite toàn file. |
| `ROADMAP.md` | HISTORICAL_OR_STALE_ROOT_DOC | Roadmap cũ còn `prisma db push`, Chatwoot-era flow và trạng thái tháng 6. | Đã gắn header stale; không rewrite toàn file. |
| `webhook-urls-current.txt` | GENERATED_OR_STALE_LOCAL_LOG | Log local/ngrok/cloudflared cũ, có warning No-Chatwoot sẵn. | Giữ nguyên, không dùng làm production truth. |

## 4. Docs có nội dung lịch sử cần đọc kèm caveat

| File | Caveat |
|---|---|
| `docs/ARCHITECTURE.md` | Có phần architecture shell lịch sử còn nhắc Chatwoot như integration cũ; đọc kèm `docs/CURRENT_STATUS_INDEX.md`. |
| `docs/FEATURE_INVENTORY.md` | Có inventory từ giai đoạn đầu còn mô tả Chatwoot và `db push` risk; không dùng làm trạng thái hiện tại nếu mâu thuẫn docs mới. |
| `start-all.bat`, `start_all.bat`, `stop-all.bat` | Script local legacy còn Chatwoot; không dùng cho production và chưa sửa trong Prompt 21D. |

## 5. Quy tắc đọc tài liệu cũ

- Ưu tiên `docs/CURRENT_STATUS_INDEX.md` trước.
- Ưu tiên `docs/PROJECT_GOALS_AND_FACEBOOK_WEBHOOK_STATUS.md` cho webhook/Meta/production status.
- Nếu report cũ nói Chatwoot là target, coi đó là bằng chứng quá khứ, không phải kiến trúc đích hiện tại.
- Nếu docs cũ nói production ready hoặc Meta connected, phải đối chiếu lại với current status; hiện tại production rollout và Meta verification vẫn pending.
- Không xóa hoặc rewrite historical reports nếu chưa có prompt archive riêng.
