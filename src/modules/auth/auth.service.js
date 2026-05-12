const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../../config/prisma");
const { jwt: jwtConfig } = require("../../config/jwt");
const { randomUUID } = require("crypto");
const { sendMail } = require("../../utils/mailer");
const { LockedError } = require("../../utils/error_handle");

const PASSWORD_RESET_OTP_TTL_MINUTES = 10;
const PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5;

const normalizeEmail = (email = "") => email.trim().toLowerCase();

const formatLockedUntilLabel = (date) => {
  if (!date) return "Vĩnh viễn";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "Vĩnh viễn";
  }
};

const buildLockedMessage = (user) => {
  const reason = user.lockedReason
    ? `: ${user.lockedReason}`
    : ".";
  const until = `Mở khóa: ${formatLockedUntilLabel(user.lockedUntil)}.`;
  return `Tài khoản đã bị khóa${reason} ${until}`;
};

const ensureUserNotLocked = async (user) => {
  if (!user?.isLocked) return user;
  const lockedUntil = user.lockedUntil ? new Date(user.lockedUntil) : null;
  if (lockedUntil && lockedUntil.getTime() <= Date.now()) {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        isLocked: false,
        lockedAt: null,
        lockedById: null,
        lockedReason: null,
        lockedUntil: null,
      },
    });
  }
  const pendingAppeal = await prisma.userLockAppeal.findFirst({
    where: { userId: user.id, status: "pending" },
    select: { id: true },
  });
  throw new LockedError(buildLockedMessage(user), {
    userId: user.id,
    lockedReason: user.lockedReason,
    lockedUntil: user.lockedUntil,
    hasPendingAppeal: Boolean(pendingAppeal),
  });
};

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const buildPasswordResetEmail = ({ otp, displayName }) => {
  const greetingName = displayName || "bạn";
  const text = [
    `Xin chào ${greetingName},`,
    "",
    `Mã OTP đặt lại mật khẩu InkTrail của bạn là: ${otp}`,
    `Mã có hiệu lực trong ${PASSWORD_RESET_OTP_TTL_MINUTES} phút.`,
    "",
    "Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2b2118">
      <h2 style="margin:0 0 12px">Đặt lại mật khẩu InkTrail</h2>
      <p>Xin chào ${greetingName},</p>
      <p>Mã OTP đặt lại mật khẩu của bạn là:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;color:#c97833">
        ${otp}
      </p>
      <p>Mã có hiệu lực trong ${PASSWORD_RESET_OTP_TTL_MINUTES} phút.</p>
      <p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
    </div>
  `;

  return { text, html };
};

const getActivePasswordResetOtp = async ({ email, userId }) =>
  prisma.passwordResetOtp.findFirst({
    where: {
      email,
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
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
  if (existing) throw new Error("Email này đã được đăng ký. Bạn có thể đăng nhập hoặc chọn email khác.");

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
  if (!user) throw new Error("Email hoặc mật khẩu chưa đúng.");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Email hoặc mật khẩu chưa đúng.");

  const activeUser = await ensureUserNotLocked(user);

  const { accessToken, refreshToken } = generateTokens(activeUser);
  await saveRefreshToken(activeUser.id, refreshToken);

  return {
    user: formatUser(activeUser),
    accessToken,
    refreshToken,
  };
};

const refresh = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, jwtConfig.refreshSecret);
  } catch {
    throw new Error("Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.");
  }

  const stored = await prisma.refreshToken.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
  });
  if (!stored) throw new Error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
  });
  if (!user) throw new Error("Tài khoản không còn tồn tại, vui lòng đăng nhập lại.");

  let activeUser;
  try {
    activeUser = await ensureUserNotLocked(user);
  } catch (err) {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    throw err;
  }

  await prisma.refreshToken.delete({ where: { token } });
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(activeUser);
  await saveRefreshToken(activeUser.id, newRefreshToken);

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
};

const logout = async (token) => {
  if (!token) return;
  await prisma.refreshToken.deleteMany({ where: { token } });
};

const forgotPassword = async (rawEmail) => {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("Vui lòng nhập email.");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { message: "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi tới hộp thư của bạn." };
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetOtp.updateMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  await prisma.passwordResetOtp.create({
    data: {
      userId: user.id,
      email: user.email,
      otpHash: hashOtp(otp),
      expiresAt,
    },
  });

  const { text, html } = buildPasswordResetEmail({
    otp,
    displayName: user.displayName,
  });

  await sendMail({
    to: user.email,
    subject: "InkTrail — Mã OTP đặt lại mật khẩu",
    text,
    html,
  });

  return { message: "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi tới hộp thư của bạn." };
};

const verifyResetOtp = async ({ email: rawEmail, otp }) => {
  const email = normalizeEmail(rawEmail);
  if (!email || !otp) throw new Error("Vui lòng nhập đủ email và mã OTP.");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Mã OTP chưa đúng hoặc đã hết hạn.");

  const record = await getActivePasswordResetOtp({
    email,
    userId: user.id,
  });

  if (!record) throw new Error("Mã OTP chưa đúng hoặc đã hết hạn.");
  if (record.attemptCount >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
    throw new Error("Bạn đã nhập sai OTP quá nhiều lần. Vui lòng yêu cầu gửi lại mã.");
  }

  const matched = record.otpHash === hashOtp(otp);
  if (!matched) {
    await prisma.passwordResetOtp.update({
      where: { id: record.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw new Error("Mã OTP chưa đúng, vui lòng thử lại.");
  }

  return {
    message: "OTP hợp lệ.",
    expires_at: record.expiresAt,
  };
};

const resetPassword = async ({ email: rawEmail, otp, newPassword }) => {
  const email = normalizeEmail(rawEmail);
  if (!email || !otp || !newPassword) {
    throw new Error("Vui lòng nhập đủ email, OTP và mật khẩu mới.");
  }
  if (newPassword.length < 6) {
    throw new Error("Mật khẩu mới cần ít nhất 6 ký tự.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Mã OTP chưa đúng hoặc đã hết hạn.");

  const record = await getActivePasswordResetOtp({
    email,
    userId: user.id,
  });

  if (!record) throw new Error("Mã OTP chưa đúng hoặc đã hết hạn.");
  if (record.attemptCount >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
    throw new Error("Bạn đã nhập sai OTP quá nhiều lần. Vui lòng yêu cầu gửi lại mã.");
  }

  const matched = record.otpHash === hashOtp(otp);
  if (!matched) {
    await prisma.passwordResetOtp.update({
      where: { id: record.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw new Error("Mã OTP chưa đúng, vui lòng thử lại.");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetOtp.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  return { message: "Đặt lại mật khẩu thành công." };
};

const MIN_APPEAL_LENGTH = 20;
const MAX_APPEAL_LENGTH = 1500;

const submitLockAppeal = async ({ email: rawEmail, password, reason }) => {
  const email = normalizeEmail(rawEmail);
  if (!email || !password) {
    throw new Error("Vui lòng nhập email và mật khẩu để gửi khiếu nại.");
  }
  const trimmedReason = String(reason ?? "").trim();
  if (trimmedReason.length < MIN_APPEAL_LENGTH) {
    throw new Error(
      `Vui lòng trình bày lý do khiếu nại ít nhất ${MIN_APPEAL_LENGTH} ký tự.`,
    );
  }
  if (trimmedReason.length > MAX_APPEAL_LENGTH) {
    throw new Error(
      `Nội dung khiếu nại tối đa ${MAX_APPEAL_LENGTH} ký tự.`,
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Email hoặc mật khẩu chưa đúng.");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Email hoặc mật khẩu chưa đúng.");

  if (!user.isLocked) {
    throw new Error("Tài khoản này hiện không bị khóa.");
  }

  const existingPending = await prisma.userLockAppeal.findFirst({
    where: { userId: user.id, status: "pending" },
    select: { id: true, submittedAt: true },
  });
  if (existingPending) {
    throw new Error(
      "Bạn đã gửi một khiếu nại đang chờ xử lý. Vui lòng đợi quản trị viên phản hồi.",
    );
  }

  const appeal = await prisma.userLockAppeal.create({
    data: {
      userId: user.id,
      reason: trimmedReason,
      status: "pending",
    },
    select: {
      id: true,
      status: true,
      submittedAt: true,
    },
  });

  return {
    appeal: {
      id: appeal.id,
      status: appeal.status,
      submitted_at: appeal.submittedAt,
    },
  };
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  submitLockAppeal,
};

