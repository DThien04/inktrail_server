require("dotenv").config();

const { moderateText } = require("./moderation");

async function main() {
  const sampleText =
    process.argv.slice(2).join(" ") ||
    "Nguoi nay that dang ghe, tao muon danh no.";

  console.log("Testing moderation model:", process.env.GEMINI_MODEL);
  console.log("Input:", sampleText);

  const result = await moderateText(sampleText);

  console.log(
    JSON.stringify(
      {
        flagged: result.flagged,
        categories: result.categories,
        maxScore: result.maxScore,
        severity: result.severity,
        reason: result.reason,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
