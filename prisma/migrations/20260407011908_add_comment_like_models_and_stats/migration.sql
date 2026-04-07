-- CreateTable
CREATE TABLE "story_comment_likes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_comment_likes_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "story_comment_stats" (
    "comment_id" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_comment_stats_pkey" PRIMARY KEY ("comment_id")
);

-- CreateTable
CREATE TABLE "chapter_comment_stats" (
    "comment_id" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_comment_stats_pkey" PRIMARY KEY ("comment_id")
);

-- CreateIndex
CREATE INDEX "story_comment_likes_comment_id_idx" ON "story_comment_likes"("comment_id");

-- CreateIndex
CREATE INDEX "story_comment_likes_user_id_idx" ON "story_comment_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_comment_likes_user_id_comment_id_key" ON "story_comment_likes"("user_id", "comment_id");

-- CreateIndex
CREATE INDEX "chapter_comment_likes_comment_id_idx" ON "chapter_comment_likes"("comment_id");

-- CreateIndex
CREATE INDEX "chapter_comment_likes_user_id_idx" ON "chapter_comment_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_comment_likes_user_id_comment_id_key" ON "chapter_comment_likes"("user_id", "comment_id");

-- AddForeignKey
ALTER TABLE "story_comment_likes" ADD CONSTRAINT "story_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_comment_likes" ADD CONSTRAINT "story_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "story_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_likes" ADD CONSTRAINT "chapter_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_likes" ADD CONSTRAINT "chapter_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_comment_stats" ADD CONSTRAINT "story_comment_stats_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "story_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_comment_stats" ADD CONSTRAINT "chapter_comment_stats_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
