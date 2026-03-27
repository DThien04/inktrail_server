const { handleError } = require("../../utils/error_handle");
const genreService = require("./genre.service");

const createGenre = async (req, res) => {
  try {
    const { name, slug, description, is_active } = req.body;
    const genre = await genreService.createGenre({
      name,
      slug,
      description,
      isActive: is_active,
    });

    res.status(201).json({
      message: "Tạo thể loại thành công",
      genre,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const getGenres = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === "true";
    const genres = await genreService.getGenres({
      includeInactive,
      keyword: req.query.keyword,
    });
    res.json(genres);
  } catch (err) {
    handleError(err, res);
  }
};

const getById = async (req, res) => {
  try {
    const genre = await genreService.getGenreById(req.params.id);
    res.json(genre);
  } catch (err) {
    handleError(err, res);
  }
};

const updateGenre = async (req, res) => {
  try {
    const { name, slug, description, is_active } = req.body;
    const genre = await genreService.updateGenre({
      genreId: req.params.id,
      name,
      slug,
      description,
      isActive: is_active,
    });

    res.json({
      message: "Cập nhật thể loại thành công",
      genre,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteGenre = async (req, res) => {
  try {
    const hardDelete = req.query.hard === "true";
    const result = await genreService.deleteGenre({
      genreId: req.params.id,
      hardDelete,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  createGenre,
  getGenres,
  getById,
  updateGenre,
  deleteGenre,
};
