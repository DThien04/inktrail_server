const { oneSignal } = require("../../config/jwt");

const normalizeText = (value) => String(value ?? "").trim();

const oneSignalConfig = {
  appId: normalizeText(oneSignal?.appId),
  restApiKey: normalizeText(oneSignal?.restApiKey),
  apiUrl: normalizeText(oneSignal?.apiUrl),
};

const isOneSignalConfigured = () =>
  Boolean(oneSignalConfig.appId && oneSignalConfig.restApiKey);

/** Serialize outbound OneSignal REST calls to reduce rate-limit / burst failures. */
const oneSignalQueue = [];
let oneSignalDraining = false;

const enqueueOneSignalJob = (job) =>
  new Promise((resolve, reject) => {
    oneSignalQueue.push({ job, resolve, reject });
    void drainOneSignalQueue();
  });

const drainOneSignalQueue = async () => {
  if (oneSignalDraining) return;
  oneSignalDraining = true;
  try {
    while (oneSignalQueue.length > 0) {
      const { job, resolve, reject } = oneSignalQueue.shift();
      try {
        await job();
        resolve();
      } catch (err) {
        reject(err);
      }
    }
  } finally {
    oneSignalDraining = false;
    if (oneSignalQueue.length > 0) {
      void drainOneSignalQueue();
    }
  }
};

const sendPushToUserImmediate = async ({
  userId,
  title,
  body,
  data,
}) => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId || !isOneSignalConfigured()) return;

  const heading = normalizeText(title) || "Thông báo mới";
  const content = normalizeText(body) || "Bạn có một thông báo mới.";

  const payload = {
    app_id: oneSignalConfig.appId,
    include_aliases: {
      external_id: [normalizedUserId],
    },
    target_channel: "push",
    // Same Vietnamese copy for en + vi so devices with either locale show correct diacritics.
    headings: { en: heading, vi: heading },
    contents: { en: content, vi: content },
    data: data && typeof data === "object" ? data : {},
  };

  const response = await fetch(oneSignalConfig.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${oneSignalConfig.restApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `OneSignal push failed (${response.status}): ${raw || "unknown error"}`,
    );
  }
};

const sendPushToUser = async (args) => {
  const normalizedUserId = normalizeText(args?.userId);
  if (!normalizedUserId || !isOneSignalConfigured()) return;
  return enqueueOneSignalJob(() => sendPushToUserImmediate(args));
};

/**
 * Push tới mọi subscription đã gắn tag giống app Flutter (`onesignal_service.dart`:
 * `publish_public` = true, `app` = inktrail) — gồm cả người chưa login.
 * Không dùng chung một request với `include_aliases` (OneSignal cấm trộn targeting).
 */
const sendPushToPublishPublicAudienceImmediate = async ({ title, body, data }) => {
  if (!isOneSignalConfigured()) return;

  const heading = normalizeText(title) || "Thông báo mới";
  const content = normalizeText(body) || "Bạn có một thông báo mới.";

  const payload = {
    app_id: oneSignalConfig.appId,
    target_channel: "push",
    filters: [
      { field: "tag", key: "publish_public", relation: "=", value: "true" },
      { field: "tag", key: "app", relation: "=", value: "inktrail" },
    ],
    headings: { en: heading, vi: heading },
    contents: { en: content, vi: content },
    data: data && typeof data === "object" ? data : {},
  };

  const response = await fetch(oneSignalConfig.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${oneSignalConfig.restApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `OneSignal publish-public push failed (${response.status}): ${raw || "unknown error"}`,
    );
  }
};

const sendPushToPublishPublicAudience = async (args) => {
  if (!isOneSignalConfigured()) return;
  return enqueueOneSignalJob(() => sendPushToPublishPublicAudienceImmediate(args));
};

module.exports = {
  isOneSignalConfigured,
  sendPushToUser,
  sendPushToPublishPublicAudience,
};
