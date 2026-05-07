-- CreateEnum
CREATE TYPE "Role" AS ENUM ('reader', 'admin');

-- CreateEnum
CREATE TYPE "AuthorApplicationStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "ChapterCommentReportReason" AS ENUM ('spam', 'abuse', 'hate', 'sexual', 'violence', 'other');

-- CreateEnum
CREATE TYPE "ChapterCommentModerationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'approved', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "ChapterCommentReportStatus" AS ENUM ('pending', 'dismissed', 'removed');

-- CreateEnum
CREATE TYPE "ContentReportReason" AS ENUM ('spam', 'copyright', 'sexual', 'violence', 'hate', 'misleading', 'other');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('pending', 'dismissed', 'action_taken');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('story', 'chapter', 'chapter_comment');

-- CreateEnum
CREATE TYPE "ReportCaseStatus" AS ENUM ('pending', 'resolved');

-- CreateEnum
CREATE TYPE "ReportAppealStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "ReportCasePriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ReportResolutionAction" AS ENUM ('ignored', 'story_hidden', 'chapter_hidden', 'comment_removed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('system', 'chapter_liked', 'chapter_commented', 'chapter_published', 'story_published', 'admin_message');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('system', 'release', 'event', 'maintenance');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'reader',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "bio" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pen_name" TEXT NOT NULL,
    "bio" TEXT,
    "reason" TEXT,
    "sample_links" JSONB,
    "status" "AuthorApplicationStatus" NOT NULL DEFAULT 'pending',
    "trust_score_snapshot" INTEGER NOT NULL DEFAULT 0,
    "eligibility_snapshot" JSONB,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "reject_cooldown_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "author_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "status" "StoryStatus" NOT NULL DEFAULT 'draft',
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_id" TEXT,
    "hidden_reason" TEXT,
    "moderation_categories" JSONB,
    "moderation_checked_at" TIMESTAMP(3),
    "moderation_confidence" DOUBLE PRECISION,
    "moderation_reason" TEXT,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "last_chapter_index" INTEGER NOT NULL DEFAULT 0,
    "last_position" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "story_stats" (
    "story_id" TEXT NOT NULL,
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "story_stats_pkey" PRIMARY KEY ("story_id")
);

-- CreateTable
CREATE TABLE "chapter_stats" (
    "chapter_id" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "comment_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chapter_stats_pkey" PRIMARY KEY ("chapter_id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "chapter_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ChapterStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_id" TEXT,
    "hidden_reason" TEXT,
    "moderation_categories" JSONB,
    "moderation_checked_at" TIMESTAMP(3),
    "moderation_confidence" DOUBLE PRECISION,
    "moderation_reason" TEXT,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_ratings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "edit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "story_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_likes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_comments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_id" TEXT,
    "hidden_reason" TEXT,
    "moderation_status" "ChapterCommentModerationStatus" NOT NULL DEFAULT 'pending',
    "moderation_checked_at" TIMESTAMP(3),
    "moderation_categories" JSONB,
    "moderation_confidence" DOUBLE PRECISION,
    "moderation_reason" TEXT,

    CONSTRAINT "chapter_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_comment_likes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_cases" (
    "id" TEXT NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "status" "ReportCaseStatus" NOT NULL DEFAULT 'pending',
    "resolution_action" "ReportResolutionAction",
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "unique_reporter_count" INTEGER NOT NULL DEFAULT 0,
    "last_reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "priority" "ReportCasePriority" NOT NULL DEFAULT 'low',
    "last_resolution_action" "ReportResolutionAction",
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "reopened_count" INTEGER NOT NULL DEFAULT 0,
    "ai_flagged" BOOLEAN NOT NULL DEFAULT false,
    "ai_categories" JSONB,
    "ai_confidence" DOUBLE PRECISION,
    "ai_severity" TEXT,
    "ai_summary" TEXT,
    "ai_suggested_action" TEXT,
    "ai_checked_at" TIMESTAMP(3),
    "restored_at" TIMESTAMP(3),
    "restored_by_id" TEXT,
    "appeal_status" "ReportAppealStatus",
    "appeal_reason" TEXT,
    "appeal_submitted_at" TIMESTAMP(3),
    "appeal_resolved_at" TIMESTAMP(3),
    "appeal_resolved_by_id" TEXT,
    "appeal_ai_summary" TEXT,
    "appeal_ai_recommendation" TEXT,
    "appeal_ai_confidence" DOUBLE PRECISION,
    "appeal_ai_checked_at" TIMESTAMP(3),

    CONSTRAINT "report_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_comment_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "reason" "ChapterCommentReportReason" NOT NULL,
    "description" TEXT,
    "status" "ChapterCommentReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "case_id" TEXT NOT NULL,

    CONSTRAINT "chapter_comment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "reason" "ContentReportReason" NOT NULL,
    "description" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "case_id" TEXT NOT NULL,

    CONSTRAINT "story_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "reason" "ContentReportReason" NOT NULL,
    "description" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "case_id" TEXT NOT NULL,

    CONSTRAINT "chapter_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_comment_stats" (
    "comment_id" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_comment_stats_pkey" PRIMARY KEY ("comment_id")
);

-- CreateTable
CREATE TABLE "chapter_featured_comments" (
    "chapter_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_featured_comments_pkey" PRIMARY KEY ("chapter_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "story_id" TEXT,
    "chapter_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_url" TEXT,
    "meta" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_url" TEXT,
    "type" "AnnouncementType" NOT NULL DEFAULT 'system',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_genres" (
    "story_id" TEXT NOT NULL,
    "genre_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_genres_pkey" PRIMARY KEY ("story_id","genre_id")
);

-- CreateTable
CREATE TABLE "story_tags" (
    "story_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_tags_pkey" PRIMARY KEY ("story_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "author_applications_user_id_status_created_at_idx" ON "author_applications"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "author_applications_status_created_at_idx" ON "author_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "author_applications_reject_cooldown_until_idx" ON "author_applications"("reject_cooldown_until");

-- CreateIndex
CREATE INDEX "author_follows_author_id_created_at_idx" ON "author_follows"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "author_follows_follower_id_created_at_idx" ON "author_follows"("follower_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "author_follows_follower_id_author_id_key" ON "author_follows"("follower_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_otps_email_created_at_idx" ON "password_reset_otps"("email", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_otps_user_id_created_at_idx" ON "password_reset_otps"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_otps_expires_at_idx" ON "password_reset_otps"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "stories_slug_key" ON "stories"("slug");

-- CreateIndex
CREATE INDEX "stories_author_id_idx" ON "stories"("author_id");

-- CreateIndex
CREATE INDEX "stories_status_created_at_idx" ON "stories"("status", "created_at");

-- CreateIndex
CREATE INDEX "stories_status_is_hidden_created_at_idx" ON "stories"("status", "is_hidden", "created_at");

-- CreateIndex
CREATE INDEX "stories_moderation_status_updated_at_idx" ON "stories"("moderation_status", "updated_at");

-- CreateIndex
CREATE INDEX "stories_is_hidden_hidden_at_idx" ON "stories"("is_hidden", "hidden_at");

-- CreateIndex
CREATE INDEX "reading_progress_user_id_updated_at_idx" ON "reading_progress"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "reading_progress_story_id_idx" ON "reading_progress"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_user_id_story_id_key" ON "reading_progress"("user_id", "story_id");

-- CreateIndex
CREATE INDEX "story_read_sessions_story_id_counted_at_idx" ON "story_read_sessions"("story_id", "counted_at");

-- CreateIndex
CREATE INDEX "story_read_sessions_user_id_story_id_counted_at_idx" ON "story_read_sessions"("user_id", "story_id", "counted_at");

-- CreateIndex
CREATE INDEX "story_read_sessions_device_id_story_id_counted_at_idx" ON "story_read_sessions"("device_id", "story_id", "counted_at");

-- CreateIndex
CREATE INDEX "chapters_story_id_status_idx" ON "chapters"("story_id", "status");

-- CreateIndex
CREATE INDEX "chapters_story_id_moderation_status_chapter_number_idx" ON "chapters"("story_id", "moderation_status", "chapter_number");

-- CreateIndex
CREATE INDEX "chapters_story_id_is_hidden_chapter_number_idx" ON "chapters"("story_id", "is_hidden", "chapter_number");

-- CreateIndex
CREATE INDEX "chapters_is_hidden_hidden_at_idx" ON "chapters"("is_hidden", "hidden_at");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_story_id_chapter_number_key" ON "chapters"("story_id", "chapter_number");

-- CreateIndex
CREATE INDEX "story_ratings_story_id_created_at_idx" ON "story_ratings"("story_id", "created_at");

-- CreateIndex
CREATE INDEX "story_ratings_user_id_created_at_idx" ON "story_ratings"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "story_ratings_user_id_story_id_key" ON "story_ratings"("user_id", "story_id");

-- CreateIndex
CREATE INDEX "chapter_likes_chapter_id_idx" ON "chapter_likes"("chapter_id");

-- CreateIndex
CREATE INDEX "chapter_likes_user_id_idx" ON "chapter_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_likes_user_id_chapter_id_key" ON "chapter_likes"("user_id", "chapter_id");

-- CreateIndex
CREATE INDEX "chapter_comments_chapter_id_created_at_idx" ON "chapter_comments"("chapter_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comments_chapter_id_is_hidden_created_at_idx" ON "chapter_comments"("chapter_id", "is_hidden", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comments_chapter_id_moderation_status_created_at_idx" ON "chapter_comments"("chapter_id", "moderation_status", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comments_is_hidden_hidden_at_idx" ON "chapter_comments"("is_hidden", "hidden_at");

-- CreateIndex
CREATE INDEX "chapter_comments_user_id_created_at_idx" ON "chapter_comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comment_likes_comment_id_idx" ON "chapter_comment_likes"("comment_id");

-- CreateIndex
CREATE INDEX "chapter_comment_likes_user_id_idx" ON "chapter_comment_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_comment_likes_user_id_comment_id_key" ON "chapter_comment_likes"("user_id", "comment_id");

-- CreateIndex
CREATE INDEX "report_cases_status_last_reported_at_idx" ON "report_cases"("status", "last_reported_at");

-- CreateIndex
CREATE INDEX "report_cases_target_type_status_updated_at_idx" ON "report_cases"("target_type", "status", "updated_at");

-- CreateIndex
CREATE INDEX "report_cases_priority_status_last_reported_at_idx" ON "report_cases"("priority", "status", "last_reported_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_cases_target_type_target_id_key" ON "report_cases"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "chapter_comment_reports_case_id_created_at_idx" ON "chapter_comment_reports"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comment_reports_comment_id_created_at_idx" ON "chapter_comment_reports"("comment_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comment_reports_status_created_at_idx" ON "chapter_comment_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comment_reports_reporter_id_created_at_idx" ON "chapter_comment_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_comment_reports_reporter_id_comment_id_key" ON "chapter_comment_reports"("reporter_id", "comment_id");

-- CreateIndex
CREATE INDEX "story_reports_case_id_created_at_idx" ON "story_reports"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "story_reports_story_id_created_at_idx" ON "story_reports"("story_id", "created_at");

-- CreateIndex
CREATE INDEX "story_reports_status_created_at_idx" ON "story_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "story_reports_reporter_id_created_at_idx" ON "story_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "story_reports_reporter_id_story_id_key" ON "story_reports"("reporter_id", "story_id");

-- CreateIndex
CREATE INDEX "chapter_reports_case_id_created_at_idx" ON "chapter_reports"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_reports_chapter_id_created_at_idx" ON "chapter_reports"("chapter_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_reports_status_created_at_idx" ON "chapter_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "chapter_reports_reporter_id_created_at_idx" ON "chapter_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_reports_reporter_id_chapter_id_key" ON "chapter_reports"("reporter_id", "chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_featured_comments_comment_id_key" ON "chapter_featured_comments"("comment_id");

-- CreateIndex
CREATE INDEX "chapter_featured_comments_score_idx" ON "chapter_featured_comments"("score");

-- CreateIndex
CREATE INDEX "chapter_featured_comments_computed_at_idx" ON "chapter_featured_comments"("computed_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_is_read_created_at_idx" ON "notifications"("recipient_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_actor_id_idx" ON "notifications"("actor_id");

-- CreateIndex
CREATE INDEX "notifications_story_id_idx" ON "notifications"("story_id");

-- CreateIndex
CREATE INDEX "notifications_chapter_id_idx" ON "notifications"("chapter_id");

-- CreateIndex
CREATE INDEX "announcements_is_active_published_at_idx" ON "announcements"("is_active", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE INDEX "genres_is_active_name_idx" ON "genres"("is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "tags_is_active_name_idx" ON "tags"("is_active", "name");

-- CreateIndex
CREATE INDEX "story_genres_genre_id_idx" ON "story_genres"("genre_id");

-- CreateIndex
CREATE INDEX "story_tags_tag_id_idx" ON "story_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "author_applications" ADD CONSTRAINT "author_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_applications" ADD CONSTRAINT "author_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_follows" ADD CONSTRAINT "author_follows_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_follows" ADD CONSTRAINT "author_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_otps" ADD CONSTRAINT "password_reset_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_read_sessions" ADD CONSTRAINT "story_read_sessions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_read_sessions" ADD CONSTRAINT "story_read_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_stats" ADD CONSTRAINT "story_stats_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_stats" ADD CONSTRAINT "chapter_stats_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_ratings" ADD CONSTRAINT "story_ratings_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_ratings" ADD CONSTRAINT "story_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_likes" ADD CONSTRAINT "chapter_likes_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_likes" ADD CONSTRAINT "chapter_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comments" ADD CONSTRAINT "chapter_comments_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comments" ADD CONSTRAINT "chapter_comments_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comments" ADD CONSTRAINT "chapter_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_likes" ADD CONSTRAINT "chapter_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_likes" ADD CONSTRAINT "chapter_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_reports" ADD CONSTRAINT "chapter_comment_reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "report_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_reports" ADD CONSTRAINT "chapter_comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_reports" ADD CONSTRAINT "chapter_comment_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "report_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_reports" ADD CONSTRAINT "story_reports_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_reports" ADD CONSTRAINT "chapter_reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "report_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_reports" ADD CONSTRAINT "chapter_reports_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_reports" ADD CONSTRAINT "chapter_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_stats" ADD CONSTRAINT "chapter_comment_stats_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_featured_comments" ADD CONSTRAINT "chapter_featured_comments_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_featured_comments" ADD CONSTRAINT "chapter_featured_comments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_genres" ADD CONSTRAINT "story_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_genres" ADD CONSTRAINT "story_genres_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
