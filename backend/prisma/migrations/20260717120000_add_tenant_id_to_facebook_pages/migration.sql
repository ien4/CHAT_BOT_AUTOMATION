-- Migration 013: Add tenant ownership to facebook_pages
-- Source-of-truth: FacebookPage.pageId -> FacebookPage.tenantId -> Tenant
-- Nullable to preserve legacy rows. No default tenant. No data mutation. Non-destructive.

-- 1. Add nullable tenant_id column
ALTER TABLE "facebook_pages"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

-- 2. Index for tenant-scoped lookups
CREATE INDEX IF NOT EXISTS "facebook_pages_tenant_id_idx" ON "facebook_pages"("tenant_id");

-- 3. Optional FK to tenants; ON DELETE SET NULL so removing a tenant leaves the page legacy/null (not deleted)
ALTER TABLE "facebook_pages"
  ADD CONSTRAINT "facebook_pages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
