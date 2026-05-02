DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ChapterCommentModerationStatus'
  ) THEN
    CREATE TYPE "ChapterCommentModerationStatus" AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE "chapter_comments"
ADD COLUMN IF NOT EXISTS "moderation_status" "ChapterCommentModerationStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "moderation_checked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "moderation_categories" JSONB,
ADD COLUMN IF NOT EXISTS "moderation_confidence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "moderation_reason" TEXT;

CREATE INDEX IF NOT EXISTS "chapter_comments_chapter_id_moderation_status_created_at_idx"
ON "chapter_comments"("chapter_id", "moderation_status", "created_at");
