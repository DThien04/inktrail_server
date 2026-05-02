ALTER TABLE "stories"
ADD COLUMN "is_hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hidden_at" TIMESTAMP(3),
ADD COLUMN "hidden_by_id" TEXT,
ADD COLUMN "hidden_reason" TEXT;

ALTER TABLE "stories"
ADD CONSTRAINT "stories_hidden_by_id_fkey"
FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "stories_status_is_hidden_created_at_idx"
ON "stories"("status", "is_hidden", "created_at");

CREATE INDEX "stories_is_hidden_hidden_at_idx"
ON "stories"("is_hidden", "hidden_at");
