CREATE TABLE "telegram_destinations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'group',
    "purpose" TEXT NOT NULL DEFAULT 'status',
    "chat_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_destinations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_destinations_chat_id_key" ON "telegram_destinations"("chat_id");
CREATE INDEX "telegram_destinations_purpose_is_active_idx" ON "telegram_destinations"("purpose", "is_active");
