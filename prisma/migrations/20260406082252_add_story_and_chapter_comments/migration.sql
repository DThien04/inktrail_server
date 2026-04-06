-- AlterTable
ALTER TABLE "chapter_stats" ADD COLUMN     "comment_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "story_stats" ADD COLUMN     "comment_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "story_comments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_comments_pkey" PRIMARY KEY ("id")
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

    CONSTRAINT "chapter_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_comments_story_id_created_at_idx" ON "story_comments"("story_id", "created_at");

-- CreateIndex
CREATE INDEX "story_comments_user_id_created_at_idx" ON "story_comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comments_chapter_id_created_at_idx" ON "chapter_comments"("chapter_id", "created_at");

-- CreateIndex
CREATE INDEX "chapter_comments_user_id_created_at_idx" ON "chapter_comments"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comments" ADD CONSTRAINT "chapter_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comments" ADD CONSTRAINT "chapter_comments_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
