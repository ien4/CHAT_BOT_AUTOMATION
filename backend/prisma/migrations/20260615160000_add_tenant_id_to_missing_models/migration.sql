-- Migration 011: Add tenant_id to models missing it
-- Fixes "Lỗi tải" errors on content-packages, quick-reply-menus, prompts, appointments pages

ALTER TABLE "content_packages"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

ALTER TABLE "quick_reply_menus"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

ALTER TABLE "prompt_templates"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

-- Indexes for tenant scoping queries
CREATE INDEX IF NOT EXISTS "content_packages_tenant_id_idx" ON "content_packages"("tenant_id");
CREATE INDEX IF NOT EXISTS "quick_reply_menus_tenant_id_idx" ON "quick_reply_menus"("tenant_id");
CREATE INDEX IF NOT EXISTS "prompt_templates_tenant_id_idx" ON "prompt_templates"("tenant_id");
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_idx" ON "appointments"("tenant_id");
