-- Migration 010: Add chatwoot_conversation_id and bot_grace_until to conversations
-- These fields are required by chatwootHandler.js and tenant handoff logic

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "chatwoot_conversation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "bot_grace_until"           TIMESTAMP(3);

-- Index for fast lookup by chatwoot conversation id (used on every webhook)
CREATE INDEX IF NOT EXISTS "conversations_chatwoot_conversation_id_idx"
  ON "conversations"("chatwoot_conversation_id");
