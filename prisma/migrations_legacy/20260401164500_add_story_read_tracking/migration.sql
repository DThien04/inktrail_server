CREATE TABLE "story_read_sessions" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "chapter_index" INTEGER NOT NULL DEFAULT 0,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "max_scroll_percent" INTEGER NOT NULL DEFAULT 0,
    "counted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_read_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "story_read_sessions_story_id_counted_at_idx" ON "story_read_sessions"("story_id", "counted_at");
CREATE INDEX "story_read_sessions_user_id_story_id_counted_at_idx" ON "story_read_sessions"("user_id", "story_id", "counted_at");
CREATE INDEX "story_read_sessions_device_id_story_id_counted_at_idx" ON "story_read_sessions"("device_id", "story_id", "counted_at");

ALTER TABLE "story_read_sessions"
ADD CONSTRAINT "story_read_sessions_story_id_fkey"
FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_read_sessions"
ADD CONSTRAINT "story_read_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "story_stats" (
    "story_id" TEXT NOT NULL,
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_stats_pkey" PRIMARY KEY ("story_id")
);

ALTER TABLE "story_stats"
ADD CONSTRAINT "story_stats_story_id_fkey"
FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
