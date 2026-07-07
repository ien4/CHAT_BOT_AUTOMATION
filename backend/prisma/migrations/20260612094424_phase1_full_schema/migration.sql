-- Phase 1 Full Schema Migration
-- Bao gồm: Staff, HandoffSettings, ContentPackage, QuickReplyMenu, FacebookPage
-- Cùng với các thay đổi trên Conversation, KnowledgeBase, PromptTemplate

-- Migration 001: Staff & Handoff --

CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_on_duty" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_telegram_id_key" ON "staff"("telegram_id");
CREATE UNIQUE INDEX "staff_telegram_chat_id_key" ON "staff"("telegram_chat_id");

CREATE TABLE "handoff_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "pending_timeout_seconds" INTEGER NOT NULL DEFAULT 30,
    "session_timeout_seconds" INTEGER NOT NULL DEFAULT 30,
    "off_hours_pending_timeout" INTEGER NOT NULL DEFAULT 10,
    "work_hours_start" INTEGER,
    "work_hours_end" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "handoff_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "conversations"
    ADD COLUMN "handoff_status" TEXT NOT NULL DEFAULT 'bot',
    ADD COLUMN "assigned_staff_id" TEXT,
    ADD COLUMN "human_session_expires_at" TIMESTAMP(3);

ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_assigned_staff_id_fkey"
    FOREIGN KEY ("assigned_staff_id") REFERENCES "staff"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Migration 002: Knowledge Base types --

ALTER TABLE "knowledge_base"
    ADD COLUMN "type" TEXT NOT NULL DEFAULT 'document',
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "file_url" TEXT,
    ADD COLUMN "parent_id" TEXT;

ALTER TABLE "knowledge_base"
    ADD CONSTRAINT "knowledge_base_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "knowledge_base"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Migration 003: ContentPackage (đổi từ Campaign) --

CREATE TABLE "content_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_package_items" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "url" TEXT,
    "file_url" TEXT,
    "description" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_package_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "content_package_items"
    ADD CONSTRAINT "content_package_items_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "content_packages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration 004: PromptTemplate layer --

ALTER TABLE "prompt_templates"
    ADD COLUMN "layer" TEXT NOT NULL DEFAULT 'intent';

-- Migration 005: QuickReplyMenu --

CREATE TABLE "quick_reply_menus" (
    "id" TEXT NOT NULL,
    "intent_type" TEXT NOT NULL,
    "page_id" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quick_reply_menus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quick_reply_menus_intent_type_page_id_key"
    ON "quick_reply_menus"("intent_type", "page_id");

-- Migration 006: FacebookPage --

CREATE TABLE "facebook_pages" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "bot_persona" TEXT,
    "knowledge_filter" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "facebook_pages_page_id_key" ON "facebook_pages"("page_id");
