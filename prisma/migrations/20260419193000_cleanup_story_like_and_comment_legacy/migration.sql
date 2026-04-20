BEGIN;

DELETE FROM "notifications"
WHERE "type"::text = 'story_liked';

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";

CREATE TYPE "NotificationType" AS ENUM (
  'system',
  'chapter_liked',
  'chapter_commented',
  'chapter_published',
  'story_published',
  'admin_message'
);

ALTER TABLE "notifications"
  ALTER COLUMN "type" TYPE "NotificationType"
  USING (
    CASE
      WHEN "type"::text = 'story_commented' THEN 'chapter_commented'
      ELSE "type"::text
    END
  )::"NotificationType";

DROP TYPE "NotificationType_old";

DROP TABLE IF EXISTS "story_featured_comments";
DROP TABLE IF EXISTS "story_comment_stats";
DROP TABLE IF EXISTS "story_comment_likes";
DROP TABLE IF EXISTS "story_comments";
DROP TABLE IF EXISTS "story_likes";

COMMIT;
