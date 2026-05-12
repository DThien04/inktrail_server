const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const IORedis = require("ioredis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { jwt: jwtConfig, web } = require("../config/jwt");
const { buildRedisOptions } = require("../config/redis-options");

let ioInstance = null;
let pubClient = null;
let subClient = null;
const PUBLIC_ADMIN_BROADCAST_ROOM = "public:admin-broadcasts";

/**
 * Tạo Redis pub/sub adapter cho socket.io.
 *
 * Trả về `null` nếu `REDIS_URL` chưa cấu hình - khi đó socket.io chạy ở chế
 * độ single-process (chỉ emit được trong API server). Worker process emit
 * sẽ silent skip - chấp nhận miss realtime cho dev local không có Redis.
 */
const buildRedisAdapter = () => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (!pubClient) {
    // SUBSCRIBE / PSUBSCRIBE là lệnh blocking dài hạn - phải tắt giới hạn
    // retry mặc định (20) để không crash khi connection chập chờn.
    const options = buildRedisOptions(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    pubClient = new IORedis(redisUrl, options);
    subClient = pubClient.duplicate();

    pubClient.on("error", (error) => {
      console.error("[socket-redis-pub:error]", error?.message || error);
    });
    subClient.on("error", (error) => {
      console.error("[socket-redis-sub:error]", error?.message || error);
    });
  }

  return createAdapter(pubClient, subClient);
};

const getTokenFromSocket = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim().replace(/^Bearer\s+/i, "");
  }

  const authorizationHeader = socket.handshake.headers?.authorization;
  if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  return null;
};

const initializeSocket = (server) => {
  ioInstance = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin === web.adminOrigin) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed"));
      },
      credentials: true,
    },
  });

  const adapter = buildRedisAdapter();
  if (adapter) {
    ioInstance.adapter(adapter);
    console.log("[socket] Redis adapter đã gắn (multi-process emit OK).");
  } else {
    console.warn(
      "[socket] REDIS_URL chưa cấu hình - chạy ở chế độ single-process, worker emit sẽ không tới client.",
    );
  }

  ioInstance.use((socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) {
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(token, jwtConfig.accessSecret);
      socket.user = decoded;
      return next();
    } catch (_err) {
      return next(new Error("Unauthorized"));
    }
  });

  ioInstance.on("connection", (socket) => {
    const userId = socket.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }
    socket.join(PUBLIC_ADMIN_BROADCAST_ROOM);

    socket.on("comments:subscribe-story", (payload = {}) => {
      const storyId = String(payload.story_id || "").trim();
      if (!storyId) return;
      socket.join(`story:${storyId}:comments`);
    });

    socket.on("comments:unsubscribe-story", (payload = {}) => {
      const storyId = String(payload.story_id || "").trim();
      if (!storyId) return;
      socket.leave(`story:${storyId}:comments`);
    });

    socket.on("comments:subscribe-chapter", (payload = {}) => {
      const chapterId = String(payload.chapter_id || "").trim();
      if (!chapterId) return;
      socket.join(`chapter:${chapterId}:comments`);
    });

    socket.on("comments:unsubscribe-chapter", (payload = {}) => {
      const chapterId = String(payload.chapter_id || "").trim();
      if (!chapterId) return;
      socket.leave(`chapter:${chapterId}:comments`);
    });
  });

  return ioInstance;
};

const emitNotificationToUser = (userId, payload) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit("notification:new", payload);
};

const emitAdminBroadcastPublic = (payload) => {
  if (!ioInstance) return;
  ioInstance.to(PUBLIC_ADMIN_BROADCAST_ROOM).emit("admin-broadcast:new", payload);
};

const emitChapterComment = (chapterId, payload) => {
  if (!ioInstance || !chapterId) return;
  ioInstance.to(`chapter:${chapterId}:comments`).emit("chapter-comment:new", payload);
};

const emitChapterCommentRemoved = (chapterId, payload) => {
  if (!ioInstance || !chapterId) return;
  ioInstance
    .to(`chapter:${chapterId}:comments`)
    .emit("chapter-comment:removed", payload);
  const userId = String(payload?.user_id || "").trim();
  if (userId) {
    ioInstance.to(`user:${userId}`).emit("chapter-comment:removed", payload);
  }
};

/**
 * Khởi tạo io instance ở chế độ "emit-only" cho worker process.
 *
 * Không attach HTTP server, không listen, không nhận connection. Chỉ dùng để
 * emit qua Redis adapter → mọi API server đang chạy nhận pub/sub event và
 * forward tới client thật.
 */
const initializeEmitterIo = () => {
  if (ioInstance) return ioInstance;

  const adapter = buildRedisAdapter();
  if (!adapter) {
    console.warn(
      "[socket-emitter] REDIS_URL chưa cấu hình - worker sẽ không emit được realtime.",
    );
    return null;
  }

  ioInstance = new Server();
  ioInstance.adapter(adapter);
  console.log("[socket-emitter] Emit-only io khởi tạo xong (qua Redis adapter).");
  return ioInstance;
};

const closeSocketRedis = async () => {
  const tasks = [];
  if (pubClient) tasks.push(pubClient.quit().catch(() => null));
  if (subClient) tasks.push(subClient.quit().catch(() => null));
  await Promise.all(tasks);
  pubClient = null;
  subClient = null;
};

module.exports = {
  initializeSocket,
  initializeEmitterIo,
  closeSocketRedis,
  emitNotificationToUser,
  emitAdminBroadcastPublic,
  emitChapterComment,
  emitChapterCommentRemoved,
};
