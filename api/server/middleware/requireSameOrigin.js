const { createSameOriginGuard } = require('@librechat/api');

const sameOriginGuard = createSameOriginGuard({
  trustedOrigins: [
    process.env.DOMAIN_CLIENT,
    process.env.DOMAIN_SERVER,
    process.env.ADMIN_PANEL_URL,
  ],
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }
  return sameOriginGuard(req, res, next);
};
