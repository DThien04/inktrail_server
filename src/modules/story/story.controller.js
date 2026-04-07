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

const likeStory = async (req, res) => {
  try {
    const result = await storyService.likeStory({
      storyId: req.params.id,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const unlikeStory = async (req, res) => {
  try {
    const result = await storyService.unlikeStory({
      storyId: req.params.id,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getComments = async (req, res) => {
  try {
    const result = await storyService.listStoryComments({
      storyId: req.params.id,
      requester: req.user || null,
      sort: req.query.sort,
      limit: req.query.limit,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const createComment = async (req, res) => {
  try {
    const comment = await storyService.createStoryComment({
      storyId: req.params.id,
      requester: req.user,
      content: req.body.content,
    });

    res.status(201).json({
      message: "Tạo bình luận thành công",
      comment,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const likeComment = async (req, res) => {
  try {
    const result = await storyService.likeStoryComment({
      commentId: req.params.commentId,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const unlikeComment = async (req, res) => {
  try {
    const result = await storyService.unlikeStoryComment({
      commentId: req.params.commentId,
      requester: req.user,
    });

    res.json(result);
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
  getAdminStories,
  searchStories,
  trackReadEvent,
  likeStory,
  unlikeStory,
  getComments,
  createComment,
  likeComment,
  unlikeComment,
  getBySlug,
  updateStory,
  deleteStory,
};
