const express = require("express");
const router = express.Router();

const genreController = require("./genre.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.get("/", genreController.getGenres);
router.get("/:id", genreController.getById);

router.post("/", authenticate, authorize("admin"), genreController.createGenre);
router.patch("/:id", authenticate, authorize("admin"), genreController.updateGenre);
router.delete("/:id", authenticate, authorize("admin"), genreController.deleteGenre);

module.exports = router;
