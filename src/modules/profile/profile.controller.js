const { handleError } = require("../../utils/error_handle");
const profileService = require("./profile.service");

const getMe = async (req, res) => {
  try {
    const profile = await profileService.getMyProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    handleError(err, res);
  }
};

const getById = async (req, res) => {
  try {
    const profile = await profileService.getProfileById(req.params.id);
    res.json(profile);
  } catch (err) {
    handleError(err, res);
  }
};

const updateMe = async (req, res) => {
  try {
    const { display_name, bio, avatar_base64 } = req.body;
    const avatarFile = req.file;
    const profile = await profileService.updateMyProfile({
      userId: req.user.id,
      displayName: display_name,
      bio,
      avatarBase64: avatar_base64,
      avatarBuffer: avatarFile?.buffer,
      avatarMimeType: avatarFile?.mimetype,
    });
    res.json({
      message: "Cập nhật profile thành công",
      user: profile,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const uploadMyAvatar = async (req, res) => {
  try {
    const { avatar_base64 } = req.body;
    const avatarFile = req.file;
    const profile = await profileService.updateMyAvatar({
      userId: req.user.id,
      avatarBase64: avatar_base64,
      avatarBuffer: avatarFile?.buffer,
      avatarMimeType: avatarFile?.mimetype,
    });
    res.json({
      message: "Cập nhật avatar thành công",
      user: profile,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteMyAvatar = async (req, res) => {
  try {
    const profile = await profileService.deleteMyAvatar(req.user.id);
    res.json({
      message: "Xóa avatar thành công",
      user: profile,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const listMyReadingProgress = async (req, res) => {
  try {
    const progresses = await profileService.listMyReadingProgress({
      userId: req.user.id,
      limit: req.query.limit,
    });
    res.json(progresses);
  } catch (err) {
    handleError(err, res);
  }
};

const getMyReadingProgressByStory = async (req, res) => {
  try {
    const progress = await profileService.getMyReadingProgressByStory({
      userId: req.user.id,
      storyId: req.params.storyId,
    });
    res.json(progress);
  } catch (err) {
    handleError(err, res);
  }
};

const upsertMyReadingProgress = async (req, res) => {
  try {
    const { last_chapter_index, last_position } = req.body;
    const progress = await profileService.upsertMyReadingProgress({
      userId: req.user.id,
      storyId: req.params.storyId,
      lastChapterIndex: last_chapter_index,
      lastPosition: last_position,
    });
    res.json({
      message: "Reading progress updated successfully",
      progress,
    });
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  getMe,
  getById,
  updateMe,
  uploadMyAvatar,
  deleteMyAvatar,
  listMyReadingProgress,
  getMyReadingProgressByStory,
  upsertMyReadingProgress,
};
