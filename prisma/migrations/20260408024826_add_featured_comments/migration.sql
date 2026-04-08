-- CreateTable
CREATE TABLE "story_featured_comments" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_featured_comments_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "story_featured_comments_story_id_comment_id_key" ON "story_featured_comments"("story_id", "comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_featured_comments_story_id_rank_key" ON "story_featured_comments"("story_id", "rank");

-- CreateIndex
CREATE INDEX "story_featured_comments_story_id_rank_idx" ON "story_featured_comments"("story_id", "rank");

-- CreateIndex
CREATE INDEX "story_featured_comments_score_idx" ON "story_featured_comments"("score");

-- CreateIndex
CREATE INDEX "story_featured_comments_computed_at_idx" ON "story_featured_comments"("computed_at");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_featured_comments_comment_id_key" ON "chapter_featured_comments"("comment_id");

-- CreateIndex
CREATE INDEX "chapter_featured_comments_score_idx" ON "chapter_featured_comments"("score");

-- CreateIndex
CREATE INDEX "chapter_featured_comments_computed_at_idx" ON "chapter_featured_comments"("computed_at");

-- AddForeignKey
ALTER TABLE "story_featured_comments" ADD CONSTRAINT "story_featured_comments_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_featured_comments" ADD CONSTRAINT "story_featured_comments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "story_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_featured_comments" ADD CONSTRAINT "chapter_featured_comments_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_featured_comments" ADD CONSTRAINT "chapter_featured_comments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "chapter_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
