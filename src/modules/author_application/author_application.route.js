const express = require("express");

const router = express.Router();
const controller = require("./author_application.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.get("/me/eligibility", authenticate, controller.getMyEligibility);
router.post("/me/applications", authenticate, authorize("reader"), controller.submitMyApplication);
router.get("/me/applications", authenticate, controller.getMyApplications);

router.get(
  "/admin/applications",
  authenticate,
  authorize("admin"),
  controller.listAdminApplications,
);
router.get(
  "/admin/applications/:id",
  authenticate,
  authorize("admin"),
  controller.getAdminApplicationById,
);
router.post(
  "/admin/applications/:id/approve",
  authenticate,
  authorize("admin"),
  controller.approveAdminApplication,
);
router.post(
  "/admin/applications/:id/reject",
  authenticate,
  authorize("admin"),
  controller.rejectAdminApplication,
);

module.exports = router;
