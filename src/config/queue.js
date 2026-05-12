/**
 * Wrapper khởi tạo Redis + BullMQ.
 *
 * - Nếu `REDIS_URL` không được cấu hình, `createQueue` trả về `null` và caller
 *   được khuyến nghị fallback chạy đồng bộ. Worker process sẽ refuse khởi động.
 * - Mọi queue/worker chia sẻ một IORedis connection để tiết kiệm command.
 */
const IORedis = require("ioredis");
const { Queue, Worker } = require("bullmq");
const { buildRedisOptions } = require("./redis-options");

const redisUrl = process.env.REDIS_URL;

let cachedConnection = null;

const isQueueEnabled = () => Boolean(redisUrl);

const getRedisConnection = () => {
  if (!redisUrl) return null;
  if (cachedConnection) return cachedConnection;

  cachedConnection = new IORedis(
    redisUrl,
    buildRedisOptions(redisUrl, {
      // BullMQ bắt buộc: workers/queues phải không retry vô hạn ở tầng ioredis.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    }),
  );

  cachedConnection.on("error", (error) => {
    console.error("[redis:error]", error?.message || error);
  });

  return cachedConnection;
};

const createQueue = (name, options = {}) => {
  const connection = getRedisConnection();
  if (!connection) return null;
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      ...(options.defaultJobOptions || {}),
    },
  });
};

const createWorker = (name, processor, options = {}) => {
  const connection = getRedisConnection();
  if (!connection) {
    throw new Error(
      "REDIS_URL chưa cấu hình - không khởi tạo được worker BullMQ.",
    );
  }
  return new Worker(name, processor, {
    connection,
    concurrency: 5,
    ...options,
  });
};

const closeRedisConnection = async () => {
  if (!cachedConnection) return;
  try {
    await cachedConnection.quit();
  } catch (error) {
    console.error("[redis:close-error]", error?.message || error);
  } finally {
    cachedConnection = null;
  }
};

module.exports = {
  isQueueEnabled,
  getRedisConnection,
  createQueue,
  createWorker,
  closeRedisConnection,
};
