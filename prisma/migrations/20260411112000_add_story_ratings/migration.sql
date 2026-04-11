-- CreateTable
CREATE TABLE "story_ratings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "edit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "story_ratings_score_check" CHECK ("score" >= 1 AND "score" <= 5),
    CONSTRAINT "story_ratings_edit_count_check" CHECK ("edit_count" >= 0 AND "edit_count" <= 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "story_ratings_user_id_story_id_key" ON "story_ratings"("user_id", "story_id");

-- CreateIndex
CREATE INDEX "story_ratings_story_id_created_at_idx" ON "story_ratings"("story_id", "created_at");

-- CreateIndex
CREATE INDEX "story_ratings_user_id_created_at_idx" ON "story_ratings"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "story_ratings" ADD CONSTRAINT "story_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_ratings" ADD CONSTRAINT "story_ratings_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce one-time edit after create
CREATE OR REPLACE FUNCTION story_ratings_limit_single_edit()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id <> OLD.user_id OR NEW.story_id <> OLD.story_id THEN
        RAISE EXCEPTION 'story_ratings owner and story are immutable';
    END IF;

    IF OLD.edit_count >= 1 THEN
        RAISE EXCEPTION 'story rating can only be edited once';
    END IF;

    NEW.edit_count := OLD.edit_count + 1;
    NEW.updated_at := CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_story_ratings_limit_single_edit
BEFORE UPDATE ON "story_ratings"
FOR EACH ROW
EXECUTE FUNCTION story_ratings_limit_single_edit();
