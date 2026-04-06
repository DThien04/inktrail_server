-- AlterTable
ALTER TABLE "story_stats" ADD COLUMN     "like_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "chapter_stats" (
    "chapter_id" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_stats_pkey" PRIMARY KEY ("chapter_id")
);

-- AddForeignKey
ALTER TABLE "chapter_stats" ADD CONSTRAINT "chapter_stats_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
