/**
 * Helper xây IORedis options từ một URL.
 *
 * - Nếu URL trỏ tới host của Upstash (`*.upstash.io`) hoặc dùng scheme
 *   `rediss://`, tự động bật TLS để tránh ECONNRESET do Upstash bắt buộc TLS
 *   trên port 6379 — kể cả khi người dùng vô tình paste `redis://` (1 s).
 * - Caller có thể merge thêm options BullMQ-specific (`maxRetriesPerRequest`,
 *   ...).
 */
const requiresTls = (urlString) => {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol === "rediss:") return true;
    if (/\.upstash\.io$/i.test(parsed.hostname || "")) return true;
    return false;
  } catch (_error) {
    return false;
  }
};

const buildRedisOptions = (url, overrides = {}) => {
  const options = { ...overrides };

  if (requiresTls(url) && !options.tls) {
    options.tls = {};
  }

  return options;
};

module.exports = {
  buildRedisOptions,
  requiresTls,
};
