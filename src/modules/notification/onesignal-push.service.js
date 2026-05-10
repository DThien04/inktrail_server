const { oneSignal } = require("../../config/jwt");

const normalizeText = (value) => String(value ?? "").trim();

const oneSignalConfig = {
  appId: normalizeText(oneSignal?.appId),
  restApiKey: normalizeText(oneSignal?.restApiKey),
  apiUrl: normalizeText(oneSignal?.apiUrl),
};

const isOneSignalConfigured = () =>
  Boolean(oneSignalConfig.appId && oneSignalConfig.restApiKey);

const sendPushToUser = async ({
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
    headings: { en: heading },
    contents: { en: content },
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

module.exports = {
  isOneSignalConfigured,
  sendPushToUser,
};
