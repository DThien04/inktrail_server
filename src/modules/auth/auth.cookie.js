const { web } = require("../../config/jwt");

const isWebClient = (req) =>
  String(req.headers["x-client-platform"] || "").trim().toLowerCase() === "web";

const getRefreshTokenFromCookie = (req) => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((item) => item.trim());
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === web.refreshCookieName) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
};

const buildCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie(web.refreshCookieName, refreshToken, buildCookieOptions());
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie(web.refreshCookieName, buildCookieOptions());
};

module.exports = {
  isWebClient,
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};
