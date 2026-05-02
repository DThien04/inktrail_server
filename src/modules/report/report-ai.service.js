const prisma = require("../../config/prisma");
const {
  calculateReportCaseRisk,
  deriveReportCasePriority,
} = require("./report-case-scoring");

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_REPORT_MODEL =
  process.env.GEMINI_REPORT_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash-lite";

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return apiKey;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function extractJson(text) {
  const match = String(text || "").trim().match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Gemini report AI returned non-JSON output: ${text}`);
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

function normalizeConfidence(confidence) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

function normalizeSeverity(severity) {
  const normalized = normalizeText(severity).toLowerCase();
  if (["low", "medium", "high", "critical"].includes(normalized)) {
    return normalized;
  }
  return "low";
}

function normalizeSuggestedAction(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (
    ["allow", "review", "review_soon", "review_urgent", "remove_candidate"].includes(
      normalized,
    )
  ) {
    return normalized;
  }
  return "review";
}

function normalizeAppealRecommendation(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (["accept", "reject", "review"].includes(normalized)) {
    return normalized;
  }
  return "review";
}

function buildAiFallbackMessage(errorMessage) {
  const message = normalizeText(errorMessage).toLowerCase();
  if (message.includes(" 429 ") || message.includes("quota")) {
    return "AI đang tạm quá tải, chưa thể trả kết quả lúc này.";
  }
  if (message.includes("api key") || message.includes("not configured")) {
    return "AI chưa được cấu hình đầy đủ trên hệ thống.";
  }
  return "AI tạm thời chưa thể trả kết quả.";
}

function buildReportLines(reports = []) {
  return reports
    .slice(0, 10)
    .map((report, index) => {
      const description = normalizeText(report.description) || "No description";
      return `${index + 1}. reason=${report.reason}; description=${description}`;
    })
    .join("\n");
}

function buildSharedCasePromptLines(reportCase, targetLabel) {
  return [
    "You are an AI assistant for a story-reading platform moderation dashboard.",
    `Analyze this reported ${targetLabel} case and return only valid JSON.`,
    'Schema: {"flagged": boolean, "categories": string[], "severity": "low"|"medium"|"high"|"critical", "confidence": number, "summary": string, "suggested_action": "allow"|"review"|"review_soon"|"review_urgent"|"remove_candidate"}',
    "Use categories only from this set: harassment, hate, sexual, violence, self_harm, spam, copyright, misleading, other.",
    "Keep categories, severity, and suggested_action exactly in the allowed English enum values.",
    "Write summary in natural Vietnamese for Vietnamese admins. Do not write the summary in English.",
    "The summary must be concise, practical, and based on the content and reports.",
    `Current case stats: reports=${reportCase.reportCount}, unique_reporters=${reportCase.uniqueReporterCount}, reopened_count=${reportCase.reopenedCount}`,
  ];
}

function buildStoryCasePrompt(reportCase) {
  const firstReport = reportCase.storyReports[0];
  const story = firstReport?.story;
  const author = story?.author;
  const genres = Array.isArray(story?.storyGenres)
    ? story.storyGenres
        .map((item) => item.genre?.name)
        .filter(Boolean)
        .join(", ")
    : "";
  const reportLines = buildReportLines(reportCase.storyReports);

  return [
    ...buildSharedCasePromptLines(reportCase, "story"),
    `Story title: ${normalizeText(story?.title) || "Unknown"}`,
    `Author: ${normalizeText(author?.displayName || author?.email) || "Unknown"}`,
    `Genres: ${genres || "Unknown"}`,
    `Story status: ${normalizeText(story?.status) || "Unknown"}; hidden=${Boolean(story?.isHidden)}`,
    `Story description: """${normalizeText(story?.description).slice(0, 2000)}"""`,
    "User reports:",
    reportLines || "No reports",
  ].join("\n");
}

function buildChapterCasePrompt(reportCase) {
  const firstReport = reportCase.chapterReports[0];
  const chapter = firstReport?.chapter;
  const story = chapter?.story;
  const author = story?.author;
  const reportLines = buildReportLines(reportCase.chapterReports);

  return [
    ...buildSharedCasePromptLines(reportCase, "chapter"),
    `Story title: ${normalizeText(story?.title) || "Unknown"}`,
    `Author: ${normalizeText(author?.displayName || author?.email) || "Unknown"}`,
    `Chapter: ${chapter?.chapterNumber ?? "Unknown"} - ${normalizeText(chapter?.title) || "Unknown"}`,
    `Chapter status: ${normalizeText(chapter?.status) || "Unknown"}; hidden=${Boolean(chapter?.isHidden)}`,
    `Chapter content preview: """${normalizeText(chapter?.content).slice(0, 3000)}"""`,
    "User reports:",
    reportLines || "No reports",
  ].join("\n");
}

function buildChapterCommentCasePrompt(reportCase) {
  const firstReport = reportCase.chapterCommentReports[0];
  const comment = firstReport?.comment;
  const chapter = comment?.chapter;
  const story = chapter?.story;
  const reportLines = buildReportLines(reportCase.chapterCommentReports);

  return [
    ...buildSharedCasePromptLines(reportCase, "chapter comment"),
    `Story title: ${normalizeText(story?.title) || "Unknown"}`,
    `Chapter: ${chapter?.chapterNumber ?? "Unknown"} - ${normalizeText(chapter?.title) || "Unknown"}`,
    `Comment content: """${normalizeText(comment?.content)}"""`,
    "User reports:",
    reportLines || "No reports",
  ].join("\n");
}

function buildAppealPrompt({ reportCase, basePrompt }) {
  return [
    "You are re-checking a moderation appeal for InkTrail.",
    "Return only valid JSON.",
    'Schema: {"summary": string, "recommendation": "accept"|"reject"|"review", "confidence": number}',
    "Write summary in natural Vietnamese for admins. Explain whether the appeal gives a credible reason to restore the content.",
    "Accept means the content likely should be restored. Reject means the original action still looks appropriate. Review means a human must inspect carefully.",
    `Current appeal status: ${reportCase.appealStatus || "none"}`,
    `Appeal reason from content owner: """${normalizeText(reportCase.appealReason).slice(0, 1500)}"""`,
    "Original case context:",
    basePrompt,
  ].join("\n");
}

async function callGeminiJson(prompt) {
  const response = await fetch(
    `${GEMINI_API_URL}/${GEMINI_REPORT_MODEL}:generateContent?key=${getGeminiApiKey()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini report AI failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("\n") || "";

  return {
    parsed: extractJson(text),
    raw: payload,
  };
}

async function analyzeChapterCommentReportCase({ caseId }) {
  const reportCase = await prisma.reportCase.findUnique({
    where: { id: caseId },
    include: {
      chapterCommentReports: {
        orderBy: { createdAt: "desc" },
        include: {
          comment: {
            include: {
              chapter: {
                include: {
                  story: {
                    select: {
                      id: true,
                      title: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reportCase || reportCase.targetType !== "chapter_comment") return null;
  if (!reportCase.chapterCommentReports.length) return null;

  const prompt = buildChapterCommentCasePrompt(reportCase);
  const { parsed } = await callGeminiJson(prompt);

  const aiFlagged = Boolean(parsed?.flagged);
  const aiCategories = normalizeCategories(parsed?.categories);
  const aiConfidence = normalizeConfidence(parsed?.confidence);
  const aiSeverity = normalizeSeverity(parsed?.severity);
  const aiSummary = normalizeText(parsed?.summary).slice(0, 1000) || null;
  const aiSuggestedAction = normalizeSuggestedAction(parsed?.suggested_action);

  const riskScore = calculateReportCaseRisk({
    reports: reportCase.chapterCommentReports.map((report) => ({
      reporterId: report.reporterId,
      reason: report.reason,
    })),
    reopenedCount: reportCase.reopenedCount,
    ai: {
      flagged: aiFlagged,
      confidence: aiConfidence,
      severity: aiSeverity,
      suggestedAction: aiSuggestedAction,
    },
  });

  const priority = deriveReportCasePriority(riskScore);

  return prisma.reportCase.update({
    where: { id: caseId },
    data: {
      aiFlagged,
      aiCategories,
      aiConfidence,
      aiSeverity,
      aiSummary,
      aiSuggestedAction,
      aiCheckedAt: new Date(),
      riskScore,
      priority,
    },
  });
}

async function analyzeStoryReportCase({ caseId }) {
  const reportCase = await prisma.reportCase.findUnique({
    where: { id: caseId },
    include: {
      storyReports: {
        orderBy: { createdAt: "desc" },
        include: {
          story: {
            include: {
              author: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                },
              },
              storyGenres: {
                include: {
                  genre: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reportCase || reportCase.targetType !== "story") return null;
  if (!reportCase.storyReports.length) return null;

  return analyzeLoadedReportCase({
    caseId,
    reportCase,
    prompt: buildStoryCasePrompt(reportCase),
    reports: reportCase.storyReports,
  });
}

async function analyzeChapterReportCase({ caseId }) {
  const reportCase = await prisma.reportCase.findUnique({
    where: { id: caseId },
    include: {
      chapterReports: {
        orderBy: { createdAt: "desc" },
        include: {
          chapter: {
            include: {
              story: {
                include: {
                  author: {
                    select: {
                      id: true,
                      displayName: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reportCase || reportCase.targetType !== "chapter") return null;
  if (!reportCase.chapterReports.length) return null;

  return analyzeLoadedReportCase({
    caseId,
    reportCase,
    prompt: buildChapterCasePrompt(reportCase),
    reports: reportCase.chapterReports,
  });
}

async function analyzeLoadedReportCase({ caseId, reportCase, prompt, reports }) {
  const { parsed } = await callGeminiJson(prompt);

  const aiFlagged = Boolean(parsed?.flagged);
  const aiCategories = normalizeCategories(parsed?.categories);
  const aiConfidence = normalizeConfidence(parsed?.confidence);
  const aiSeverity = normalizeSeverity(parsed?.severity);
  const aiSummary = normalizeText(parsed?.summary).slice(0, 1000) || null;
  const aiSuggestedAction = normalizeSuggestedAction(parsed?.suggested_action);

  const riskScore = calculateReportCaseRisk({
    reports: reports.map((report) => ({
      reporterId: report.reporterId,
      reason: report.reason,
    })),
    reopenedCount: reportCase.reopenedCount,
    ai: {
      flagged: aiFlagged,
      confidence: aiConfidence,
      severity: aiSeverity,
      suggestedAction: aiSuggestedAction,
    },
  });

  const priority = deriveReportCasePriority(riskScore);

  return prisma.reportCase.update({
    where: { id: caseId },
    data: {
      aiFlagged,
      aiCategories,
      aiConfidence,
      aiSeverity,
      aiSummary,
      aiSuggestedAction,
      aiCheckedAt: new Date(),
      riskScore,
      priority,
    },
  });
}

async function analyzeReportCaseAi({ type, caseId }) {
  if (!caseId) return null;

  try {
    if (type === "story") return await analyzeStoryReportCase({ caseId });
    if (type === "chapter") return await analyzeChapterReportCase({ caseId });
    if (type === "chapter_comment") {
      return await analyzeChapterCommentReportCase({ caseId });
    }
    return null;
  } catch (error) {
    const message = error?.message || String(error);
    console.error("Report case AI analysis failed:", message);
    const fallbackMessage = buildAiFallbackMessage(message);
    try {
      return await prisma.reportCase.update({
        where: { id: caseId },
        data: {
          aiFlagged: false,
          aiCategories: [],
          aiConfidence: 0,
          aiSeverity: "low",
          aiSuggestedAction: "review",
          aiSummary: `${fallbackMessage} Admin tiếp tục xử lý thủ công.`,
          aiCheckedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error(
        "Report case AI fallback update failed:",
        updateError?.message || updateError,
      );
      return null;
    }
  }
}

async function analyzeReportCaseAppealAi({ caseId }) {
  if (!caseId) return null;

  try {
    const baseCase = await prisma.reportCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        targetType: true,
        appealStatus: true,
        appealReason: true,
      },
    });
    if (!baseCase || baseCase.appealStatus !== "pending") return null;

    let reportCase = null;
    let basePrompt = "";

    if (baseCase.targetType === "story") {
      reportCase = await prisma.reportCase.findUnique({
        where: { id: caseId },
        include: {
          storyReports: {
            orderBy: { createdAt: "desc" },
            include: {
              story: {
                include: {
                  author: {
                    select: {
                      id: true,
                      displayName: true,
                      email: true,
                    },
                  },
                  storyGenres: {
                    include: {
                      genre: {
                        select: {
                          id: true,
                          name: true,
                          slug: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!reportCase?.storyReports?.length) return null;
      basePrompt = buildStoryCasePrompt(reportCase);
    } else if (baseCase.targetType === "chapter") {
      reportCase = await prisma.reportCase.findUnique({
        where: { id: caseId },
        include: {
          chapterReports: {
            orderBy: { createdAt: "desc" },
            include: {
              chapter: {
                include: {
                  story: {
                    include: {
                      author: {
                        select: {
                          id: true,
                          displayName: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!reportCase?.chapterReports?.length) return null;
      basePrompt = buildChapterCasePrompt(reportCase);
    } else {
      reportCase = await prisma.reportCase.findUnique({
        where: { id: caseId },
        include: {
          chapterCommentReports: {
            orderBy: { createdAt: "desc" },
            include: {
              comment: {
                include: {
                  chapter: {
                    include: {
                      story: {
                        select: {
                          id: true,
                          title: true,
                          slug: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!reportCase?.chapterCommentReports?.length) return null;
      basePrompt = buildChapterCommentCasePrompt(reportCase);
    }

    const { parsed } = await callGeminiJson(
      buildAppealPrompt({ reportCase, basePrompt }),
    );

    return prisma.reportCase.update({
      where: { id: caseId },
      data: {
        appealAiSummary: normalizeText(parsed?.summary).slice(0, 1000) || null,
        appealAiRecommendation: normalizeAppealRecommendation(
          parsed?.recommendation,
        ),
        appealAiConfidence: normalizeConfidence(parsed?.confidence),
        appealAiCheckedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error?.message || String(error);
    console.error("Report appeal AI analysis failed:", message);
    const fallbackMessage = buildAiFallbackMessage(message);
    try {
      return await prisma.reportCase.update({
        where: { id: caseId },
        data: {
          appealAiSummary: `${fallbackMessage} Admin vẫn có thể tự xem xét và xử lý kháng nghị.`,
          appealAiRecommendation: "review",
          appealAiConfidence: 0,
          appealAiCheckedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error(
        "Report appeal AI fallback update failed:",
        updateError?.message || updateError,
      );
      return null;
    }
  }
}

module.exports = {
  analyzeReportCaseAi,
  analyzeReportCaseAppealAi,
};

