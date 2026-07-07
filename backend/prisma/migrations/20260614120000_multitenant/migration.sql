-- Migration 008: Multi-tenant support
-- Thêm Tenant, TenantChannelConfig, TenantStaff
-- Thêm tenantId vào knowledge_base và conversations

-- ==================== TENANTS ====================

CREATE TABLE "tenants" (
  "id"                        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "slug"                      TEXT NOT NULL,
  "name"                      TEXT NOT NULL,
  "is_active"                 BOOLEAN NOT NULL DEFAULT true,
  -- 'shared' = Chatwoot của platform | 'dedicated' = Chatwoot riêng của tenant
  "chatwoot_model"            TEXT NOT NULL DEFAULT 'dedicated',
  "chatwoot_account_id"       TEXT NOT NULL,
  -- Chỉ dùng cho 'dedicated' model (null = dùng env của platform)
  "chatwoot_base_url"         TEXT,
  "chatwoot_api_token_enc"    TEXT,
  -- Optional cả 2 model
  "chatwoot_team_id"          TEXT,
  "webhook_secret_enc"        TEXT,
  -- Telegram handoff
  "telegram_group_chat_id"    TEXT,
  -- Handoff settings
  "pending_timeout_seconds"   INTEGER NOT NULL DEFAULT 30,
  "session_timeout_seconds"   INTEGER NOT NULL DEFAULT 30,
  "off_hours_pending_timeout" INTEGER NOT NULL DEFAULT 10,
  "work_hours_start"          INTEGER,
  "work_hours_end"            INTEGER,
  -- Bot config
  "default_persona"           TEXT,
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- ==================== TENANT CHANNEL CONFIGS ====================

CREATE TABLE "tenant_channel_configs" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"        TEXT NOT NULL,
  "inbox_id"         TEXT NOT NULL,
  "channel_type"     TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "knowledge_filter" TEXT[] NOT NULL DEFAULT '{}',
  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_channel_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_channel_configs_tenant_id_inbox_id_key"
  ON "tenant_channel_configs"("tenant_id", "inbox_id");

ALTER TABLE "tenant_channel_configs"
  ADD CONSTRAINT "tenant_channel_configs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==================== TENANT STAFF ====================

CREATE TABLE "tenant_staff" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"        TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "telegram_id"      TEXT NOT NULL,
  "telegram_chat_id" TEXT NOT NULL,
  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  "is_on_duty"       BOOLEAN NOT NULL DEFAULT false,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_staff_tenant_id_telegram_id_key"
  ON "tenant_staff"("tenant_id", "telegram_id");

ALTER TABLE "tenant_staff"
  ADD CONSTRAINT "tenant_staff_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==================== ADD tenantId TO EXISTING TABLES ====================

-- KnowledgeBase: null = owner's KB, non-null = tenant's KB
ALTER TABLE "knowledge_base" ADD COLUMN "tenant_id" TEXT;

-- Conversations: null = owner's conv, non-null = tenant's conv
-- Note: fbUserId cho tenant có dạng "tenantSlug::originalUserId" để giữ @@unique constraint
ALTER TABLE "conversations" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "conversations" ADD COLUMN "assigned_tenant_staff_id" TEXT;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_assigned_tenant_staff_id_fkey"
  FOREIGN KEY ("assigned_tenant_staff_id") REFERENCES "tenant_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes cho lookup nhanh theo tenant
CREATE INDEX "knowledge_base_tenant_id_idx" ON "knowledge_base"("tenant_id");
CREATE INDEX "conversations_tenant_id_idx" ON "conversations"("tenant_id");
