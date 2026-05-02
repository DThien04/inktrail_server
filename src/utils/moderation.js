const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_COMMENT_MODEL =
  process.env.GEMINI_COMMENT_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash-lite";
const DEFAULT_MODERATION_TIMEOUT_MS = Number.parseInt(
  process.env.GEMINI_MODERATION_TIMEOUT_MS || "3500",
  10,
);
const MODERATION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    flagged: { type: "boolean" },
    categories: {
      type: "array",
      items: {
        type: "string",
        enum: ["harassment", "hate", "sexual", "violence", "self_harm", "spam"],
      },
    },
    confidence: { type: "number" },
    severity: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    reason: { type: "string" },
  },
  required: ["flagged", "categories", "confidence"],
};

const CATEGORY_KEYWORDS = {
  harassment: ["quấy rối", "lăng mạ", "xúc phạm", "đe dọa"],
  hate: ["thù ghét", "phân biệt", "miệt thị"],
  sexual: ["tình dục", "gợi dục", "18+"],
  violence: ["bạo lực", "đe dọa giết", "tấn công", "đánh nhau"],
  self_harm: ["tự hại", "tự tử", "rạch tay"],
  spam: ["spam", "lặp lại", "quảng cáo rác"],
};

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return apiKey;
}

function buildPrompt(input) {
  return [
    "Bạn là hệ thống kiểm duyệt nội dung cho ứng dụng đọc truyện.",
    "Hãy đánh giá đoạn văn bản dưới đây có dấu hiệu vi phạm hay không.",
    "Chỉ trả về JSON hợp lệ, không thêm markdown, không thêm giải thích.",
    'Schema JSON: {"flagged": boolean, "categories": string[], "confidence": number, "severity": "low"|"medium"|"high"|"critical", "reason": string}',
    "Quy tắc phân loại:",
    "- harassment: quấy rối, xúc phạm, đe dọa cá nhân",
    "- hate: thù ghét, miệt thị nhóm người",
    "- sexual: nội dung gợi dục, tình dục phản cảm",
    "- violence: bạo lực, kích động tấn công",
    "- self_harm: tự hại, tự tử",
    "- spam: rác, lặp nội dung, quảng cáo",
    "- Nếu không có dấu hiệu rõ ràng thì flagged=false, categories=[]",
    `Nội dung cần đánh giá: """${String(input)}"""`,
  ].join("\n");
}

function buildCommentPrompt(input) {
  return [
    "Moderate this Vietnamese comment for a reading app.",
    "Return exactly one valid JSON object only. The first character must be { and the last character must be }.",
    "Do not include markdown, prose, or lead-in text such as 'Here is'.",
    'Schema: {"flagged": boolean, "categories": string[], "confidence": number, "severity": "low"|"medium"|"high"|"critical", "reason": string}',
    "Allowed categories: harassment, hate, sexual, violence, self_harm, spam.",
    "If uncertain or harmless, flagged=false and categories=[].",
    `Comment: """${String(input)}"""`,
  ].join("\n");
}

function buildThinkingConfig(model) {
  const normalizedModel = String(model || "").toLowerCase();
  if (normalizedModel.startsWith("gemini-3")) {
    return { thinkingLevel: "minimal" };
  }
  if (normalizedModel.startsWith("gemini-2.5")) {
    return { thinkingBudget: 0 };
  }
  return undefined;
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error(`Gemini moderation returned non-JSON output: ${trimmed}`);
  }

  return JSON.parse(match[0]);
}

function normalizeCategories(categories = []) {
  return Array.from(
    new Set(
      categories
        .filter((value) => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function fallbackCategoryScores(categories = [], confidence = 0) {
  const normalizedConfidence =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0;

  return categories.reduce((scores, category) => {
    scores[category] = normalizedConfidence;
    return scores;
  }, {});
}

function mapModerationSeverity(score) {
  if (score >= 0.85) return "critical";
  if (score >= 0.6) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

function enrichCategoriesFromReason(categories, reason) {
  const normalizedReason = String(reason || "").toLowerCase();
  const merged = new Set(categories);

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalizedReason.includes(keyword))) {
      merged.add(category);
    }
  }

  return Array.from(merged);
}

async function moderateText(input, options = {}) {
  if (!input || !String(input).trim()) {
    return {
      flagged: false,
      categories: [],
      categoryScores: {},
      maxScore: 0,
      severity: "low",
      reason: "",
      raw: null,
    };
  }

  const timeoutMs =
    Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_MODERATION_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const model = options.model || GEMINI_MODEL;
  const prompt = options.prompt || buildPrompt(input);
  const thinkingConfig = buildThinkingConfig(model);
  const maxOutputTokens =
    Number.isInteger(options.maxOutputTokens) && options.maxOutputTokens > 0
      ? options.maxOutputTokens
      : 180;

  let response;
  const startedAt = Date.now();
  try {
    response = await fetch(
      `${GEMINI_API_URL}/${model}:generateContent?key=${getGeminiApiKey()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: MODERATION_RESPONSE_SCHEMA,
            ...(thinkingConfig ? { thinkingConfig } : {}),
            maxOutputTokens,
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        }),
      },
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Gemini moderation timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini moderation failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("\n") || "";

  const parsed = extractJson(text);
  const baseCategories = normalizeCategories(parsed?.categories);
  const categories = enrichCategoriesFromReason(baseCategories, parsed?.reason);
  const confidence =
    typeof parsed?.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
  const categoryScores = fallbackCategoryScores(categories, confidence);
  const maxScore = confidence;
  const severity =
    typeof parsed?.severity === "string" && parsed.severity
      ? parsed.severity
      : mapModerationSeverity(maxScore);

  return {
    flagged: Boolean(parsed?.flagged),
    categories,
    categoryScores,
    maxScore,
    severity,
    reason: String(parsed?.reason || ""),
    durationMs: Date.now() - startedAt,
    raw: payload,
  };
}

async function moderateCommentText(input, options = {}) {
  const result = await moderateText(input, {
    ...options,
    model: options.model || GEMINI_COMMENT_MODEL,
    prompt: buildCommentPrompt(input),
    maxOutputTokens: 1024,
  });

  return {
    ...result,
    reason: "",
  };
}

module.exports = {
  moderateCommentText,
  moderateText,
  mapModerationSeverity,
};
