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

const getAdminTags = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.page_size || req.query.pageSize || 20);
    const result = await tagService.getAdminTags({
      keyword: req.query.keyword,
      groupId: req.query.group_id || req.query.groupId,
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const mergeTag = async (req, res) => {
  try {
    const result = await tagService.mergeTag({
      fromTagId: req.params.id,
      toTagId: req.body?.to_tag_id || req.body?.toTagId,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const mergeTagsBulk = async (req, res) => {
  try {
    const result = await tagService.mergeTagsBulk({
      fromTagIds: req.body?.from_tag_ids || req.body?.fromTagIds,
      toTagId: req.body?.to_tag_id || req.body?.toTagId,
    });
    res.json(result);
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
      groupId: req.body?.group_id || req.body?.groupId,
    });

    res.json({
      message: "Cập nhật tag thành công",
      tag,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const setTagsGroupBulk = async (req, res) => {
  try {
    const result = await tagService.setTagsGroupBulk({
      tagIds: req.body?.tag_ids || req.body?.tagIds,
      groupId: req.body?.group_id || req.body?.groupId,
    });
    res.json(result);
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
  getAdminTags,
  getById,
  updateTag,
  activateTag,
  deactivateTag,
  mergeTag,
  mergeTagsBulk,
  setTagsGroupBulk,
  deleteTag,
};
