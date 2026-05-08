-- CreateTable
CREATE TABLE "tag_groups" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tag_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_groups_name_key" ON "tag_groups"("name");

-- AlterTable
ALTER TABLE "tags" ADD COLUMN "group_id" TEXT;

-- CreateIndex
CREATE INDEX "tags_group_id_name_idx" ON "tags"("group_id", "name");

-- AddForeignKey
ALTER TABLE "tags"
ADD CONSTRAINT "tags_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "tag_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

