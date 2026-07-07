-- Migration 009: Add HandoffEvent model for handoff analytics
-- Tracks every handoff action for statistics

CREATE TABLE "handoff_events" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenant_id"       TEXT,
    "conversation_id" TEXT NOT NULL,
    "staff_id"        TEXT,
    "staff_name"      TEXT,
    "customer_name"   TEXT,
    "customer_id"     TEXT NOT NULL,
    "event_type"      TEXT NOT NULL,
    "duration_ms"     INTEGER,
    "metadata"        JSONB,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_events_pkey" PRIMARY KEY ("id")
);

-- Indexes for fast analytics queries
CREATE INDEX "handoff_events_tenant_id_created_at_idx" ON "handoff_events"("tenant_id", "created_at");
CREATE INDEX "handoff_events_tenant_id_event_type_idx" ON "handoff_events"("tenant_id", "event_type");
CREATE INDEX "handoff_events_staff_id_idx" ON "handoff_events"("staff_id");
CREATE INDEX "handoff_events_conversation_id_idx" ON "handoff_events"("conversation_id");
