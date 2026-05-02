const REPORT_REASON_WEIGHTS = {
  copyright: 40,
  sexual: 38,
  violence: 36,
  hate: 34,
  abuse: 28,
  misleading: 22,
  spam: 16,
  other: 12,
};

function normalizeAiConfidence(confidence) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

function calculateAiRiskBoost(ai = {}) {
  if (!ai?.flagged) return 0;

  const confidence = normalizeAiConfidence(ai.confidence);
  let boost = Math.round(confidence * 16);

  switch (ai.severity) {
    case "critical":
      boost += 18;
      break;
    case "high":
      boost += 12;
      break;
    case "medium":
      boost += 6;
      break;
    default:
      break;
  }

  switch (ai.suggestedAction) {
    case "remove_candidate":
      boost += 10;
      break;
    case "review_urgent":
      boost += 8;
      break;
    case "review_soon":
      boost += 4;
      break;
    default:
      break;
  }

  return Math.min(35, boost);
}

function calculateAiRiskAdjustment(ai = {}) {
  if (!ai) return 0;
  if (ai.flagged) return calculateAiRiskBoost(ai);

  const confidence = normalizeAiConfidence(ai.confidence);
  if (confidence >= 0.9 && ai.suggestedAction === "allow") return -45;
  if (confidence >= 0.8 && ai.suggestedAction === "allow") return -35;
  if (confidence >= 0.8) return -25;
  if (confidence >= 0.65) return -15;
  return 0;
}

function calculateReportCaseRisk({ reports, reopenedCount, ai = null }) {
  const reportCount = reports.length;
  const uniqueReporterCount = new Set(
    reports.map((report) => report.reporterId),
  ).size;
  const highestReasonWeight = reports.reduce((highest, report) => {
    const weight =
      REPORT_REASON_WEIGHTS[report.reason] ?? REPORT_REASON_WEIGHTS.other;
    return weight > highest ? weight : highest;
  }, 0);

  const baseScore =
    reportCount * 10 +
    uniqueReporterCount * 14 +
    highestReasonWeight +
    reopenedCount * 12;

  return Math.max(0, Math.min(100, baseScore + calculateAiRiskAdjustment(ai)));
}

function deriveReportCasePriority(riskScore) {
  if (riskScore >= 85) return "critical";
  if (riskScore >= 60) return "high";
  if (riskScore >= 32) return "medium";
  return "low";
}

module.exports = {
  REPORT_REASON_WEIGHTS,
  calculateAiRiskBoost,
  calculateAiRiskAdjustment,
  calculateReportCaseRisk,
  deriveReportCasePriority,
};
