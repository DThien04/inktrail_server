ALTER TABLE "report_cases"
ADD COLUMN "ai_flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ai_categories" JSONB,
ADD COLUMN "ai_confidence" DOUBLE PRECISION,
ADD COLUMN "ai_severity" TEXT,
ADD COLUMN "ai_summary" TEXT,
ADD COLUMN "ai_suggested_action" TEXT,
ADD COLUMN "ai_checked_at" TIMESTAMP(3);
