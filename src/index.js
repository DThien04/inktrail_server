const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { port } = require("./config/jwt");

const routes = require("./routes/index");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: "*", // dev thoải mái, production thay bằng domain cụ thể
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use("/api", routes);

app.get("/api/health", (_, res) => res.json({ status: "ok" }));

app.use((_, res) => {
  res.status(404).json({ message: "Route không tồn tại" });
});

app.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "File quá lớn, vui lòng chọn file nhỏ hơn 10MB" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn" });
  }
  console.error(err.stack);
  res.status(500).json({ message: "Lỗi server" });
});

app.listen(port, () => {
  console.log(`🚀 Inktrail API running on port ${port}`);
});
