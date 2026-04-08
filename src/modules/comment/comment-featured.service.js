const prisma = require("../../config/prisma");

const STORY_FEATURED_LIMIT = 4;
const STORY_SCORE_LOOKBACK_HOURS = 72;
const CHAPTER_SCORE_LOOKBACK_HOURS = 72;
const MAX_STORY_CANDIDATES = 500;
const MAX_CHAPTER_CANDIDATES = 300;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getLikeCount = (comment) =>
  typeof comment?.stats?.likeCount === "number" ? comment.stats.likeCount : 0;

const getAgeHours = (createdAt) => {
  if (!(createdAt instanceof Date)) return 9999;
  return Math.max(0, (Date.now() - createdAt.getTime()) / 3600000);
};

const scoreComment = ({ comment, lookbackHours }) => {
  const likeCount = getLikeCount(comment);
  const ageHours = getAgeHours(comment.createdAt);
  const freshness = clamp((lookbackHours - ageHours) / lookbackHours, 0, 1);
  const contentLength = String(comment.content || "").trim().length;
  const qualityBoost = clamp(contentLength / 280, 0, 1);
  return likeCount * 3 + freshness * 2 + qualityBoost;
};

const rankByScore = ({ comments, lookbackHours }) => {
  return comments
    .map((comment) => ({
      comment,
      score: scoreComment({ comment, lookbackHours }),
      likeCount: getLikeCount(comment),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      const aTs = a.comment.createdAt instanceof Date ? a.comment.createdAt.getTime() : 0;
      const bTs = b.comment.createdAt instanceof Date ? b.comment.createdAt.getTime() : 0;
      if (bTs !== aTs) return bTs - aTs;
      return String(a.comment.id).localeCompare(String(b.comment.id));
    });
};

const isMissingIdColumnError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("column") &&
    message.includes("id") &&
    message.includes("does not exist")
  );
};

const recomputeStoryFeaturedComments = async ({ tx = prisma, storyId }) => {
  const comments = await tx.storyComment.findMany({
    where: { storyId },
    take: MAX_STORY_CANDIDATES,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      content: true,
      createdAt: true,
      stats: {
        select: { likeCount: true },
      },
    },
  });

  if (!comments.length) {
    await tx.storyFeaturedComment.deleteMany({ where: { storyId } });
    return [];
  }

  const ranked = rankByScore({
    comments,
    lookbackHours: STORY_SCORE_LOOKBACK_HOURS,
  }).slice(0, STORY_FEATURED_LIMIT);

  const now = new Date();
  try {
    await tx.storyFeaturedComment.deleteMany({ where: { storyId } });
    await tx.storyFeaturedComment.createMany({
      data: ranked.map((item, index) => ({
        storyId,
        commentId: item.comment.id,
        rank: index + 1,
        score: item.score,
        reason: "auto:score",
        computedAt: now,
      })),
    });
  } catch (error) {
    if (!isMissingIdColumnError(error)) {
      console.error(
        "[featured-comments] recomputeStoryFeaturedComments failed:",
        error?.message || error,
      );
      return [];
    }

    try {
      await tx.$executeRaw`
        DELETE FROM "story_featured_comments"
        WHERE "story_id" = ${storyId}
      `;

      for (let index = 0; index < ranked.length; index += 1) {
        const item = ranked[index];
        await tx.$executeRaw`
          INSERT INTO "story_featured_comments"
            ("story_id", "comment_id", "rank", "score", "reason", "computed_at")
          VALUES
            (${storyId}, ${item.comment.id}, ${index + 1}, ${item.score}, ${"auto:score"}, ${now})
        `;
      }
    } catch (fallbackError) {
      console.error(
        "[featured-comments] fallback write failed:",
        fallbackError?.message || fallbackError,
      );
      return [];
    }
  }

  return ranked.map((item) => item.comment.id);
};

const recomputeChapterFeaturedComment = async ({ tx = prisma, chapterId }) => {
  const comments = await tx.chapterComment.findMany({
    where: { chapterId },
    take: MAX_CHAPTER_CANDIDATES,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      content: true,
      createdAt: true,
      stats: {
        select: { likeCount: true },
      },
    },
  });

  if (!comments.length) {
    await tx.chapterFeaturedComment.deleteMany({ where: { chapterId } });
    return null;
  }

  const ranked = rankByScore({
    comments,
    lookbackHours: CHAPTER_SCORE_LOOKBACK_HOURS,
  });
  const top = ranked[0];
  const now = new Date();

  try {
    const saved = await tx.chapterFeaturedComment.upsert({
      where: { chapterId },
      create: {
        chapterId,
        commentId: top.comment.id,
        score: top.score,
        reason: "auto:score",
        computedAt: now,
      },
      update: {
        commentId: top.comment.id,
        score: top.score,
        reason: "auto:score",
        computedAt: now,
      },
      select: { commentId: true },
    });

    return saved.commentId;
  } catch (error) {
    console.error(
      "[featured-comments] recomputeChapterFeaturedComment failed:",
      error?.message || error,
    );
    return null;
  }
};

const getStoryFeaturedCommentIds = async ({ storyId, tx = prisma }) => {
  try {
    const rows = await tx.storyFeaturedComment.findMany({
      where: { storyId },
      orderBy: [{ rank: "asc" }, { updatedAt: "desc" }],
      select: { commentId: true },
      take: STORY_FEATURED_LIMIT,
    });
    return rows.map((item) => item.commentId);
  } catch (error) {
    console.error(
      "[featured-comments] getStoryFeaturedCommentIds failed:",
      error?.message || error,
    );
    return [];
  }
};

const getChapterFeaturedCommentId = async ({ chapterId, tx = prisma }) => {
  try {
    const row = await tx.chapterFeaturedComment.findUnique({
      where: { chapterId },
      select: { commentId: true },
    });
    return row?.commentId ?? null;
  } catch (error) {
    console.error(
      "[featured-comments] getChapterFeaturedCommentId failed:",
      error?.message || error,
    );
    return null;
  }
};

module.exports = {
  STORY_FEATURED_LIMIT,
  recomputeStoryFeaturedComments,
  recomputeChapterFeaturedComment,
  getStoryFeaturedCommentIds,
  getChapterFeaturedCommentId,
};
