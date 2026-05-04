require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAvatarBucket =
  process.env.SUPABASE_AVATAR_BUCKET ||
  process.env.SUPABASE_STORAGE_BUCKET ||
  "avatars";
const supabaseStoryCoverBucket =
  process.env.SUPABASE_STORY_COVER_BUCKET || "story-covers";

const isSupabaseStorageConfigured = () =>
  Boolean(
    supabaseUrl &&
      supabaseServiceRoleKey &&
      supabaseAvatarBucket &&
      supabaseStoryCoverBucket,
  );

module.exports = {
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseAvatarBucket,
  supabaseStoryCoverBucket,
  isSupabaseStorageConfigured,
};
