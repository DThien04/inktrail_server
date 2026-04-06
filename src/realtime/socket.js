const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { jwt: jwtConfig, web } = require("../config/jwt");

let ioInstance = null;

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

    socket.emit("notifications:connected", {
      user_id: userId,
      connected_at: new Date().toISOString(),
    });
  });

  return ioInstance;
};

const emitNotificationToUser = (userId, payload) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit("notification:new", payload);
};

const emitStoryComment = (storyId, payload) => {
  if (!ioInstance || !storyId) return;
  ioInstance.to(`story:${storyId}:comments`).emit("story-comment:new", payload);
};

const emitChapterComment = (chapterId, payload) => {
  if (!ioInstance || !chapterId) return;
  ioInstance.to(`chapter:${chapterId}:comments`).emit("chapter-comment:new", payload);
};

module.exports = {
  initializeSocket,
  emitNotificationToUser,
  emitStoryComment,
  emitChapterComment,
};
