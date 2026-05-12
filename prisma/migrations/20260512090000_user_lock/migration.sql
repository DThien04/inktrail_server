-- CreateEnum
CREATE TYPE "UserLockAction" AS ENUM ('lock', 'unlock');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "locked_at" TIMESTAMP(3),
ADD COLUMN "locked_by_id" TEXT,
ADD COLUMN "locked_reason" TEXT,
ADD COLUMN "locked_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_is_locked_locked_until_idx" ON "users"("is_locked", "locked_until");

-- AddForeignKey
ALTER TABLE "users"
ADD CONSTRAINT "users_locked_by_id_fkey"
FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "user_lock_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" "UserLockAction" NOT NULL,
    "reason" TEXT,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_lock_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_lock_logs_user_id_created_at_idx" ON "user_lock_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_lock_logs"
ADD CONSTRAINT "user_lock_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lock_logs"
ADD CONSTRAINT "user_lock_logs_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
