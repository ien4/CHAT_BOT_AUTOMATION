-- Migration: add Chatwoot account-level webhook runtime schema
--
-- CHATWOOT-ACCOUNT-WEBHOOK-RUNTIME-SCHEMA-DESIGN-01.
-- ADDITIVE ONLY. Default-inactive at runtime (guarded by WEBSITE_CHAT_ENABLED=false
-- and by is_enabled=false + null exact_version at row level). No DROP, no RENAME,
-- no destructive data change, no default-tenant backfill. Safe to apply to
-- LOCAL/STAGING only after backup proof; NOT applied to production by this migration.
--
-- Account webhook endpoint (provider_webhook_endpoints) is modeled SEPARATELY from
-- inbox->tenant binding (tenant_integrations + integration_identities). Transport
-- replay (webhook_delivery_receipts) is distinct from business idempotency
-- (webhook_event_receipts, added by a previous migration and REUSED here).
-- No secret / raw payload / raw body / message content is stored in any table below.

CREATE TABLE IF NOT EXISTS "provider_webhook_endpoints" (
  "id"                        TEXT NOT NULL,
  "provider"                  TEXT NOT NULL DEFAULT 'CHATWOOT',
  "channel"                   TEXT NOT NULL DEFAULT 'WEBSITE_CHAT',
  "mechanism"                 TEXT NOT NULL DEFAULT 'ACCOUNT_INTEGRATION_WEBHOOK',
  "deployment_key"            TEXT NOT NULL,
  "external_account_id"       TEXT NOT NULL,
  "public_endpoint_key"       TEXT NOT NULL,
  "minimum_supported_version" TEXT NOT NULL DEFAULT '4.13.0',
  "exact_version"             TEXT,
  "auth_mode"                 TEXT NOT NULL DEFAULT 'HMAC_SIGNED_WEBHOOK',
  "is_enabled"                BOOLEAN NOT NULL DEFAULT false,
  "config_version"            INTEGER NOT NULL DEFAULT 1,
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "provider_webhook_endpoints_public_endpoint_key_key"
  ON "provider_webhook_endpoints"("public_endpoint_key");
CREATE UNIQUE INDEX IF NOT EXISTS "provider_webhook_endpoints_prov_dep_acct_mech_key"
  ON "provider_webhook_endpoints"("provider", "deployment_key", "external_account_id", "mechanism");
CREATE INDEX IF NOT EXISTS "provider_webhook_endpoints_provider_idx"
  ON "provider_webhook_endpoints"("provider");
CREATE INDEX IF NOT EXISTS "provider_webhook_endpoints_is_enabled_idx"
  ON "provider_webhook_endpoints"("is_enabled");

CREATE TABLE IF NOT EXISTS "tenant_integrations" (
  "id"                  TEXT NOT NULL,
  "tenant_id"           TEXT NOT NULL,
  "webhook_endpoint_id" TEXT NOT NULL,
  "provider"            TEXT NOT NULL DEFAULT 'CHATWOOT',
  "channel"             TEXT NOT NULL DEFAULT 'WEBSITE_CHAT',
  "processing_mode"     TEXT NOT NULL DEFAULT 'AUTO_BOT',
  "handoff_policy"      TEXT NOT NULL DEFAULT 'BOT_FIRST',
  "is_enabled"          BOOLEAN NOT NULL DEFAULT false,
  "config_version"      INTEGER NOT NULL DEFAULT 1,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_integrations_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id")
    REFERENCES "provider_webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenant_integrations_tenant_id_idx"
  ON "tenant_integrations"("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_integrations_webhook_endpoint_id_idx"
  ON "tenant_integrations"("webhook_endpoint_id");
CREATE INDEX IF NOT EXISTS "tenant_integrations_is_enabled_idx"
  ON "tenant_integrations"("is_enabled");

CREATE TABLE IF NOT EXISTS "integration_identities" (
  "id"                      TEXT NOT NULL,
  "tenant_integration_id"   TEXT NOT NULL,
  "provider"                TEXT NOT NULL DEFAULT 'CHATWOOT',
  "deployment_key"          TEXT NOT NULL,
  "external_account_id"     TEXT NOT NULL,
  "external_inbox_id"       TEXT NOT NULL,
  "normalized_identity_key" TEXT NOT NULL,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_identities_tenant_integration_id_fkey" FOREIGN KEY ("tenant_integration_id")
    REFERENCES "tenant_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Global uniqueness: one (account+inbox) identity can bind to at most ONE enabled
-- integration, which prevents an external inbox from mapping to two Tenants.
CREATE UNIQUE INDEX IF NOT EXISTS "integration_identities_normalized_identity_key_key"
  ON "integration_identities"("normalized_identity_key");
CREATE UNIQUE INDEX IF NOT EXISTS "integration_identities_tenant_integration_id_key"
  ON "integration_identities"("tenant_integration_id");
CREATE INDEX IF NOT EXISTS "integration_identities_prov_dep_acct_idx"
  ON "integration_identities"("provider", "deployment_key", "external_account_id");

CREATE TABLE IF NOT EXISTS "integration_credentials" (
  "id"                  TEXT NOT NULL,
  "webhook_endpoint_id" TEXT NOT NULL,
  "credential_type"     TEXT NOT NULL,
  "ciphertext"          TEXT NOT NULL,
  "key_version"         INTEGER NOT NULL DEFAULT 1,
  "algorithm_version"   TEXT NOT NULL DEFAULT 'aes-256-gcm',
  "status"              TEXT NOT NULL DEFAULT 'ROTATION_REQUIRED',
  "last_rotated_at"     TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_credentials_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id")
    REFERENCES "provider_webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "integration_credentials_endpoint_type_key"
  ON "integration_credentials"("webhook_endpoint_id", "credential_type");
CREATE INDEX IF NOT EXISTS "integration_credentials_status_idx"
  ON "integration_credentials"("status");

CREATE TABLE IF NOT EXISTS "webhook_delivery_receipts" (
  "id"                  TEXT NOT NULL,
  "webhook_endpoint_id" TEXT NOT NULL,
  "delivery_ref_hash"   TEXT NOT NULL,
  "timestamp"           INTEGER,
  "received_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"          TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_delivery_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_delivery_receipts_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id")
    REFERENCES "provider_webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Durable transport replay authority: one delivery per endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_delivery_receipts_endpoint_delivery_key"
  ON "webhook_delivery_receipts"("webhook_endpoint_id", "delivery_ref_hash");
CREATE INDEX IF NOT EXISTS "webhook_delivery_receipts_expires_at_idx"
  ON "webhook_delivery_receipts"("expires_at");
