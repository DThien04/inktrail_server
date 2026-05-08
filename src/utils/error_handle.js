const handleError = (err, res) => {
  // Prisma errors
  if (err.code) {
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

module.exports = { handleError };
