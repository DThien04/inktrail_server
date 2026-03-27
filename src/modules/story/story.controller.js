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
  getBySlug,
  updateStory,
  deleteStory,
};
