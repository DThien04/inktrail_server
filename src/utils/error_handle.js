class LockedError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "LockedError";
    this.statusCode = 423;
    this.code = "ACCOUNT_LOCKED";
    this.meta = meta;
  }
}

const handleError = (err, res) => {
  // Custom locked error
  if (err instanceof LockedError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      locked_reason: err.meta?.lockedReason ?? null,
      locked_until: err.meta?.lockedUntil ?? null,
      user_id: err.meta?.userId ?? null,
      has_pending_appeal: err.meta?.hasPendingAppeal ?? false,
    });
  }

  // Prisma errors
  if (err.code && typeof err.code === "string" && err.code.startsWith("P")) {
    switch (err.code) {
      case "P1001": // Can't reach database
      case "P1002": // Timeout
      case "P1008": // Operations timed out
        return res
          .status(503)
          .json({ message: "Database temporarily unavailable. Please try again." });
      case "P2002": // Unique constraint
        return res.status(400).json({ message: "Thông tin này đã được sử dụng rồi." });
      case "P2025": // Record not found
        return res.status(404).json({ message: "Không tìm thấy nội dung bạn cần." });
      default:
        return res
          .status(500)
          .json({ message: "Database error. Please try again later." });
    }
  }

  // Business logic errors (throw new Error('...') trong service)
  if (err.message) {
    return res.status(400).json({ message: err.message });
  }

  // Unknown
  return res.status(500).json({ message: "Internal server error. Please try again later." });
};

module.exports = { handleError, LockedError };
