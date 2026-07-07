# Application layer

Layer `application` sẽ chứa use case, DTO và validation nghiệp vụ, ví dụ xử lý incoming message, tạo lịch hẹn, search knowledge, handoff hoặc quản lý tenant.

Quy tắc phụ thuộc:

- Application có thể phụ thuộc domain.
- Application không gọi Prisma trực tiếp nếu chưa đi qua repository contract.
- Application không import Express request/response hoặc SDK hạ tầng.

Prompt 03 chỉ tạo shell, chưa move logic từ bot, webhook, dashboard API hoặc tenant handoff.
