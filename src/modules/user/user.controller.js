const { handleError } = require("../../utils/error_handle");
const userService = require("./user.service");

const listAdminUsers = async (req, res) => {
  try {
    const users = await userService.listAdminUsers({
      query: req.query.query,
      role: req.query.role,
      status: req.query.status,
    });
    res.json(users);
  } catch (err) {
    handleError(err, res);
  }
};

const lockUser = async (req, res) => {
  try {
    const user = await userService.lockUser({
      targetUserId: req.params.id,
      actorId: req.user.id,
      reason: req.body?.reason,
      lockedUntil: req.body?.locked_until,
    });
    res.json(user);
  } catch (err) {
    handleError(err, res);
  }
};

const unlockUser = async (req, res) => {
  try {
    const user = await userService.unlockUser({
      targetUserId: req.params.id,
      actorId: req.user.id,
    });
    res.json(user);
  } catch (err) {
    handleError(err, res);
  }
};

const getUserLockLogs = async (req, res) => {
  try {
    const logs = await userService.listUserLockLogs(req.params.id);
    res.json(logs);
  } catch (err) {
    handleError(err, res);
  }
};

const getUserViolationSummary = async (req, res) => {
  try {
    const summary = await userService.getUserViolationSummary(req.params.id);
    res.json(summary);
  } catch (err) {
    handleError(err, res);
  }
};

const listLockAppeals = async (req, res) => {
  try {
    const result = await userService.listLockAppeals({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const resolveLockAppeal = async (req, res) => {
  try {
    const result = await userService.resolveLockAppeal({
      appealId: req.params.id,
      actorId: req.user?.id,
      action: req.params.action,
      note: req.body?.note ?? "",
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  listAdminUsers,
  lockUser,
  unlockUser,
  getUserLockLogs,
  getUserViolationSummary,
  listLockAppeals,
  resolveLockAppeal,
};
