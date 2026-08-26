const express = require('express');
const router = express.Router();
const newsController = require('../controllers/news.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/', authMiddleware, newsController.listNews);

module.exports = router;
