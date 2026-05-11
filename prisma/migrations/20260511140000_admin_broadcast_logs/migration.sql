CREATE TABLE "admin_broadcast_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "total_accounts" INTEGER NOT NULL,
    "created_count" INTEGER NOT NULL,
    "failed_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_broadcast_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_broadcast_logs_created_at_idx" ON "admin_broadcast_logs"("created_at");

ALTER TABLE "admin_broadcast_logs" ADD CONSTRAINT "admin_broadcast_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
