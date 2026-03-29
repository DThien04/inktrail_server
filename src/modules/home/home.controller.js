const { handleError } = require("../../utils/error_handle");
const homeService = require("./home.service");

const normalizeQueryValue = (value) =>
  typeof value === "string" ? value.trim() : value;

const getNewStories = async (req, res) => {
  try {
    const stories = await homeService.getNewStories({
      limit: normalizeQueryValue(req.query.limit),
    });
    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

const getHotStories = async (req, res) => {
  try {
    const stories = await homeService.getHotStories({
      limit: normalizeQueryValue(req.query.limit),
    });
    res.json(stories);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  getNewStories,
  getHotStories,
};
