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
  updateChapter,
  moveChapter,
  deleteChapter,
};
