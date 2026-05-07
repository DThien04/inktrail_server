const { handleError } = require("../../utils/error_handle");
const tagService = require("./tag.service");

const createTag = async (req, res) => {
  try {
    const { name, description } = req.body;
    const tag = await tagService.createTag({
      name,
      description,
    });

    res.status(201).json({
      message: "Tạo tag thành công",
      tag,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const getTags = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === "true";
    const tags = await tagService.getTags({
      includeInactive,
      keyword: req.query.keyword,
    });
    res.json(tags);
  } catch (err) {
    handleError(err, res);
  }
};

const getById = async (req, res) => {
  try {
    const tag = await tagService.getTagById(req.params.id);
    res.json(tag);
  } catch (err) {
    handleError(err, res);
  }
};

const updateTag = async (req, res) => {
  try {
    const { name, description } = req.body;
    const tag = await tagService.updateTag({
      tagId: req.params.id,
      name,
      description,
    });

    res.json({
      message: "Cập nhật tag thành công",
      tag,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const activateTag = async (req, res) => {
  try {
    const tag = await tagService.setTagActiveStatus({
      tagId: req.params.id,
      isActive: true,
    });

    res.json({
      message: "Đã bật tag thành công",
      tag,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deactivateTag = async (req, res) => {
  try {
    const tag = await tagService.setTagActiveStatus({
      tagId: req.params.id,
      isActive: false,
    });

    res.json({
      message: "Đã tắt tag thành công",
      tag,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteTag = async (req, res) => {
  try {
    const hardDelete = req.query.hard === "true";
    const result = await tagService.deleteTag({
      tagId: req.params.id,
      hardDelete,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  createTag,
  getTags,
  getById,
  updateTag,
  activateTag,
  deactivateTag,
  deleteTag,
};
