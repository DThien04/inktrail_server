const { evaluateRules } = require("../../core/rules/rule-engine");

const normalizeForKeywordMatch = (value, normalizeText) =>
  normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Base list only. Add/remove keywords here as your policy evolves.
const STORY_SENSITIVE_KEYWORDS = [
  "hiep dam",
  "au dam",
  "am sat",
  "tu sat",
  "cat co",
  "giet nguoi",
  "hanh ha",
  "tra tan",
];

const STORY_PUBLISH_RULES = [
  {
    code: "MISSING_TAG_OR_GENRE",
    message: "Truyen can it nhat 1 the loai hoac 1 tag truoc khi xuat ban",
    severity: "hard",
    validate: ({ genreCount = 0, tagCount = 0 }) => genreCount > 0 || tagCount > 0,
  },
  {
    code: "SENSITIVE_CONTENT_KEYWORD",
    message: "Noi dung co tu ngu nhay cam/bao luc, khong the xuat ban",
    severity: "hard",
    validate: ({ title, description, normalizeText }) => {
      const titleText = normalizeForKeywordMatch(title, normalizeText);
      const descriptionText = normalizeForKeywordMatch(description, normalizeText);
      const haystack = `${titleText} ${descriptionText}`.trim();
      return !STORY_SENSITIVE_KEYWORDS.some((keyword) => haystack.includes(keyword));
    },
  },
];

const evaluateStoryPublishRules = ({
  title,
  description,
  genreCount,
  tagCount,
  normalizeText,
}) => {
  return evaluateRules({
    rules: STORY_PUBLISH_RULES,
    context: {
    title,
    description,
    genreCount,
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
