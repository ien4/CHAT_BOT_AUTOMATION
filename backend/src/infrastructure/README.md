# Infrastructure layer

Layer `infrastructure` sẽ chứa implementation kỹ thuật: Prisma, repository, API client ngoài, LLM, Chatwoot, Facebook, Telegram, notification và RAG.

Quy tắc phụ thuộc:

- Infrastructure có thể phụ thuộc domain/application interface.
- Infrastructure không được làm domain phụ thuộc ngược lại.
- Không tạo PrismaClient thứ hai; dùng singleton hiện tại qua wrapper.

Prompt 03 chỉ thêm wrapper an toàn, chưa move webhook, RAG, tenant handoff hoặc bot engine.
