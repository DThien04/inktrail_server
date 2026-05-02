const express = require("express");

const router = express.Router();
const dashboardController = require("./admin_dashboard.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.use(authenticate, authorize("admin"));

router.get("/summary", dashboardController.getSummary);
router.get("/trends", dashboardController.getTrends);
router.get("/queues", dashboardController.getQueues);

module.exports = router;

