const { handleError } = require("../../utils/error_handle");
const reportService = require("./report.service");

const listAdminReports = async (req, res) => {
  try {
    const result = await reportService.listAdminReports({
      type: req.query.type,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getAdminReportDetail = async (req, res) => {
  try {
    const result = await reportService.getAdminReportDetail({
      type: req.params.type,
      reportId: req.params.reportId,
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const updateAdminReportStatus = async (req, res) => {
  try {
    const result = await reportService.updateAdminReportStatus({
      type: req.params.type,
      reportId: req.params.reportId,
      status: req.body.status,
      requester: req.user,
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const processCriticalAdminReportCases = async (req, res) => {
  try {
    const result = await reportService.processCriticalAdminReportCases({
      requester: req.user,
      lockAuthor: Boolean(req.body?.lock_author),
      lockReason: req.body?.lock_reason ?? "",
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const restoreAdminReportCase = async (req, res) => {
  try {
    const result = await reportService.restoreAdminReportCase({
      caseId: req.params.caseId,
      requester: req.user,
      unlockUser: Boolean(req.body?.unlock_user),
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const lockReportCaseAuthor = async (req, res) => {
  try {
    const result = await reportService.lockReportCaseAuthor({
      caseId: req.params.caseId,
      requester: req.user,
      reason: req.body?.reason,
      lockedUntil: req.body?.locked_until,
      alsoResolveContent: req.body?.also_resolve_content !== false,
    });
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const resolveReportCaseAppeal = async (req, res) => {
  try {
    const result = await reportService.resolveReportCaseAppeal({
      caseId: req.params.caseId,
      action: req.params.action,
      requester: req.user,
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const submitReportCaseAppeal = async (req, res) => {
  try {
    const result = await reportService.submitReportCaseAppeal({
      caseId: req.params.caseId,
      requester: req.user,
      reason: req.body.reason,
    });

    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const reportStory = async (req, res) => {
  try {
    const result = await reportService.reportStory({
      storyId: req.params.storyId,
      requester: req.user,
      reason: req.body.reason,
      description: req.body.description,
    });

    res.status(result.already_reported ? 200 : 201).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const reportChapter = async (req, res) => {
  try {
    const result = await reportService.reportChapter({
      chapterId: req.params.chapterId,
      requester: req.user,
      reason: req.body.reason,
      description: req.body.description,
    });

    res.status(result.already_reported ? 200 : 201).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const reportChapterComment = async (req, res) => {
  try {
    const result = await reportService.reportChapterComment({
      commentId: req.params.commentId,
      requester: req.user,
      reason: req.body.reason,
      description: req.body.description,
    });

    res.status(result.already_reported ? 200 : 201).json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  listAdminReports,
  getAdminReportDetail,
  updateAdminReportStatus,
  processCriticalAdminReportCases,
  restoreAdminReportCase,
  lockReportCaseAuthor,
  resolveReportCaseAppeal,
  submitReportCaseAppeal,
  reportStory,
  reportChapter,
  reportChapterComment,
};
