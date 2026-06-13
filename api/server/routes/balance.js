const express = require('express');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth, createAccessLimiters } = require('../middleware/');

const { accessIpLimiter, accessUserLimiter } = createAccessLimiters();

router.get('/', accessIpLimiter, accessUserLimiter, requireJwtAuth, controller);

module.exports = router;
