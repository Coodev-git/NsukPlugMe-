'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/chat.controller');
const { protect } = require('../middleware/auth');

router.get ('/',             protect, ctrl.myChats);
router.get ('/:chatId',      protect, ctrl.getChatMessages);
router.post('/:chatId/send', protect, ctrl.sendMessage);

module.exports = router;
