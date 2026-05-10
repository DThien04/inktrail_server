require("dotenv").config();

module.exports = {
  port: process.env.PORT || 8080,
  databaseUrl: process.env.DATABASE_URL,
  web: {
    adminOrigin: process.env.ADMIN_WEB_ORIGIN || "http://localhost:3000",
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || "inktrail_refresh_token",
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  },
  oneSignal: {
    appId: process.env.ONESIGNAL_APP_ID || "",
    restApiKey: process.env.ONESIGNAL_REST_API_KEY || "",
    apiUrl:
      process.env.ONESIGNAL_API_URL ||
      "https://api.onesignal.com/notifications",
  },
};
