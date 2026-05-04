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

module.exports = router;

