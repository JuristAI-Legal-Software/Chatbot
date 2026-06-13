const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const ACCESS_IP_MAX = parseInt(process.env.ACCESS_IP_MAX, 10) || 120;
  const ACCESS_IP_WINDOW = parseInt(process.env.ACCESS_IP_WINDOW, 10) || 15;
  const ACCESS_USER_MAX = parseInt(process.env.ACCESS_USER_MAX, 10) || 60;
  const ACCESS_USER_WINDOW = parseInt(process.env.ACCESS_USER_WINDOW, 10) || 15;
  const ACCESS_VIOLATION_SCORE = process.env.ACCESS_VIOLATION_SCORE;

  const accessIpWindowMs = ACCESS_IP_WINDOW * 60 * 1000;
  const accessUserWindowMs = ACCESS_USER_WINDOW * 60 * 1000;

  return {
    accessIpMax: ACCESS_IP_MAX,
    accessIpWindowMs,
    accessIpWindowInMinutes: accessIpWindowMs / 60000,
    accessUserMax: ACCESS_USER_MAX,
    accessUserWindowMs,
    accessUserWindowInMinutes: accessUserWindowMs / 60000,
    accessViolationScore: ACCESS_VIOLATION_SCORE,
  };
};

const createAccessHandler = (ip = true) => {
  const {
    accessIpMax,
    accessIpWindowInMinutes,
    accessUserMax,
    accessUserWindowInMinutes,
    accessViolationScore,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.GENERAL;
    const errorMessage = {
      type,
      max: ip ? accessIpMax : accessUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? accessIpWindowInMinutes : accessUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, accessViolationScore);
    res.status(429).json({ message: 'Too many requests. Try again later' });
  };
};

const createAccessLimiters = () => {
  const { accessIpWindowMs, accessIpMax, accessUserWindowMs, accessUserMax } =
    getEnvironmentVariables();

  const accessIpLimiter = rateLimit({
    windowMs: accessIpWindowMs,
    max: accessIpMax,
    handler: createAccessHandler(),
    keyGenerator: removePorts,
    store: limiterCache('access_ip_limiter'),
  });

  const accessUserLimiter = rateLimit({
    windowMs: accessUserWindowMs,
    max: accessUserMax,
    handler: createAccessHandler(false),
    keyGenerator: function (req) {
      return req.user?.id || removePorts(req);
    },
    store: limiterCache('access_user_limiter'),
  });

  return { accessIpLimiter, accessUserLimiter };
};

module.exports = { createAccessLimiters };
