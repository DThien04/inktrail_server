const { handleError } = require("../../utils/error_handle");
const authService = require("./auth.service");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng điền đầy đủ thông tin" });
    }
    const result = await authService.login({ email, password });
    res.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    handleError(err, res); // ← 1 dòng duy nhất
  }
};

const register = async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res
        .status(400)
        .json({ message: "Vui lòng điền đầy đủ thông tin" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Mật khẩu tối thiểu 6 ký tự" });
    }
    const result = await authService.register({ email, password, displayName });
    res.status(201).json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const refresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ message: "Thiếu refresh token" });
    }
    const result = await authService.refresh(refresh_token);
    res.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const logout = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    await authService.logout(refresh_token);
    res.json({ message: "Đăng xuất thành công" });
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = { register, login, refresh, logout };
