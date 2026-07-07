-- Migration 012: Scope conversations by tenant
-- Fix: fbUserId was globally unique, so same user across tenants would share one conversation
-- Solution: drop global unique, add composite index (fb_user_id, tenant_id)

-- 1. Drop the global unique constraint on fb_user_id
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_fb_user_id_key";

-- 2. Composite index for scoped lookups (fb_user_id + tenant_id)
--    Two separate partial unique indexes: one for tenant-scoped, one for legacy null tenant
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_fb_user_id_tenant_id_key"
  ON "conversations" ("fb_user_id", "tenant_id")
  WHERE "tenant_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_fb_user_id_no_tenant_key"
  ON "conversations" ("fb_user_id")
  WHERE "tenant_id" IS NULL;
