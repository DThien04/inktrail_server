const { handleError } = require("../../utils/error_handle");
const userService = require("./user.service");

const listAdminUsers = async (req, res) => {
  try {
    const users = await userService.listAdminUsers({
      query: req.query.query,
      role: req.query.role,
    });
    res.json(users);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  listAdminUsers,
};

