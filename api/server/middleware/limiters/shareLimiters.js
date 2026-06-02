const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const SHARE_IP_MAX = parseInt(process.env.SHARE_IP_MAX, 10) || 60;
  const SHARE_IP_WINDOW = parseInt(process.env.SHARE_IP_WINDOW, 10) || 15;
  const SHARE_USER_MAX = parseInt(process.env.SHARE_USER_MAX, 10) || 30;
  const SHARE_USER_WINDOW = parseInt(process.env.SHARE_USER_WINDOW, 10) || 15;
  const SHARE_VIOLATION_SCORE = process.env.SHARE_VIOLATION_SCORE;

  const shareIpWindowMs = SHARE_IP_WINDOW * 60 * 1000;
  const shareUserWindowMs = SHARE_USER_WINDOW * 60 * 1000;

  return {
    shareIpMax: SHARE_IP_MAX,
    shareIpWindowMs,
    shareIpWindowInMinutes: shareIpWindowMs / 60000,
    shareUserMax: SHARE_USER_MAX,
    shareUserWindowMs,
    shareUserWindowInMinutes: shareUserWindowMs / 60000,
    shareViolationScore: SHARE_VIOLATION_SCORE,
  };
};

const createShareHandler = (ip = true) => {
  const {
    shareIpMax,
    shareIpWindowInMinutes,
    shareUserMax,
    shareUserWindowInMinutes,
    shareViolationScore,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.GENERAL;
    const errorMessage = {
      type,
      max: ip ? shareIpMax : shareUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? shareIpWindowInMinutes : shareUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, shareViolationScore);
    res.status(429).json({ message: 'Too many shared link requests. Try again later' });
  };
};

const createShareLimiters = () => {
  const { shareIpWindowMs, shareIpMax, shareUserWindowMs, shareUserMax } =
    getEnvironmentVariables();

  const shareIpLimiter = rateLimit({
    windowMs: shareIpWindowMs,
    max: shareIpMax,
    handler: createShareHandler(),
    keyGenerator: removePorts,
    store: limiterCache('share_ip_limiter'),
  });

  const shareUserLimiter = rateLimit({
    windowMs: shareUserWindowMs,
    max: shareUserMax,
    handler: createShareHandler(false),
    keyGenerator: function (req) {
      return req.user?.id;
    },
    store: limiterCache('share_user_limiter'),
  });

  return { shareIpLimiter, shareUserLimiter };
};

module.exports = { createShareLimiters };
