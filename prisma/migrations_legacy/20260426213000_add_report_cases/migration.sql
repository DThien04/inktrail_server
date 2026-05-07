BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportTargetType') THEN
    CREATE TYPE "ReportTargetType" AS ENUM (
      'story',
      'chapter',
      'chapter_comment'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportCaseStatus') THEN
    CREATE TYPE "ReportCaseStatus" AS ENUM (
      'pending',
      'resolved'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportResolutionAction') THEN
    CREATE TYPE "ReportResolutionAction" AS ENUM (
      'ignored',
      'story_hidden',
      'chapter_hidden',
      'comment_removed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "report_cases" (
  "id" TEXT NOT NULL,
  "target_type" "ReportTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "status" "ReportCaseStatus" NOT NULL DEFAULT 'pending',
  "resolution_action" "ReportResolutionAction",
  "report_count" INTEGER NOT NULL DEFAULT 0,
  "unique_reporter_count" INTEGER NOT NULL DEFAULT 0,
  "last_reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "report_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_cases_target_type_target_id_key" UNIQUE ("target_type", "target_id")
);

ALTER TABLE "story_reports"
ADD COLUMN IF NOT EXISTS "case_id" TEXT;

ALTER TABLE "chapter_reports"
ADD COLUMN IF NOT EXISTS "case_id" TEXT;

ALTER TABLE "chapter_comment_reports"
ADD COLUMN IF NOT EXISTS "case_id" TEXT;

INSERT INTO "report_cases" (
  "id",
  "target_type",
  "target_id",
  "status",
  "resolution_action",
  "report_count",
  "unique_reporter_count",
  "last_reported_at",
  "resolved_at",
  "created_at",
  "updated_at"
)
SELECT
  'story:' || "story_id" AS "id",
  'story'::"ReportTargetType" AS "target_type",
  "story_id" AS "target_id",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN 'pending'::"ReportCaseStatus"
    ELSE 'resolved'::"ReportCaseStatus"
  END AS "status",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN NULL
    WHEN BOOL_OR("status" = 'action_taken') THEN 'story_hidden'::"ReportResolutionAction"
    ELSE 'ignored'::"ReportResolutionAction"
  END AS "resolution_action",
  COUNT(*)::INTEGER AS "report_count",
  COUNT(DISTINCT "reporter_id")::INTEGER AS "unique_reporter_count",
  MAX("created_at") AS "last_reported_at",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN NULL
    ELSE MAX(COALESCE("resolved_at", "updated_at"))
  END AS "resolved_at",
  MIN("created_at") AS "created_at",
  MAX("updated_at") AS "updated_at"
FROM "story_reports"
GROUP BY "story_id"
ON CONFLICT ("target_type", "target_id") DO UPDATE
SET
  "status" = EXCLUDED."status",
  "resolution_action" = EXCLUDED."resolution_action",
  "report_count" = EXCLUDED."report_count",
  "unique_reporter_count" = EXCLUDED."unique_reporter_count",
  "last_reported_at" = EXCLUDED."last_reported_at",
  "resolved_at" = EXCLUDED."resolved_at",
  "created_at" = EXCLUDED."created_at",
  "updated_at" = EXCLUDED."updated_at";

INSERT INTO "report_cases" (
  "id",
  "target_type",
  "target_id",
  "status",
  "resolution_action",
  "report_count",
  "unique_reporter_count",
  "last_reported_at",
  "resolved_at",
  "created_at",
  "updated_at"
)
SELECT
  'chapter:' || "chapter_id" AS "id",
  'chapter'::"ReportTargetType" AS "target_type",
  "chapter_id" AS "target_id",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN 'pending'::"ReportCaseStatus"
    ELSE 'resolved'::"ReportCaseStatus"
  END AS "status",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN NULL
    WHEN BOOL_OR("status" = 'action_taken') THEN 'chapter_hidden'::"ReportResolutionAction"
    ELSE 'ignored'::"ReportResolutionAction"
  END AS "resolution_action",
  COUNT(*)::INTEGER AS "report_count",
  COUNT(DISTINCT "reporter_id")::INTEGER AS "unique_reporter_count",
  MAX("created_at") AS "last_reported_at",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN NULL
    ELSE MAX(COALESCE("resolved_at", "updated_at"))
  END AS "resolved_at",
  MIN("created_at") AS "created_at",
  MAX("updated_at") AS "updated_at"
FROM "chapter_reports"
GROUP BY "chapter_id"
ON CONFLICT ("target_type", "target_id") DO UPDATE
SET
  "status" = EXCLUDED."status",
  "resolution_action" = EXCLUDED."resolution_action",
  "report_count" = EXCLUDED."report_count",
  "unique_reporter_count" = EXCLUDED."unique_reporter_count",
  "last_reported_at" = EXCLUDED."last_reported_at",
  "resolved_at" = EXCLUDED."resolved_at",
  "created_at" = EXCLUDED."created_at",
  "updated_at" = EXCLUDED."updated_at";

INSERT INTO "report_cases" (
  "id",
  "target_type",
  "target_id",
  "status",
  "resolution_action",
  "report_count",
  "unique_reporter_count",
  "last_reported_at",
  "resolved_at",
  "created_at",
  "updated_at"
)
SELECT
  'chapter_comment:' || "comment_id" AS "id",
  'chapter_comment'::"ReportTargetType" AS "target_type",
  "comment_id" AS "target_id",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN 'pending'::"ReportCaseStatus"
    ELSE 'resolved'::"ReportCaseStatus"
  END AS "status",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN NULL
    WHEN BOOL_OR("status" = 'removed') THEN 'comment_removed'::"ReportResolutionAction"
    ELSE 'ignored'::"ReportResolutionAction"
  END AS "resolution_action",
  COUNT(*)::INTEGER AS "report_count",
  COUNT(DISTINCT "reporter_id")::INTEGER AS "unique_reporter_count",
  MAX("created_at") AS "last_reported_at",
  CASE
    WHEN BOOL_OR("status" = 'pending') THEN NULL
    ELSE MAX(COALESCE("resolved_at", "updated_at"))
  END AS "resolved_at",
  MIN("created_at") AS "created_at",
  MAX("updated_at") AS "updated_at"
FROM "chapter_comment_reports"
GROUP BY "comment_id"
ON CONFLICT ("target_type", "target_id") DO UPDATE
SET
  "status" = EXCLUDED."status",
  "resolution_action" = EXCLUDED."resolution_action",
  "report_count" = EXCLUDED."report_count",
  "unique_reporter_count" = EXCLUDED."unique_reporter_count",
  "last_reported_at" = EXCLUDED."last_reported_at",
  "resolved_at" = EXCLUDED."resolved_at",
  "created_at" = EXCLUDED."created_at",
  "updated_at" = EXCLUDED."updated_at";

UPDATE "story_reports" AS sr
SET "case_id" = rc."id"
FROM "report_cases" AS rc
WHERE rc."target_type" = 'story'
  AND rc."target_id" = sr."story_id"
  AND (sr."case_id" IS NULL OR sr."case_id" <> rc."id");

UPDATE "chapter_reports" AS cr
SET "case_id" = rc."id"
FROM "report_cases" AS rc
WHERE rc."target_type" = 'chapter'
  AND rc."target_id" = cr."chapter_id"
  AND (cr."case_id" IS NULL OR cr."case_id" <> rc."id");

UPDATE "chapter_comment_reports" AS ccr
SET "case_id" = rc."id"
FROM "report_cases" AS rc
WHERE rc."target_type" = 'chapter_comment'
  AND rc."target_id" = ccr."comment_id"
  AND (ccr."case_id" IS NULL OR ccr."case_id" <> rc."id");

ALTER TABLE "story_reports"
ALTER COLUMN "case_id" SET NOT NULL;

ALTER TABLE "chapter_reports"
ALTER COLUMN "case_id" SET NOT NULL;

ALTER TABLE "chapter_comment_reports"
ALTER COLUMN "case_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "report_cases_status_last_reported_at_idx"
ON "report_cases"("status", "last_reported_at");

CREATE INDEX IF NOT EXISTS "report_cases_target_type_status_updated_at_idx"
ON "report_cases"("target_type", "status", "updated_at");

CREATE INDEX IF NOT EXISTS "story_reports_case_id_created_at_idx"
ON "story_reports"("case_id", "created_at");

CREATE INDEX IF NOT EXISTS "chapter_reports_case_id_created_at_idx"
ON "chapter_reports"("case_id", "created_at");

CREATE INDEX IF NOT EXISTS "chapter_comment_reports_case_id_created_at_idx"
ON "chapter_comment_reports"("case_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'story_reports_case_id_fkey'
  ) THEN
    ALTER TABLE "story_reports"
      ADD CONSTRAINT "story_reports_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "report_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chapter_reports_case_id_fkey'
  ) THEN
    ALTER TABLE "chapter_reports"
      ADD CONSTRAINT "chapter_reports_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "report_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chapter_comment_reports_case_id_fkey'
  ) THEN
    ALTER TABLE "chapter_comment_reports"
      ADD CONSTRAINT "chapter_comment_reports_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "report_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
