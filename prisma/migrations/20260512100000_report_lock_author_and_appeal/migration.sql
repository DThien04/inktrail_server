-- AlterEnum: bổ sung các action lock auto/qua appeal
ALTER TYPE "UserLockAction" ADD VALUE IF NOT EXISTS 'unlock_via_appeal';
ALTER TYPE "UserLockAction" ADD VALUE IF NOT EXISTS 'auto_unlock';

-- CreateEnum
CREATE TYPE "UserLockAppealStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable: report_cases bổ sung cờ + người bị khóa do case
ALTER TABLE "report_cases"
ADD COLUMN "account_lock_applied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "account_locked_user_id" TEXT;

-- CreateIndex
CREATE INDEX "report_cases_account_lock_applied_idx" ON "report_cases"("account_lock_applied");

-- AddForeignKey
ALTER TABLE "report_cases"
ADD CONSTRAINT "report_cases_account_locked_user_id_fkey"
FOREIGN KEY ("account_locked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: user_lock_logs bổ sung case_id
ALTER TABLE "user_lock_logs"
ADD COLUMN "case_id" TEXT;

-- CreateIndex
CREATE INDEX "user_lock_logs_case_id_idx" ON "user_lock_logs"("case_id");

-- AddForeignKey
ALTER TABLE "user_lock_logs"
ADD CONSTRAINT "user_lock_logs_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "report_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: user_lock_appeals
CREATE TABLE "user_lock_appeals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "UserLockAppealStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "resolver_note" TEXT,

    CONSTRAINT "user_lock_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_lock_appeals_user_id_submitted_at_idx" ON "user_lock_appeals"("user_id", "submitted_at");

-- CreateIndex
CREATE INDEX "user_lock_appeals_status_submitted_at_idx" ON "user_lock_appeals"("status", "submitted_at");

-- AddForeignKey
ALTER TABLE "user_lock_appeals"
ADD CONSTRAINT "user_lock_appeals_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lock_appeals"
ADD CONSTRAINT "user_lock_appeals_resolved_by_id_fkey"
FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
