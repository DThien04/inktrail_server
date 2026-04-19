const { handleError } = require("../../utils/error_handle");
const storyService = require("./story.service");

const createStory = async (req, res) => {
  try {
    const { title, slug, description, cover_url, cover_base64, status, genre_ids } = req.body;
    const coverFile = req.file;

    const story = await storyService.createStory({
      authorId: req.user.id,
      title,
      slug,
      description,
      coverUrl: cover_url,
      coverBase64: cover_base64,
      coverBuffer: coverFile?.buffer,
      coverMimeType: coverFile?.mimetype,
      status,
      genreIds: genre_ids,
    });

    res.status(201).json({
      message: "Tạo truyện thành công",
      story,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const getMyStories = async (req, res) => {
  try {
    const stories = await storyService.getMyStories({
      userId: req.user.id,
      status: req.query.status,
    });

    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

const getMyStoryStats = async (req, res) => {
  try {
    const result = await storyService.getMyStoryStats({
      userId: req.user.id,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getMyDashboard = async (req, res) => {
  try {
    const result = await storyService.getMyAuthorDashboard({
      userId: req.user.id,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getAdminStories = async (req, res) => {
  try {
    const stories = await storyService.getAdminStories({
      status: req.query.status,
      query: req.query.query,
    });

    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

const searchStories = async (req, res) => {
  try {
    const stories = await storyService.searchStories({
      query: req.query.query,
      genreId: req.query.genre_id,
      sort: req.query.sort,
      limit: req.query.limit,
    });

    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

const getPublishedStoriesByAuthor = async (req, res) => {
  try {
    const stories = await storyService.getPublishedStoriesByAuthor({
      authorId: req.params.authorId,
      requester: req.user || null,
      limit: req.query.limit,
    });

    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

const trackReadEvent = async (req, res) => {
  try {
    const result = await storyService.trackReadEvent({
      storyId: req.params.id,
      requester: req.user || null,
      deviceId: req.headers["x-device-id"],
      chapterIndex: req.body.chapter_index,
      timeSpentSeconds: req.body.time_spent_seconds,
      maxScrollPercent: req.body.max_scroll_percent,
    });

    res.status(202).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getMyRating = async (req, res) => {
  try {
    const result = await storyService.getMyStoryRating({
      storyId: req.params.id,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const upsertRating = async (req, res) => {
  try {
    const result = await storyService.upsertStoryRating({
      storyId: req.params.id,
      requester: req.user,
      score: req.body.rating,
      content: req.body.content,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const listRatings = async (req, res) => {
  try {
    const result = await storyService.listStoryRatings({
      storyId: req.params.id,
      requester: req.user || null,
      limit: req.query.limit,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getFeaturedComments = async (req, res) => {
  try {
    const result = await storyService.getStoryFeaturedComments({
      storyId: req.params.id,
      requester: req.user || null,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getSimilarStories = async (req, res) => {
  try {
    const stories = await storyService.getSimilarStories({
      storyId: req.params.id,
      requester: req.user || null,
      limit: req.query.limit,
    });

    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

const getRecommendedStories = async (req, res) => {
  try {
    const stories = await storyService.getRecommendedStories({
      storyId: req.params.id,
      requester: req.user || null,
      limit: req.query.limit,
    });

    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

const getBySlug = async (req, res) => {
  try {
    const story = await storyService.getStoryDetailBySlug({
      slug: req.params.slug,
      requester: req.user || null,
    });

    res.json(story);
  } catch (err) {
    handleError(err, res);
  }
};

const updateStory = async (req, res) => {
  try {
    const { title, slug, description, cover_url, cover_base64, status, genre_ids } = req.body;
    const coverFile = req.file;

    const story = await storyService.updateStory({
      storyId: req.params.id,
      requester: req.user,
      title,
      slug,
      description,
      coverUrl: cover_url,
      coverBase64: cover_base64,
      coverBuffer: coverFile?.buffer,
      coverMimeType: coverFile?.mimetype,
      status,
      genreIds: genre_ids,
    });

    res.json({
      message: "Cập nhật truyện thành công",
      story,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteStory = async (req, res) => {
  try {
    const result = await storyService.deleteStory({
      storyId: req.params.id,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  createStory,
  getMyStories,
  getMyStoryStats,
  getMyDashboard,
  getAdminStories,
  searchStories,
  getPublishedStoriesByAuthor,
  trackReadEvent,
  listRatings,
  getMyRating,
  upsertRating,
  getFeaturedComments,
  getSimilarStories,
  getRecommendedStories,
  getBySlug,
  updateStory,
  deleteStory,
};
