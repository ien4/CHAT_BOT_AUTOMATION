-- Migration: add webhook_event_receipts (durable Facebook Direct event receipt / idempotency)
--
-- FACEBOOK-DIRECT-CANONICAL-DURABLE-INGRESS-CLOSEOUT-01.
-- ADDITIVE ONLY. Default-inactive at runtime (used only when
-- FACEBOOK_CANONICAL_RUNTIME_MODE=enforce). No DROP, no RENAME, no destructive
-- data change, no default-tenant backfill. Safe to apply to LOCAL/STAGING only
-- after backup proof; NOT applied to production by this migration.
--
-- The unique index on idempotency_key is the atomic-winner authority that makes
-- Meta duplicate delivery safe (no double AI/tool/appointment/reply).
-- No secret / raw payload / message text is ever stored here.

CREATE TABLE IF NOT EXISTS "webhook_event_receipts" (
  "id"                   TEXT NOT NULL,
  "provider"             TEXT NOT NULL,
  "integration_id"       TEXT NOT NULL,
  "tenant_id"            TEXT NOT NULL,
  "provider_event_ref"   TEXT,
  "external_message_ref" TEXT,
  "event_type"           TEXT NOT NULL,
  "direction"            TEXT NOT NULL,
  "idempotency_key"      TEXT NOT NULL,
  "processing_state"     TEXT NOT NULL DEFAULT 'RESERVED',
  "attempt_count"        INTEGER NOT NULL DEFAULT 1,
  "first_received_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_attempt_at"      TIMESTAMP(3),
  "completed_at"         TIMESTAMP(3),
  "error_code"           TEXT,
  "correlation_id"       TEXT,
  "retention_until"      TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_event_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_event_receipts_idempotency_key_key"
  ON "webhook_event_receipts"("idempotency_key");

CREATE INDEX IF NOT EXISTS "webhook_event_receipts_provider_idx"
  ON "webhook_event_receipts"("provider");
CREATE INDEX IF NOT EXISTS "webhook_event_receipts_integration_id_idx"
  ON "webhook_event_receipts"("integration_id");
CREATE INDEX IF NOT EXISTS "webhook_event_receipts_tenant_id_idx"
  ON "webhook_event_receipts"("tenant_id");
CREATE INDEX IF NOT EXISTS "webhook_event_receipts_processing_state_idx"
  ON "webhook_event_receipts"("processing_state");
