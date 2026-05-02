ALTER TABLE "chapter_comments"
ADD COLUMN "is_hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hidden_at" TIMESTAMP(3),
ADD COLUMN "hidden_by_id" TEXT,
ADD COLUMN "hidden_reason" TEXT;

ALTER TABLE "chapter_comments"
ADD CONSTRAINT "chapter_comments_hidden_by_id_fkey"
FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "chapter_comments_chapter_id_is_hidden_created_at_idx"
ON "chapter_comments"("chapter_id", "is_hidden", "created_at");

CREATE INDEX "chapter_comments_is_hidden_hidden_at_idx"
ON "chapter_comments"("is_hidden", "hidden_at");
