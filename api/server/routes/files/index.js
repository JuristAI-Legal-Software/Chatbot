const express = require('express');
const {
  createFileLimiters,
  configMiddleware,
  requireJwtAuth,
  uaParser,
  checkBan,
} = require('~/server/middleware');
const { restoreTenantContextFromReq } = require('@librechat/api');
const { avatar: asstAvatarRouter } = require('~/server/routes/assistants/v1');
const { avatar: agentAvatarRouter } = require('~/server/routes/agents/v1');
const { createMulterInstance } = require('./multer');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');
const speech = require('./speech');

const initialize = async () => {
  const router = express.Router();
  router.use(requireJwtAuth);
  router.use(configMiddleware);
  router.use(checkBan);
  router.use(uaParser);

  const upload = await createMulterInstance();
  router.post('/speech/stt', upload.single('audio'), restoreTenantContextFromReq);

  /* Important: speech route must be added before the upload limiters */
  router.use('/speech', speech);

  const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

  /** Apply rate limiters to all POST routes and to GET routes that touch
   *  user files / downloads / previews. The `/speech` sub-router has its
   *  own limiting and is excluded. Closes CodeQL `js/missing-rate-limiting`
   *  on the GET handlers in `files.js` (list, preview, download, etc.). */
  const RATE_LIMITED_GET_PREFIXES = ['/agent/', '/code/download/', '/download/', '/download-url/'];
  const shouldRateLimitGet = (req) => {
    if (req.method !== 'GET') {
      return false;
    }
    if (req.path === '/') {
      return true;
    }
    if (RATE_LIMITED_GET_PREFIXES.some((p) => req.path.startsWith(p))) {
      return true;
    }
    return req.path.endsWith('/preview');
  };
  router.use((req, res, next) => {
    const isPost = req.method === 'POST' && !req.path.startsWith('/speech');
    if (isPost || shouldRateLimitGet(req)) {
      return fileUploadIpLimiter(req, res, (err) => {
        if (err) {
          return next(err);
        }
        return fileUploadUserLimiter(req, res, next);
      });
    }
    next();
  });

  router.post('/', upload.single('file'), restoreTenantContextFromReq);
  router.post('/images', upload.single('file'), restoreTenantContextFromReq);
  router.post('/images/avatar', upload.single('file'), restoreTenantContextFromReq);
  router.post(
    '/images/agents/:agent_id/avatar',
    upload.single('file'),
    restoreTenantContextFromReq,
  );
  router.post(
    '/images/assistants/:assistant_id/avatar',
    upload.single('file'),
    restoreTenantContextFromReq,
  );

  router.use('/', files);
  router.use('/images', images);
  router.use('/images/avatar', avatar);
  router.use('/images/agents', agentAvatarRouter);
  router.use('/images/assistants', asstAvatarRouter);
  return router;
};

module.exports = { initialize };
