const handleError = (err, res) => {
  // Prisma errors
  if (err.code) {
    switch (err.code) {
      case "P1001": // Can't reach database
      case "P1002": // Timeout
      case "P1008": // Operations timed out
        return res
          .status(503)
          .json({ message: "Lỗi kết nối, vui lòng thử lại sau" });
      case "P2002": // Unique constraint
        return res.status(400).json({ message: "Dữ liệu đã tồn tại" });
      case "P2025": // Record not found
        return res.status(404).json({ message: "Không tìm thấy dữ liệu" });
      default:
        return res
          .status(500)
          .json({ message: "Lỗi server, vui lòng thử lại sau" });
    }
  }

  // Business logic errors (throw new Error('...') trong service)
  if (err.message) {
    return res.status(400).json({ message: err.message });
  }

  // Unknown
  return res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau" });
};

module.exports = { handleError };
