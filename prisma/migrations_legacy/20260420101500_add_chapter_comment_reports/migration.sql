BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ChapterCommentReportReason'
  ) THEN
    CREATE TYPE "ChapterCommentReportReason" AS ENUM (
      'spam',
      'abuse',
      'hate',
      'sexual',
      'violence',
      'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ChapterCommentReportStatus'
  ) THEN
    CREATE TYPE "ChapterCommentReportStatus" AS ENUM (
      'pending',
      'dismissed',
      'removed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "chapter_comment_reports" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "comment_id" TEXT NOT NULL,
  "reason" "ChapterCommentReportReason" NOT NULL,
  "description" TEXT,
  "status" "ChapterCommentReportStatus" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),

  CONSTRAINT "chapter_comment_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chapter_comment_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chapter_comment_reports_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "chapter_comment_reports_reporter_id_comment_id_key"
  ON "chapter_comment_reports"("reporter_id", "comment_id");

CREATE INDEX IF NOT EXISTS "chapter_comment_reports_comment_id_created_at_idx"
  ON "chapter_comment_reports"("comment_id", "created_at");

CREATE INDEX IF NOT EXISTS "chapter_comment_reports_status_created_at_idx"
  ON "chapter_comment_reports"("status", "created_at");

CREATE INDEX IF NOT EXISTS "chapter_comment_reports_reporter_id_created_at_idx"
  ON "chapter_comment_reports"("reporter_id", "created_at");

COMMIT;
