const express = require('express');
const { createSetBalanceConfig } = require('@librechat/api');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth, createAccessLimiters } = require('../middleware/');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const { accessIpLimiter, accessUserLimiter } = createAccessLimiters();

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

router.get('/', accessIpLimiter, accessUserLimiter, requireJwtAuth, setBalanceConfig, controller);

module.exports = router;
