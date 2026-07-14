# docs/policies

Ngày cập nhật: 2026-07-14

Thư mục policy bắt buộc.

| File | Vai trò |
|---|---|
| `ENV_POLICY.md` | Quy tắc env/secret và biến legacy. |
| `DEPLOYMENT_POLICY.md` | Chính sách deploy/migration. |
| `QUALITY_GATE.md` | Lệnh validation hiện tại. |

Không in secret thật, không stage `.env`, không dùng `db push --accept-data-loss` cho production.
