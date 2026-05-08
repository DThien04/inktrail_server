const express = require("express");
const router = express.Router();

const tagController = require("./tag.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.get("/", tagController.getTags);
router.get("/admin", authenticate, authorize("admin"), tagController.getAdminTags);
router.get("/:id", tagController.getById);

router.post("/", authenticate, authorize("admin"), tagController.createTag);
router.post("/merge-bulk", authenticate, authorize("admin"), tagController.mergeTagsBulk);
router.post("/set-group-bulk", authenticate, authorize("admin"), tagController.setTagsGroupBulk);
router.patch("/:id", authenticate, authorize("admin"), tagController.updateTag);
router.post("/:id/merge", authenticate, authorize("admin"), tagController.mergeTag);
router.post("/:id/activate", authenticate, authorize("admin"), tagController.activateTag);
router.post("/:id/deactivate", authenticate, authorize("admin"), tagController.deactivateTag);
router.delete("/:id", authenticate, authorize("admin"), tagController.deleteTag);

module.exports = router;
