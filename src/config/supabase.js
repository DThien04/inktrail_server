require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET || "avatars";

const isSupabaseStorageConfigured = () =>
  Boolean(supabaseUrl && supabaseServiceRoleKey && supabaseStorageBucket);

module.exports = {
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseStorageBucket,
  isSupabaseStorageConfigured,
};
