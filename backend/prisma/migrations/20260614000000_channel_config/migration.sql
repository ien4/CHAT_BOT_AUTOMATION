-- Migration 007: Channel Config
-- Thêm ChannelConfig để bot nhận biết channel (facebook/web/whatsapp/...)
-- Thêm channel + page_context vào conversations

-- CreateTable
CREATE TABLE "channel_configs" (
    "id" TEXT NOT NULL,
    "inbox_id" TEXT NOT NULL,
    "channel_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "knowledge_filter" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bot_persona_override" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_configs_inbox_id_key" ON "channel_configs"("inbox_id");

-- AlterTable conversations: thêm channel + page_context
ALTER TABLE "conversations"
    ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN "page_context" JSONB;
