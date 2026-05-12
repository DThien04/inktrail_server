const express = require("express");

const router = express.Router();
const userController = require("./user.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.get(
  "/admin/list",
  authenticate,
  authorize("admin"),
  userController.listAdminUsers,
);

router.post(
  "/admin/:id/lock",
  authenticate,
  authorize("admin"),
  userController.lockUser,
);

router.post(
  "/admin/:id/unlock",
  authenticate,
  authorize("admin"),
  userController.unlockUser,
);

router.get(
  "/admin/:id/lock-logs",
  authenticate,
  authorize("admin"),
  userController.getUserLockLogs,
);

router.get(
  "/admin/:id/violation-summary",
  authenticate,
  authorize("admin"),
  userController.getUserViolationSummary,
);

router.get(
  "/admin/lock-appeals",
  authenticate,
  authorize("admin"),
  userController.listLockAppeals,
);

router.post(
  "/admin/lock-appeals/:id/:action",
  authenticate,
  authorize("admin"),
  userController.resolveLockAppeal,
);

module.exports = router;
