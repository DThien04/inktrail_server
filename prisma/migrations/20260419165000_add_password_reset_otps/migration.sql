-- CreateTable
CREATE TABLE "password_reset_otps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_otps_email_created_at_idx" ON "password_reset_otps"("email", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_otps_user_id_created_at_idx" ON "password_reset_otps"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_otps_expires_at_idx" ON "password_reset_otps"("expires_at");

-- AddForeignKey
ALTER TABLE "password_reset_otps" ADD CONSTRAINT "password_reset_otps_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
