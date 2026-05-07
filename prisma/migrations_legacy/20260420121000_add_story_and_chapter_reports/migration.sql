DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContentReportReason') THEN
    CREATE TYPE "ContentReportReason" AS ENUM (
      'spam',
      'copyright',
      'sexual',
      'violence',
      'hate',
      'misleading',
      'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContentReportStatus') THEN
    CREATE TYPE "ContentReportStatus" AS ENUM (
      'pending',
      'dismissed',
      'action_taken'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "story_reports" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "reason" "ContentReportReason" NOT NULL,
  "description" TEXT,
  "status" "ContentReportStatus" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),

  CONSTRAINT "story_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "chapter_reports" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "reason" "ContentReportReason" NOT NULL,
  "description" TEXT,
  "status" "ContentReportStatus" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),

  CONSTRAINT "chapter_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_reports_reporter_id_story_id_key"
ON "story_reports"("reporter_id", "story_id");

CREATE INDEX IF NOT EXISTS "story_reports_story_id_created_at_idx"
ON "story_reports"("story_id", "created_at");

CREATE INDEX IF NOT EXISTS "story_reports_status_created_at_idx"
ON "story_reports"("status", "created_at");

CREATE INDEX IF NOT EXISTS "story_reports_reporter_id_created_at_idx"
ON "story_reports"("reporter_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "chapter_reports_reporter_id_chapter_id_key"
ON "chapter_reports"("reporter_id", "chapter_id");

CREATE INDEX IF NOT EXISTS "chapter_reports_chapter_id_created_at_idx"
ON "chapter_reports"("chapter_id", "created_at");

CREATE INDEX IF NOT EXISTS "chapter_reports_status_created_at_idx"
ON "chapter_reports"("status", "created_at");

CREATE INDEX IF NOT EXISTS "chapter_reports_reporter_id_created_at_idx"
ON "chapter_reports"("reporter_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'story_reports_reporter_id_fkey'
  ) THEN
    ALTER TABLE "story_reports"
      ADD CONSTRAINT "story_reports_reporter_id_fkey"
      FOREIGN KEY ("reporter_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'story_reports_story_id_fkey'
  ) THEN
    ALTER TABLE "story_reports"
      ADD CONSTRAINT "story_reports_story_id_fkey"
      FOREIGN KEY ("story_id") REFERENCES "stories"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chapter_reports_reporter_id_fkey'
  ) THEN
    ALTER TABLE "chapter_reports"
      ADD CONSTRAINT "chapter_reports_reporter_id_fkey"
      FOREIGN KEY ("reporter_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chapter_reports_chapter_id_fkey'
  ) THEN
    ALTER TABLE "chapter_reports"
      ADD CONSTRAINT "chapter_reports_chapter_id_fkey"
      FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
