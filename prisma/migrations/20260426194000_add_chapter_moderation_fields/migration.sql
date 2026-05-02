ALTER TABLE "chapters"
ADD COLUMN "is_hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hidden_at" TIMESTAMP(3),
ADD COLUMN "hidden_by_id" TEXT,
ADD COLUMN "hidden_reason" TEXT;

ALTER TABLE "chapters"
ADD CONSTRAINT "chapters_hidden_by_id_fkey"
FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "chapters_story_id_is_hidden_chapter_number_idx"
ON "chapters"("story_id", "is_hidden", "chapter_number");

CREATE INDEX "chapters_is_hidden_hidden_at_idx"
ON "chapters"("is_hidden", "hidden_at");
