const express = require("express");
const router = express.Router();

const homeController = require("./home.controller");

router.get("/home/stories/new", homeController.getNewStories);
router.get("/home/stories/hot", homeController.getHotStories);

module.exports = router;
