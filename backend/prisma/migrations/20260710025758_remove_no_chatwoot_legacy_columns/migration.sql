-- Migration: remove No-Chatwoot legacy columns
--
-- Prompt 08F — drop các cột legacy Chatwoot đã stop-write ở 08D/08E.
-- Chỉ drop đúng index + columns legacy. KHÔNG chạm RAG/vector/knowledge,
-- KHÔNG đổi default/constraint không liên quan (drift có sẵn để nguyên).
--
-- Backup local đã tạo trước khi apply (custom-format pg_dump, không commit).

-- DropIndex (index lookup theo chatwoot conversation id)
DROP INDEX IF EXISTS "conversations_chatwoot_conversation_id_idx";

-- Conversation: drop cột legacy
ALTER TABLE "conversations"
  DROP COLUMN IF EXISTS "chatwoot_conversation_id";

-- Tenant: drop các cột legacy Chatwoot + webhook secret (nguồn gốc Chatwoot webhook)
ALTER TABLE "tenants"
  DROP COLUMN IF EXISTS "chatwoot_model",
  DROP COLUMN IF EXISTS "chatwoot_account_id",
  DROP COLUMN IF EXISTS "chatwoot_base_url",
  DROP COLUMN IF EXISTS "chatwoot_api_token_enc",
  DROP COLUMN IF EXISTS "chatwoot_team_id",
  DROP COLUMN IF EXISTS "webhook_secret_enc";
