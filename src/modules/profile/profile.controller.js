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
    const profile = await profileService.getProfileById({
      profileId: req.params.id,
      requesterId: req.user?.id || null,
    });
    res.json(profile);
  } catch (err) {
    handleError(err, res);
  }
};

const followAuthor = async (req, res) => {
  try {
    const result = await profileService.followAuthor({
      followerId: req.user.id,
      authorId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const unfollowAuthor = async (req, res) => {
  try {
    const result = await profileService.unfollowAuthor({
      followerId: req.user.id,
      authorId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const listFollowedAuthors = async (req, res) => {
  try {
    const authors = await profileService.listFollowedAuthors({
      userId: req.user.id,
      limit: req.query.limit,
    });
    res.json(authors);
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

const changeMyPassword = async (req, res) => {
  try {
    const { old_password, new_password, confirm_new_password } = req.body;

    if (!old_password || !new_password || !confirm_new_password) {
      return res.status(400).json({
        message: "Vui lòng nhập đủ mật khẩu cũ, mật khẩu mới và xác nhận mật khẩu mới",
      });
    }

    const oldPassword = String(old_password);
    const newPassword = String(new_password);
    const confirmNewPassword = String(confirm_new_password);

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        message: "Xác nhận mật khẩu mới không khớp",
      });
    }

    await profileService.changeMyPassword({
      userId: req.user.id,
      oldPassword,
      newPassword,
    });

    return res.json({
      message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại trên thiết bị khác nếu cần.",
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
  followAuthor,
  unfollowAuthor,
  listFollowedAuthors,
  updateMe,
  changeMyPassword,
  uploadMyAvatar,
  deleteMyAvatar,
  listMyReadingProgress,
  getMyReadingProgressByStory,
  upsertMyReadingProgress,
};
