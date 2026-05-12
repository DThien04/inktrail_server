const { handleError } = require("../../utils/error_handle");
const tagGroupService = require("./tag-group.service");

const getAdminTagGroups = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.page_size || req.query.pageSize || 20);
    const result = await tagGroupService.getAdminTagGroups({
      keyword: req.query.keyword,
      page,
      pageSize,
      sortBy: req.query.sort_by || req.query.sortBy,
      sortOrder: req.query.sort_order || req.query.sortOrder,
      tagFilter: req.query.tag_filter || req.query.tagFilter,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const createTagGroup = async (req, res) => {
  try {
    const group = await tagGroupService.createTagGroup({
      name: req.body?.name,
      description: req.body?.description,
    });
    res.status(201).json({
      message: "Tạo nhóm tag thành công",
      group,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const updateTagGroup = async (req, res) => {
  try {
    const group = await tagGroupService.updateTagGroup({
      groupId: req.params.id,
      name: req.body?.name,
      description: req.body?.description,
    });
    res.json({
      message: "Cập nhật nhóm tag thành công",
      group,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteTagGroup = async (req, res) => {
  try {
    const result = await tagGroupService.deleteTagGroup({
      groupId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  getAdminTagGroups,
  createTagGroup,
  updateTagGroup,
  deleteTagGroup,
};

