BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportCasePriority') THEN
    CREATE TYPE "ReportCasePriority" AS ENUM (
      'low',
      'medium',
      'high',
      'critical'
    );
  END IF;
END $$;

ALTER TABLE "report_cases"
ADD COLUMN IF NOT EXISTS "priority" "ReportCasePriority" NOT NULL DEFAULT 'low',
ADD COLUMN IF NOT EXISTS "last_resolution_action" "ReportResolutionAction",
ADD COLUMN IF NOT EXISTS "risk_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "reopened_count" INTEGER NOT NULL DEFAULT 0;

UPDATE "report_cases"
SET
  "priority" = CASE
    WHEN "risk_score" >= 85 THEN 'critical'::"ReportCasePriority"
    WHEN "risk_score" >= 60 THEN 'high'::"ReportCasePriority"
    WHEN "risk_score" >= 32 THEN 'medium'::"ReportCasePriority"
    ELSE 'low'::"ReportCasePriority"
  END,
  "last_resolution_action" = COALESCE("resolution_action", "last_resolution_action");

CREATE INDEX IF NOT EXISTS "report_cases_priority_status_last_reported_at_idx"
ON "report_cases"("priority", "status", "last_reported_at");

COMMIT;
