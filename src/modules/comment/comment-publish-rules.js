const { evaluateRules } = require("../../core/rules/rule-engine");
const {
  SENSITIVE_KEYWORD_PHRASES,
} = require("../../core/rules/sensitive-keyword-phrases");

/**
 * Rule khi người dùng đăng bình luận (đối xứng: story → story-publish-rules.js).
 * Danh sách từ khóa nhạy cảm dùng chung `sensitive-keyword-phrases.js` với xuất bản truyện.
 */

const normalizeCommentTextForKeywordMatch = (value, normalizeText) =>
  normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const COMMENT_SENSITIVE_KEYWORDS = SENSITIVE_KEYWORD_PHRASES;

const hasSuspiciousUrl = (text) =>
  /\bhttps?:\/\//i.test(text) || /\bwww\.\S+/i.test(text);

const hasPhoneLike = (text) => {
  const compact = String(text ?? "").replace(/[\s\-.()]/g, "");
  return /(?:\+84|84|0)(?:3|5|7|8|9)\d{8,}/.test(compact);
};

const hasExcessiveCharRepetition = (text) => {
  const t = String(text ?? "");
  return /([\p{L}\d])\1{7,}/u.test(t);
};

const COMMENT_PROFANITY_PHRASES = [
  // Common profanity / insults (normalized form)
  "d c m",
  "nhu lon",
  "nhu cac",
  "nhu cut",
  "nhu buoi",
  "do khon nan",
  "vai lon",
  "vai cac",
  "vai cut",
  "vai buoi",
  "dm",
  "dmm",
  "dcm",
  "d m",
  "d m m",
  "dclm",
  "dit me",
  "dit con me",
  "dit bo",
  "dit ba",
  "dit cha",
  "dit me may",
  "du me",
  "lon me",
  "con cac",
  "oc cho",
  "ngu lon",
  "vcl",
  "vl",
  "me may",
  "may bi dien",
  "do ngu",
  "chet me",
  "cho chet",
];

const hasProfanity = ({ content, normalizeText }) => {
  const normalized = ` ${normalizeCommentTextForKeywordMatch(
    content,
    normalizeText,
  )} `;
  return COMMENT_PROFANITY_PHRASES.some((phrase) =>
    normalized.includes(` ${phrase} `),
  );
};

const COMMENT_PUBLISH_RULES = [
  {
    code: "COMMENT_SUSPICIOUS_URL",
    message:
      "Bình luận không được chứa liên kết trang web. Bạn vui lòng gỡ link khỏi nội dung.",
    severity: "hard",
    validate: ({ content }) => !hasSuspiciousUrl(content),
  },
  {
    code: "COMMENT_PHONE_LIKE",
    message:
      "Bình luận có dạng số điện thoại hoặc mã liên hệ không phù hợp. Bạn vui lòng chỉnh sửa.",
    severity: "hard",
    validate: ({ content }) => !hasPhoneLike(content),
  },
  {
    code: "COMMENT_EXCESSIVE_REPETITION",
    message:
      "Bình luận có ký tự lặp lại quá nhiều lần. Bạn vui lòng viết rõ ràng hơn.",
    severity: "hard",
    validate: ({ content }) => !hasExcessiveCharRepetition(content),
  },
  {
    code: "COMMENT_PROFANITY",
    message: "Bình luận có ngôn từ tục tĩu hoặc công kích. Bạn vui lòng chỉnh sửa.",
    severity: "hard",
    validate: ({ content, normalizeText }) =>
      !hasProfanity({ content, normalizeText }),
  },
  {
    code: "COMMENT_SENSITIVE_KEYWORD",
    message:
      "Phát hiện từ ngữ nhạy cảm hoặc không phù hợp; bạn vui lòng chỉnh sửa bình luận.",
    severity: "hard",
    validate: ({ content, normalizeText }) => {
      const haystack = normalizeCommentTextForKeywordMatch(
        content,
        normalizeText,
      );
      return !COMMENT_SENSITIVE_KEYWORDS.some((keyword) =>
        haystack.includes(keyword),
      );
    },
  },
];

const evaluateCommentPublishRules = ({ content, normalizeText }) =>
  evaluateRules({
    rules: COMMENT_PUBLISH_RULES,
    context: { content, normalizeText },
  });

module.exports = {
  COMMENT_PUBLISH_RULES,
  COMMENT_SENSITIVE_KEYWORDS,
  evaluateCommentPublishRules,
};
