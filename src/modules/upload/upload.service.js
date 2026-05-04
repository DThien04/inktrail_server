const crypto = require("crypto");
const sharp = require("sharp");
const prisma = require("../../config/prisma");
const {
  supabaseUrl,
  supabaseServiceRoleKey,
  supabaseAvatarBucket,
  supabaseStoryCoverBucket,
  isSupabaseStorageConfigured,
} = require("../../config/supabase");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_FILE_SIZE_BYTES = 1 * 1024 * 1024;
const AVATAR_RENDER_WIDTH = 512;
const AVATAR_RENDER_HEIGHT = 512;
const AVATAR_RENDER_QUALITY = 80;
const STORY_COVER_WIDTH = 900;
const STORY_COVER_HEIGHT = 1350;
const STORY_COVER_QUALITY = 82;

const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const readyBuckets = new Set();

const parseImageDataUri = (dataUri) => {
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("File áº£nh pháº£i lÃ  data URI base64 há»£p lá»‡");

  const mimeType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, "base64");

  return { mimeType, buffer };
};

const toDataUri = ({ buffer, mimeType }) =>
  `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;

const buildPublicUrl = ({ bucketName, filePath }) =>
  `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;

const buildRenderUrl = ({ bucketName, filePath }) =>
  `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;

const normalizeImageToWebp = async ({
  inputBuffer,
  width,
  height,
  quality,
  fit = "cover",
  background,
  maxOutputFileSizeBytes = MAX_OUTPUT_FILE_SIZE_BYTES,
  outputTooLargeMessage = "áº¢nh sau khi xá»­ lÃ½ vÆ°á»£t dung lÆ°á»£ng cho phÃ©p",
}) => {
  const outputBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(width, height, {
      fit,
      position: "centre",
      background,
      withoutEnlargement: false,
    })
    .webp({ quality })
    .toBuffer();

  if (!outputBuffer.length || outputBuffer.length > maxOutputFileSizeBytes) {
    throw new Error(outputTooLargeMessage);
  }

  return outputBuffer;
};

const normalizeAvatarToWebp = async (inputBuffer) =>
  normalizeImageToWebp({
    inputBuffer,
    width: AVATAR_RENDER_WIDTH,
    height: AVATAR_RENDER_HEIGHT,
    quality: AVATAR_RENDER_QUALITY,
    outputTooLargeMessage: "Avatar sau khi xá»­ lÃ½ pháº£i nhá» hÆ¡n hoáº·c báº±ng 1MB",
  });

const normalizeStoryCoverToWebp = async (inputBuffer) =>
  normalizeImageToWebp({
    inputBuffer,
    width: STORY_COVER_WIDTH,
    height: STORY_COVER_HEIGHT,
    quality: STORY_COVER_QUALITY,
    fit: "cover",
    outputTooLargeMessage: "áº¢nh bÃ¬a sau khi xá»­ lÃ½ pháº£i nhá» hÆ¡n hoáº·c báº±ng 1MB",
  });

const ensureStorageBucketExists = async (bucketName) => {
  if (readyBuckets.has(bucketName)) return;

  const authHeaders = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
  };

  const listResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "GET",
    headers: authHeaders,
  });

  if (!listResponse.ok) {
    const listText = await listResponse.text();
    throw new Error(
      `KhÃ´ng thá»ƒ láº¥y danh sÃ¡ch bucket: ${listResponse.status} ${listText || ""}`.trim(),
    );
  }

  const buckets = await listResponse.json();
  const exists = Array.isArray(buckets) && buckets.some((bucket) => bucket?.id === bucketName);

  if (exists) {
    readyBuckets.add(bucketName);
    return;
  }

  const createResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: bucketName,
      name: bucketName,
      public: true,
    }),
  });

  if (!createResponse.ok) {
    const createText = await createResponse.text();
    throw new Error(
      `KhÃ´ng thá»ƒ táº¡o bucket '${bucketName}': ${createResponse.status} ${createText || ""}`.trim(),
    );
  }

  readyBuckets.add(bucketName);
};

const uploadImage = async ({ bucketName, folder, imageBase64 }) => {
  if (!isSupabaseStorageConfigured()) {
    throw new Error("Supabase Storage chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh");
  }
  if (typeof fetch !== "function") {
    throw new Error("Node runtime chÆ°a há»— trá»£ fetch");
  }
  await ensureStorageBucketExists(bucketName);

  const { mimeType, buffer } = parseImageDataUri(imageBase64);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("áº¢nh chá»‰ há»— trá»£ jpeg, png hoáº·c webp");
  }
  if (!buffer.length || buffer.length > MAX_INPUT_FILE_SIZE_BYTES) {
    throw new Error("áº¢nh Ä‘áº§u vÃ o pháº£i nhá» hÆ¡n hoáº·c báº±ng 10MB");
  }

  const processedBuffer = await normalizeAvatarToWebp(buffer);
  const ext = extensionByMimeType["image/webp"];
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const filePath = `${folder}/${Date.now()}-${randomSuffix}.${ext}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "image/webp",
      "x-upsert": "true",
    },
    body: processedBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload áº£nh tháº¥t báº¡i: ${response.status} ${errorText || ""}`.trim());
  }

  return {
    filePath,
    publicUrl: buildPublicUrl({ bucketName, filePath }),
  };
};

const uploadStoryCoverAndGetUrl = async ({
  ownerId,
  coverBase64,
  coverBuffer,
  coverMimeType,
}) => {
  let normalizedCoverBase64 = coverBase64;
  if (!normalizedCoverBase64 && coverBuffer && coverMimeType) {
    normalizedCoverBase64 = toDataUri({
      buffer: coverBuffer,
      mimeType: coverMimeType,
    });
  }

  if (!normalizedCoverBase64) throw new Error("Thiáº¿u dá»¯ liá»‡u áº£nh bÃ¬a");
  if (!isSupabaseStorageConfigured()) {
    throw new Error("Supabase Storage chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh");
  }
  if (typeof fetch !== "function") {
    throw new Error("Node runtime chÆ°a há»— trá»£ fetch");
  }

  await ensureStorageBucketExists(supabaseStoryCoverBucket);

  const { mimeType, buffer } = parseImageDataUri(normalizedCoverBase64);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("áº¢nh bÃ¬a chá»‰ há»— trá»£ jpeg, png hoáº·c webp");
  }
  if (!buffer.length || buffer.length > MAX_INPUT_FILE_SIZE_BYTES) {
    throw new Error("áº¢nh bÃ¬a Ä‘áº§u vÃ o pháº£i nhá» hÆ¡n hoáº·c báº±ng 10MB");
  }

  const processedBuffer = await normalizeStoryCoverToWebp(buffer);
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const filePath = `stories/${ownerId}/covers/${Date.now()}-${randomSuffix}.webp`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${supabaseStoryCoverBucket}/${filePath}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "image/webp",
      "x-upsert": "true",
    },
    body: processedBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload áº£nh bÃ¬a tháº¥t báº¡i: ${response.status} ${errorText || ""}`.trim());
  }

  return buildPublicUrl({ bucketName: supabaseStoryCoverBucket, filePath });
};

const extractStorageTargetFromPublicUrl = (publicUrl) => {
  const normalizedUrl = String(publicUrl || "").trim();
  if (!normalizedUrl) return null;

  for (const bucketName of [
    supabaseAvatarBucket,
    supabaseStoryCoverBucket,
  ]) {
    const marker = `/storage/v1/object/public/${bucketName}/`;
    const index = normalizedUrl.indexOf(marker);
    if (index === -1) continue;

    const filePath = normalizedUrl.slice(index + marker.length).split("?")[0] || null;
    if (!filePath) continue;

    return { bucketName, filePath };
  }

  return null;
};

const deleteFileByPublicUrl = async (publicUrl) => {
  if (!isSupabaseStorageConfigured()) return;
  if (typeof fetch !== "function") return;

  const target = extractStorageTargetFromPublicUrl(publicUrl);
  if (!target) return;

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${target.bucketName}/${target.filePath}`,
    {
      method: "DELETE",
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`XÃ³a áº£nh tháº¥t báº¡i: ${response.status} ${errorText || ""}`.trim());
  }
};

const uploadMyAvatar = async ({ userId, avatarBase64, avatarBuffer, avatarMimeType }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng");

  const avatarRenderUrl = await uploadAvatarAndGetUrl({
    userId,
    avatarBase64,
    avatarBuffer,
    avatarMimeType,
  });

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: avatarRenderUrl },
  });

  return {
    id: updatedUser.id,
    email: updatedUser.email,
    display_name: updatedUser.displayName,
    avatar_url: updatedUser.avatarUrl,
    bio: updatedUser.bio,
    role: updatedUser.role,
  };
};

const uploadAvatarAndGetUrl = async ({
  userId,
  avatarBase64,
  avatarBuffer,
  avatarMimeType,
}) => {
  let normalizedAvatarBase64 = avatarBase64;
  if (!normalizedAvatarBase64 && avatarBuffer && avatarMimeType) {
    normalizedAvatarBase64 = toDataUri({
      buffer: avatarBuffer,
      mimeType: avatarMimeType,
    });
  }

  if (!normalizedAvatarBase64) throw new Error("Thiáº¿u dá»¯ liá»‡u avatar");

  const { filePath } = await uploadImage({
    bucketName: supabaseAvatarBucket,
    folder: `avatars/${userId}`,
    imageBase64: normalizedAvatarBase64,
  });

  return buildRenderUrlForAvatar(filePath);
};

const buildRenderUrlForAvatar = (filePath) =>
  buildRenderUrl({
    bucketName: supabaseAvatarBucket,
    filePath,
  });

module.exports = {
  uploadImage,
  uploadMyAvatar,
  uploadAvatarAndGetUrl,
  uploadStoryCoverAndGetUrl,
  deleteFileByPublicUrl,
};

