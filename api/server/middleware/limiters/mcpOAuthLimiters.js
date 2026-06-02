const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const MCP_OAUTH_IP_MAX = parseInt(process.env.MCP_OAUTH_IP_MAX, 10) || 30;
  const MCP_OAUTH_IP_WINDOW = parseInt(process.env.MCP_OAUTH_IP_WINDOW, 10) || 10;
  const MCP_OAUTH_USER_MAX = parseInt(process.env.MCP_OAUTH_USER_MAX, 10) || 20;
  const MCP_OAUTH_USER_WINDOW = parseInt(process.env.MCP_OAUTH_USER_WINDOW, 10) || 10;
  const MCP_OAUTH_VIOLATION_SCORE = process.env.MCP_OAUTH_VIOLATION_SCORE;

  const mcpOAuthIpWindowMs = MCP_OAUTH_IP_WINDOW * 60 * 1000;
  const mcpOAuthUserWindowMs = MCP_OAUTH_USER_WINDOW * 60 * 1000;

  return {
    mcpOAuthIpMax: MCP_OAUTH_IP_MAX,
    mcpOAuthIpWindowMs,
    mcpOAuthIpWindowInMinutes: mcpOAuthIpWindowMs / 60000,
    mcpOAuthUserMax: MCP_OAUTH_USER_MAX,
    mcpOAuthUserWindowMs,
    mcpOAuthUserWindowInMinutes: mcpOAuthUserWindowMs / 60000,
    mcpOAuthViolationScore: MCP_OAUTH_VIOLATION_SCORE,
  };
};

const createMCPOAuthHandler = (ip = true) => {
  const {
    mcpOAuthIpMax,
    mcpOAuthIpWindowInMinutes,
    mcpOAuthUserMax,
    mcpOAuthUserWindowInMinutes,
    mcpOAuthViolationScore,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.GENERAL;
    const errorMessage = {
      type,
      max: ip ? mcpOAuthIpMax : mcpOAuthUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? mcpOAuthIpWindowInMinutes : mcpOAuthUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, mcpOAuthViolationScore);
    res.status(429).json({ message: 'Too many MCP OAuth requests. Try again later' });
  };
};

const createMCPOAuthLimiters = () => {
  const { mcpOAuthIpWindowMs, mcpOAuthIpMax, mcpOAuthUserWindowMs, mcpOAuthUserMax } =
    getEnvironmentVariables();

  const mcpOAuthIpLimiter = rateLimit({
    windowMs: mcpOAuthIpWindowMs,
    max: mcpOAuthIpMax,
    handler: createMCPOAuthHandler(),
    keyGenerator: removePorts,
    store: limiterCache('mcp_oauth_ip_limiter'),
  });

  const mcpOAuthUserLimiter = rateLimit({
    windowMs: mcpOAuthUserWindowMs,
    max: mcpOAuthUserMax,
    handler: createMCPOAuthHandler(false),
    keyGenerator: function (req) {
      return req.user?.id;
    },
    store: limiterCache('mcp_oauth_user_limiter'),
  });

  return { mcpOAuthIpLimiter, mcpOAuthUserLimiter };
};

module.exports = { createMCPOAuthLimiters };
