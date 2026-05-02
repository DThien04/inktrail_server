const express = require("express");
const router = express.Router();

const reportController = require("./report.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.get(
  "/admin",
  authenticate,
  authorize("admin"),
  reportController.listAdminReports,
);

router.get(
  "/admin/:type/:reportId",
  authenticate,
  authorize("admin"),
  reportController.getAdminReportDetail,
);

router.patch(
  "/admin/:type/:reportId",
  authenticate,
  authorize("admin"),
  reportController.updateAdminReportStatus,
);

router.post(
  "/admin/cases/critical/process",
  authenticate,
  authorize("admin"),
  reportController.processCriticalAdminReportCases,
);

router.post(
  "/admin/cases/:caseId/restore",
  authenticate,
  authorize("admin"),
  reportController.restoreAdminReportCase,
);

router.post(
  "/admin/cases/:caseId/appeal/:action",
  authenticate,
  authorize("admin"),
  reportController.resolveReportCaseAppeal,
);

router.post(
  "/cases/:caseId/appeal",
  authenticate,
  reportController.submitReportCaseAppeal,
);

router.post(
  "/stories/:storyId",
  authenticate,
  reportController.reportStory,
);

router.post(
  "/chapters/:chapterId",
  authenticate,
  reportController.reportChapter,
);

router.post(
  "/chapter-comments/:commentId",
  authenticate,
  reportController.reportChapterComment,
);

module.exports = router;
