DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportAppealStatus') THEN
    CREATE TYPE "ReportAppealStatus" AS ENUM ('pending', 'accepted', 'rejected');
  END IF;
END $$;

ALTER TABLE "report_cases"
ADD COLUMN IF NOT EXISTS "appeal_status" "ReportAppealStatus",
ADD COLUMN IF NOT EXISTS "appeal_reason" TEXT,
ADD COLUMN IF NOT EXISTS "appeal_submitted_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "appeal_resolved_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "appeal_resolved_by_id" TEXT,
ADD COLUMN IF NOT EXISTS "appeal_ai_summary" TEXT,
ADD COLUMN IF NOT EXISTS "appeal_ai_recommendation" TEXT,
ADD COLUMN IF NOT EXISTS "appeal_ai_confidence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "appeal_ai_checked_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "report_cases_appeal_status_submitted_at_idx"
ON "report_cases"("appeal_status", "appeal_submitted_at");
