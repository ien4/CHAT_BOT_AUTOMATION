-- Align knowledge_base.embedding với Prisma schema (Unsupported("vector")?)
-- Init migration tạo cột NOT NULL; schema đã đổi sang nullable nhưng chưa có migration sync.
-- Cho phép insert nội dung knowledge trước khi có embedding (RAG search đã filter `embedding IS NOT NULL`).
ALTER TABLE "knowledge_base" ALTER COLUMN "embedding" DROP NOT NULL;
