const fs = require('fs').promises;
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { verifyAgentUploadPermission, resolveUploadErrorMessage } = require('@librechat/api');
const { isAssistantsEndpoint } = require('librechat-data-provider');
const {
  processAgentFileUpload,
  processImageFile,
  filterFile,
} = require('~/server/services/Files/process');
const { checkPermission } = require('~/server/services/PermissionService');
const {
  assertSinglePathSegment,
  resolvePathFromTrustedRoot,
} = require('~/server/utils/pathSafety');
const { createFileLimiters } = require('~/server/middleware/limiters/uploadLimiters');
const db = require('~/models');

const router = express.Router();
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

router.post('/', fileUploadIpLimiter, fileUploadUserLimiter, async (req, res) => {
  const metadata = req.body;
  metadata.message_file = metadata.message_file === true || metadata.message_file === 'true';
  const appConfig = req.config;
  const safeUserDir = assertSinglePathSegment('userId', req.user.id);
  const tempFilename = assertSinglePathSegment('filename', req.file.filename);
  const tempUploadPath = resolvePathFromTrustedRoot(
    'image upload path',
    appConfig.paths.uploads,
    'temp',
    safeUserDir,
    tempFilename,
  );

  try {
    filterFile({ req, image: true });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    const isAgentToolUpload =
      !isAssistantsEndpoint(metadata.endpoint) &&
      metadata.agent_id != null &&
      metadata.tool_resource != null;

    if (isAgentToolUpload) {
      const denied = await verifyAgentUploadPermission({
        req,
        res,
        metadata,
        getAgent: db.getAgent,
        checkPermission,
      });
      if (denied) {
        return;
      }
      return await processAgentFileUpload({ req, res, metadata });
    }

    await processImageFile({ req, res, metadata });
  } catch (error) {
    // TODO: delete remote file if it exists
    logger.error('[/files/images] Error processing file:', error);

    const message = resolveUploadErrorMessage(error);

    try {
      const safeFilename = assertSinglePathSegment('filename', req.file.filename);
      const filepath = resolvePathFromTrustedRoot(
        'image output path',
        appConfig.paths.imageOutput,
        safeUserDir,
        safeFilename,
      );
      await fs.unlink(filepath);
    } catch (error) {
      logger.error('[/files/images] Error deleting file:', error);
    }
    res.status(500).json({ message });
  } finally {
    try {
      await fs.unlink(tempUploadPath);
      logger.debug('[/files/images] Temp. image upload file deleted');
    } catch {
      logger.debug('[/files/images] Temp. image upload file already deleted');
    }
  }
});

module.exports = router;
