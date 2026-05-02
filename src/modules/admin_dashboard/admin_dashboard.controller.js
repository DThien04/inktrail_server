const { handleError } = require("../../utils/error_handle");
const dashboardService = require("./admin_dashboard.service");

const getSummary = async (_req, res) => {
  try {
    const data = await dashboardService.getAdminDashboardSummary();
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
};

const getTrends = async (req, res) => {
  try {
    const data = await dashboardService.getAdminDashboardTrends({
      range: req.query.range,
    });
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
};

const getQueues = async (req, res) => {
  try {
    const data = await dashboardService.getAdminDashboardQueues({
      limit: req.query.limit,
    });
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  getSummary,
  getTrends,
  getQueues,
};

