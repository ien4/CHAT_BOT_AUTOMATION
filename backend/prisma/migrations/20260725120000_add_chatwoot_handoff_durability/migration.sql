-- Migration: add Chatwoot handoff durability schema
--
-- CHATWOOT-HANDOFF-DURABILITY-SCHEMA-IMPLEMENTATION-01.
-- ADDITIVE ONLY. Default-inactive at runtime: no feature flag is changed, no
-- provider adapter is wired, no real data is backfilled, and no Chatwoot API is
-- called. The table stores only safe request/ownership references and bounded
-- state/evidence codes.

CREATE TABLE "chatwoot_handoff_executions" (
  "id" TEXT NOT NULL,
  "tenant_integration_id" TEXT NOT NULL,
  "handoff_request_key" TEXT NOT NULL,
  "active_ownership_key" TEXT,
  "business_idempotency_key" TEXT NOT NULL,
  "external_conversation_ref" TEXT NOT NULL,
  "local_ownership_state" TEXT NOT NULL,
  "provider_execution_state" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "assignment_target_kind" TEXT,
  "assignment_target_ref" TEXT,
  "safe_reason_code" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "remote_evidence_ref" TEXT,
  "safe_error_code" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "reconciliation_required_at" TIMESTAMP(3),
  CONSTRAINT "chatwoot_handoff_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chatwoot_handoff_executions_handoff_request_key_key"
  ON "chatwoot_handoff_executions"("handoff_request_key");

CREATE UNIQUE INDEX "chatwoot_handoff_executions_active_ownership_key_key"
  ON "chatwoot_handoff_executions"("active_ownership_key");

CREATE INDEX "chatwoot_handoff_tenant_conversation_idx"
  ON "chatwoot_handoff_executions"("tenant_integration_id", "external_conversation_ref");

CREATE INDEX "chatwoot_handoff_local_state_updated_idx"
  ON "chatwoot_handoff_executions"("local_ownership_state", "updated_at");

CREATE INDEX "chatwoot_handoff_provider_state_updated_idx"
  ON "chatwoot_handoff_executions"("provider_execution_state", "updated_at");

ALTER TABLE "chatwoot_handoff_executions"
  ADD CONSTRAINT "chatwoot_handoff_executions_tenant_integration_id_fkey"
  FOREIGN KEY ("tenant_integration_id") REFERENCES "tenant_integrations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;