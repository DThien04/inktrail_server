const { handleError } = require("../../utils/error_handle");
const uploadService = require("./upload.service");

const uploadAvatar = async (req, res) => {
  try {
    const { avatar_base64 } = req.body;
    const avatarFile = req.file;
    const user = await uploadService.uploadMyAvatar({
      userId: req.user.id,
      avatarBase64: avatar_base64,
      avatarBuffer: avatarFile?.buffer,
      avatarMimeType: avatarFile?.mimetype,
    });

    res.json({
      message: "Cập nhật avatar thành công",
      user,
    });
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = { uploadAvatar };
