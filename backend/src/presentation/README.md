# Presentation layer

Layer `presentation` sẽ chứa entrypoint HTTP, route registration, controller và middleware.

Quy tắc phụ thuộc:

- Presentation gọi application use case.
- Presentation không chứa business rules dài hạn.
- Không đổi public API route hoặc webhook URL khi tách layer.

Prompt 03 chưa move `index.js`, `api/dashboard.js` hoặc webhook handlers.
