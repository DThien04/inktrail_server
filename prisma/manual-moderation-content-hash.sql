ALTER TABLE "chapters"
ADD COLUMN IF NOT EXISTS "last_approved_content_hash" TEXT,
ADD COLUMN IF NOT EXISTS "last_rejected_content_hash" TEXT;
