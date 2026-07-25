-- Migration: add Chatwoot outbound durability schema
--
-- CHATWOOT-OUTBOUND-DURABILITY-SCHEMA-IMPLEMENTATION-01.
-- ADDITIVE ONLY. Default-inactive at runtime: no feature flag is changed, no live
-- entrypoint is enabled, no fixture installation is enabled, and no real data is
-- backfilled. This migration stores per-installation Chatwoot API origin plus a
-- metadata-only durable outbound delivery ledger.

ALTER TABLE "provider_webhook_endpoints"
  ADD COLUMN "api_base_url" TEXT;

CREATE TABLE "outbound_delivery_receipts" (
  "id" TEXT NOT NULL,
  "tenant_integration_id" TEXT NOT NULL,
  "outbound_command_key" TEXT NOT NULL,
  "business_idempotency_key" TEXT NOT NULL,
  "external_conversation_ref" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "remote_message_id" TEXT,
  "safe_error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbound_delivery_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_delivery_receipts_outbound_command_key_key"
  ON "outbound_delivery_receipts"("outbound_command_key");

CREATE INDEX "outbound_delivery_receipts_status_idx"
  ON "outbound_delivery_receipts"("status");

CREATE INDEX "outbound_delivery_receipts_tenant_integration_id_idx"
  ON "outbound_delivery_receipts"("tenant_integration_id");

ALTER TABLE "outbound_delivery_receipts"
  ADD CONSTRAINT "outbound_delivery_receipts_tenant_integration_id_fkey"
  FOREIGN KEY ("tenant_integration_id") REFERENCES "tenant_integrations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;