# Domain layer

Layer `domain` sẽ chứa khái niệm nghiệp vụ thuần của chatbot: tenant, conversation, message, appointment, knowledge, staff, handoff, content package và channel config.

Quy tắc phụ thuộc:

- Domain không import `infrastructure`, Prisma, Express, Chatwoot, Telegram, Facebook hoặc LLM SDK.
- Domain chỉ chứa entity, value object và interface nghiệp vụ khi đã có nhu cầu thật.
- Không đưa logic gọi database, webhook hoặc API ngoài vào layer này.

Các prompt sau có thể đưa dần status constants, entity thuần và repository contracts vào đây sau khi có regression checklist.
