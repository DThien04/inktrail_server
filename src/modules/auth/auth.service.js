const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../../config/prisma");
const { jwt: jwtConfig } = require("../../config/jwt");
const { randomUUID } = require("crypto");
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    display_name: user.displayName,
    role: user.role,
  };

  const accessToken = jwt.sign(
    { ...payload, jti: randomUUID() },
    jwtConfig.accessSecret,
    { expiresIn: jwtConfig.accessExpires },
  );

  const refreshToken = jwt.sign(
    { ...payload, jti: randomUUID() },
    jwtConfig.refreshSecret,
    { expiresIn: jwtConfig.refreshExpires },
  );

  return { accessToken, refreshToken };
};

const saveRefreshToken = async (userId, token) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });
};

const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  display_name: user.displayName,
  avatar_url: user.avatarUrl,
  bio: user.bio,
  role: user.role,
});

const register = async ({ email, password, displayName }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email đã được sử dụng");

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, password: hashedPassword, displayName },
  });

  const { accessToken, refreshToken } = generateTokens(user);
  await saveRefreshToken(user.id, refreshToken);

  return {
    user: formatUser(user),
    accessToken,
    refreshToken,
  };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Email hoặc mật khẩu không đúng");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Email hoặc mật khẩu không đúng");

  const { accessToken, refreshToken } = generateTokens(user);
  await saveRefreshToken(user.id, refreshToken);

  return {
    user: formatUser(user),
    accessToken,
    refreshToken,
  };
};

const refresh = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, jwtConfig.refreshSecret);
  } catch {
    throw new Error("Refresh token không hợp lệ");
  }

  const stored = await prisma.refreshToken.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
  });
  if (!stored) throw new Error("Refresh token đã hết hạn");

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
  });
  if (!user) throw new Error("Người dùng không tồn tại");

  await prisma.refreshToken.delete({ where: { token } });
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
  await saveRefreshToken(user.id, newRefreshToken);

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
};

const logout = async (token) => {
  if (!token) return;
  await prisma.refreshToken.deleteMany({ where: { token } });
};

module.exports = { register, login, refresh, logout };
