const { handleError } = require("../../utils/error_handle");
const authService = require("./auth.service");
const {
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  isWebClient,
  setRefreshTokenCookie,
} = require("./auth.cookie");

const buildAuthResponse = ({ req, res, result, statusCode = 200 }) => {
  const webClient = isWebClient(req);

  if (webClient) {
    setRefreshTokenCookie(res, result.refreshToken);
  }

  const payload = {
    access_token: result.accessToken,
    user: result.user,
  };

  if (!webClient) {
    payload.refresh_token = result.refreshToken;
  }

  return res.status(statusCode).json(payload);
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin" });
    }

    const result = await authService.login({ email, password });
    return buildAuthResponse({ req, res, result });
  } catch (err) {
    handleError(err, res);
  }
};

const register = async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Mật khẩu tối thiểu 6 ký tự" });
    }

    const result = await authService.register({ email, password, displayName });
    return buildAuthResponse({ req, res, result, statusCode: 201 });
  } catch (err) {
    handleError(err, res);
  }
};

const refresh = async (req, res) => {
  try {
    const refreshToken =
      getRefreshTokenFromCookie(req) || req.body?.refresh_token || null;

    if (!refreshToken) {
      return res.status(400).json({ message: "Thiếu refresh token" });
    }

    const result = await authService.refresh(refreshToken);

    if (isWebClient(req)) {
      setRefreshTokenCookie(res, result.refreshToken);
      return res.json({ access_token: result.accessToken });
    }

    return res.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const logout = async (req, res) => {
  try {
    const refreshToken =
      getRefreshTokenFromCookie(req) || req.body?.refresh_token || null;

    await authService.logout(refreshToken);

    if (isWebClient(req)) {
      clearRefreshTokenCookie(res);
    }

    res.json({ message: "Đăng xuất thành công" });
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = { register, login, refresh, logout };
