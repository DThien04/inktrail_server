-- Normalize existing users before removing enum value
UPDATE "users"
SET "role" = 'reader'
WHERE "role"::text = 'author';

-- Recreate Role enum without author
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('reader', 'admin');

ALTER TABLE "users"
ALTER COLUMN "role" DROP DEFAULT,
ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role"),
ALTER COLUMN "role" SET DEFAULT 'reader';

DROP TYPE "Role_old";
