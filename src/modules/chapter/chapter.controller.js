const { handleError } = require("../../utils/error_handle");
const chapterService = require("./chapter.service");

const createChapter = async (req, res) => {
  try {
    const { chapter_number, title, content, status } = req.body;
    const chapter = await chapterService.createChapter({
      storyId: req.params.storyId,
      requester: req.user,
      chapterNumber: chapter_number,
      title,
      content,
      status,
    });

    res.status(201).json({
      message: "Tạo chương thành công",
      chapter,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const getByStory = async (req, res) => {
  try {
    const chapters = await chapterService.getChaptersByStory({
      storyId: req.params.storyId,
      requester: req.user || null,
    });

    res.json(chapters);
  } catch (err) {
    handleError(err, res);
  }
};

const getById = async (req, res) => {
  try {
    const chapter = await chapterService.getChapterDetail({
      chapterId: req.params.id,
      requester: req.user || null,
    });

    res.json(chapter);
  } catch (err) {
    handleError(err, res);
  }
};

const likeChapter = async (req, res) => {
  try {
    const result = await chapterService.likeChapter({
      chapterId: req.params.id,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const unlikeChapter = async (req, res) => {
  try {
    const result = await chapterService.unlikeChapter({
      chapterId: req.params.id,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getComments = async (req, res) => {
  try {
    const result = await chapterService.listChapterComments({
      chapterId: req.params.id,
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
    const comment = await chapterService.createChapterComment({
      chapterId: req.params.id,
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

const updateChapter = async (req, res) => {
  try {
    const { chapter_number, title, content, status } = req.body;
    const chapter = await chapterService.updateChapter({
      chapterId: req.params.id,
      requester: req.user,
      chapterNumber: chapter_number,
      title,
      content,
      status,
    });

    res.json({
      message: "Cập nhật chương thành công",
      chapter,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const moveChapter = async (req, res) => {
  try {
    const result = await chapterService.moveChapter({
      chapterId: req.params.id,
      requester: req.user,
      direction: req.body.direction,
    });

    res.json({
      message: "Đổi vị trí chương thành công",
      ...result,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteChapter = async (req, res) => {
  try {
    const result = await chapterService.deleteChapter({
      chapterId: req.params.id,
      requester: req.user,
    });

    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  createChapter,
  getByStory,
  getById,
  likeChapter,
  unlikeChapter,
  getComments,
  createComment,
  updateChapter,
  moveChapter,
  deleteChapter,
};
