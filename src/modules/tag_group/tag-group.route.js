const express = require("express");
const router = express.Router();

const tagGroupController = require("./tag-group.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.use(authenticate, authorize("admin"));

router.get("/admin", tagGroupController.getAdminTagGroups);
router.post("/", tagGroupController.createTagGroup);
router.patch("/:id", tagGroupController.updateTagGroup);
router.delete("/:id", tagGroupController.deleteTagGroup);

module.exports = router;

