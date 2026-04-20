const { handleError } = require("../../utils/error_handle");
const reportService = require("./report.service");

const reportStory = async (req, res) => {
  try {
    const result = await reportService.reportStory({
      storyId: req.params.storyId,
      requester: req.user,
      reason: req.body.reason,
      description: req.body.description,
    });

    res.status(result.already_reported ? 200 : 201).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const reportChapter = async (req, res) => {
  try {
    const result = await reportService.reportChapter({
      chapterId: req.params.chapterId,
      requester: req.user,
      reason: req.body.reason,
      description: req.body.description,
    });

    res.status(result.already_reported ? 200 : 201).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const reportChapterComment = async (req, res) => {
  try {
    const result = await reportService.reportChapterComment({
      commentId: req.params.commentId,
      requester: req.user,
      reason: req.body.reason,
      description: req.body.description,
    });

    res.status(result.already_reported ? 200 : 201).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  reportStory,
  reportChapter,
  reportChapterComment,
};
