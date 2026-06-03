const path = require('path');
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
const db = require('~/models');

const router = express.Router();

router.post('/', async (req, res) => {
  const metadata = req.body;
  const appConfig = req.config;

  try {
    filterFile({ req, image: true });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    if (!isAssistantsEndpoint(metadata.endpoint) && metadata.tool_resource != null) {
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
      /* Strip path separators from every segment before joining so a malformed
       * JWT subject or filename cannot escape the per-user image directory.
       * Closes CodeQL `js/path-injection` (req.user.id flows into path.join). */
      const safeUserDir = path.basename(String(req.user.id));
      const safeFilename = path.basename(String(req.file.filename));
      const filepath = path.join(appConfig.paths.imageOutput, safeUserDir, safeFilename);
      await fs.unlink(filepath);
    } catch (error) {
      logger.error('[/files/images] Error deleting file:', error);
    }
    res.status(500).json({ message });
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/files/images] Temp. image upload file deleted');
    } catch {
      logger.debug('[/files/images] Temp. image upload file already deleted');
    }
  }
});

module.exports = router;
