require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAvatarBucket =
  process.env.SUPABASE_AVATAR_BUCKET ||
  process.env.SUPABASE_STORAGE_BUCKET ||
  "avatars";
const supabaseStoryCoverBucket =
  process.env.SUPABASE_STORY_COVER_BUCKET || "story-covers";
const supabaseHomeBannerBucket =
  process.env.SUPABASE_HOME_BANNER_BUCKET || "home-banners";

const isSupabaseStorageConfigured = () =>
  Boolean(
    supabaseUrl &&
      supabaseServiceRoleKey &&
      supabaseAvatarBucket &&
      supabaseStoryCoverBucket &&
      supabaseHomeBannerBucket,
  );

module.exports = {
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseAvatarBucket,
  supabaseStoryCoverBucket,
  supabaseHomeBannerBucket,
  isSupabaseStorageConfigured,
};
