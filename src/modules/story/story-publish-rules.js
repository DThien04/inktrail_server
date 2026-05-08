const { evaluateRules } = require("../../core/rules/rule-engine");
const {
  SENSITIVE_KEYWORD_PHRASES,
} = require("../../core/rules/sensitive-keyword-phrases");

const TITLE_MIN_LEN = 3;
const DESCRIPTION_MIN_LEN = 25;
const TITLE_REPEAT_THRESHOLD = 8;

const normalizeForKeywordMatch = (value, normalizeText) =>
  normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STORY_SENSITIVE_KEYWORDS = SENSITIVE_KEYWORD_PHRASES;

const STORY_PROFANITY_PHRASES = [
  // Core profanity / insults (normalized - no diacritics, punctuation removed)
  "d c m",
  "dcm",
  "d m",
  "dm",
  "d m m",
  "dmm",
  "dit me",
  "ditme",
  "du me",
  "dume",
  "lon me",
  "lonme",
  "con cac",
  "concac",
  "cac",
  "buoi",
  "chim",
  "loz",
  "lol",
  "vcl",
  "vl",
  "vai lon",
  "vai lon luon",
  "oc cho",
  "occho",
  "ngu lon",
  "ngulon",
  "cho chet",
  "chet me",
];

const hasSuspiciousUrlInTitle = (title) =>
  /\bhttps?:\/\//i.test(title) || /\bwww\.\S+/i.test(title);

const hasSuspiciousUrlInText = (text) =>
  /\bhttps?:\/\//i.test(text) || /\bwww\.\S+/i.test(text);

const hasPhoneLikeInTitle = (title) => {
  const compact = String(title ?? "").replace(/[\s\-.()]/g, "");
  return /(?:\+84|84|0)(?:3|5|7|8|9)\d{8,}/.test(compact);
};

const hasPhoneLikeInText = (text) => {
  const compact = String(text ?? "").replace(/[\s\-.()]/g, "");
  return /(?:\+84|84|0)(?:3|5|7|8|9)\d{8,}/.test(compact);
};

const hasExcessiveCharRepetition = (title) => {
  const t = String(title ?? "");
  return /([\p{L}\d])\1{7,}/u.test(t);
};

const hasExcessiveCharRepetitionInText = (text) => {
  const t = String(text ?? "");
  return /([\p{L}\d])\1{7,}/u.test(t);
};

const STORY_PUBLISH_RULES = [
  {
    code: "TITLE_TOO_SHORT",
    message:
      "Tiêu đề xuất bản cần rõ ràng (ít nhất vài ký tự). Bạn vui lòng bổ sung tiêu đề.",
    severity: "hard",
    validate: ({ title, normalizeText }) =>
      normalizeText(title).length >= TITLE_MIN_LEN,
  },
  {
    code: "TITLE_SUSPICIOUS_URL",
    message:
      "Tiêu đề không nên chứa liên kết trang web. Bạn vui lòng gỡ link khỏi tiêu đề.",
    severity: "hard",
    validate: ({ title }) => !hasSuspiciousUrlInTitle(title),
  },
  {
    code: "TITLE_PHONE_LIKE",
    message:
      "Tiêu đề có dạng số điện thoại hoặc mã liên hệ không phù hợp. Bạn vui lòng chỉnh sửa.",
    severity: "hard",
    validate: ({ title }) => !hasPhoneLikeInTitle(title),
  },
  {
    code: "TITLE_EXCESSIVE_REPETITION",
    message:
      "Tiêu đề có ký tự lặp lại quá nhiều lần. Bạn vui lòng viết tiêu đề rõ ràng hơn.",
    severity: "hard",
    validate: ({ title }) => !hasExcessiveCharRepetition(title),
  },
  {
    code: "TEXT_SUSPICIOUS_URL",
    message:
      "Truyện không nên chứa liên kết (URL) trong tiêu đề hoặc mô tả. Bạn vui lòng gỡ link trước khi xuất bản.",
    severity: "hard",
    validate: ({ title, description }) =>
      !hasSuspiciousUrlInText(title) && !hasSuspiciousUrlInText(description),
  },
  {
    code: "TEXT_PHONE_LIKE",
    message:
      "Truyện có nội dung giống số điện thoại hoặc mã liên hệ trong tiêu đề/mô tả. Bạn vui lòng chỉnh sửa trước khi xuất bản.",
    severity: "hard",
    validate: ({ title, description }) =>
      !hasPhoneLikeInText(title) && !hasPhoneLikeInText(description),
  },
  {
    code: "TEXT_EXCESSIVE_REPETITION",
    message:
      "Tiêu đề hoặc mô tả có ký tự lặp lại quá nhiều lần. Bạn vui lòng chỉnh sửa để nội dung dễ đọc hơn.",
    severity: "hard",
    validate: ({ title, description }) =>
      !hasExcessiveCharRepetitionInText(title) &&
      !hasExcessiveCharRepetitionInText(description),
  },
  {
    code: "DESCRIPTION_TOO_SHORT",
    message:
      "Truyện xuất bản nên có mô tả giới thiệu đủ ý (vài câu). Bạn vui lòng bổ sung phần mô tả.",
    severity: "hard",
    validate: ({ description, normalizeText }) =>
      normalizeText(description).length >= DESCRIPTION_MIN_LEN,
  },
  {
    code: "MISSING_TAG",
    message:
      "Truyện cần ít nhất một tag trước khi xuất bản.",
    severity: "hard",
    validate: ({ tagCount = 0 }) => tagCount > 0,
  },
  {
    code: "SENSITIVE_CONTENT_KEYWORD",
    message:
      "Phát hiện từ ngữ nhạy cảm hoặc không phù hợp trong tiêu đề/mô tả; bạn vui lòng chỉnh sửa trước khi xuất bản.",
    severity: "hard",
    validate: ({ title, description, normalizeText }) => {
      const titleText = normalizeForKeywordMatch(title, normalizeText);
      const descriptionText = normalizeForKeywordMatch(description, normalizeText);
      const haystack = `${titleText} ${descriptionText}`.trim();
      return !STORY_SENSITIVE_KEYWORDS.some((keyword) =>
        haystack.includes(keyword),
      );
    },
  },
  {
    code: "PROFANITY",
    message:
      "Phát hiện từ ngữ tục tĩu/công kích trong tiêu đề hoặc mô tả; bạn vui lòng chỉnh sửa trước khi xuất bản.",
    severity: "hard",
    validate: ({ title, description, normalizeText }) => {
      const titleText = normalizeForKeywordMatch(title, normalizeText);
      const descriptionText = normalizeForKeywordMatch(description, normalizeText);
      const haystack = `${titleText} ${descriptionText}`.trim();
      return !STORY_PROFANITY_PHRASES.some((phrase) => haystack.includes(phrase));
    },
  },
];

const evaluateStoryPublishRules = ({
  title,
  description,
  tagCount,
  normalizeText,
}) => {
  return evaluateRules({
    rules: STORY_PUBLISH_RULES,
    context: {
      title,
      description,
      tagCount,
      normalizeText,
    },
  });
};

module.exports = {
  STORY_PUBLISH_RULES,
  STORY_SENSITIVE_KEYWORDS,
  evaluateStoryPublishRules,
};
