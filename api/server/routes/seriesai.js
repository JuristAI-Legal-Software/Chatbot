const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();
const COLLECTION = 'SeriesAIPendingActions';
const VALID_APPS = new Set(['3', '4']);
const TOOL_REQUIREMENTS = {
  triggerSafeDraft: ['investorName', 'investorEmail', 'investmentAmount'],
  sendRoundUpdate: ['roundId'],
  queryCapTableOwnership: [],
  scheduleComplianceDeadline: ['deadlineType', 'dueDate'],
  requestSignaturesViaEmail: ['documentInstanceId', 'signers'],
  inviteExternalParticipant: ['participantType', 'organizationName', 'primaryContactName', 'primaryContactEmail', 'roleInDeal', 'accessScope'],
};
const APPROVAL_TOOLS = new Set(['triggerSafeDraft', 'requestSignaturesViaEmail']);

function normalizeContext(body) {
  const appId = String(body?.appId ?? '').trim();
  const organizationId = String(body?.organizationId ?? '').trim();
  if (!VALID_APPS.has(appId) || !organizationId) return null;
  return { appId, organizationId };
}

function validateTool(toolName, body) {
  if (!Object.prototype.hasOwnProperty.call(TOOL_REQUIREMENTS, toolName)) return 'unknown SeriesAI tool';
  const context = normalizeContext(body);
  if (!context) return 'appId 3/4 and organizationId are required';
  const missing = TOOL_REQUIREMENTS[toolName].filter((key) => body?.[key] === undefined || body?.[key] === null || body?.[key] === '');
  if (missing.length) return `missing required parameters: ${missing.join(', ')}`;
  if (toolName === 'requestSignaturesViaEmail' && (!Array.isArray(body.signers) || body.signers.length === 0)) return 'signers must be a non-empty array';
  return null;
}

function backendUrl() {
  return String(process.env.SERIESAI_TOOL_BACKEND_URL || '').trim().replace(/\/$/, '');
}

async function invokeBackend(path, payload, req) {
  const base = backendUrl();
  if (!base) {
    const error = new Error('SERIESAI_TOOL_BACKEND_URL is not configured');
    error.status = 503;
    throw error;
  }
  const response = await axios.post(`${base}${path}`, payload, {
    timeout: Number(process.env.SERIESAI_TOOL_BACKEND_TIMEOUT_MS || 15000),
    headers: { authorization: req.headers.authorization || '', 'x-seriesai-user-id': String(req.user?.id || req.user?._id || '') },
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    const error = new Error(response.data?.error || 'SeriesAI backend request failed');
    error.status = response.status;
    throw error;
  }
  return response.data;
}

router.post('/tools/:toolName/execute', requireJwtAuth, async (req, res) => {
  const toolName = String(req.params.toolName || '').trim();
  const validationError = validateTool(toolName, req.body);
  const userId = String(req.user?.id || req.user?._id || '').trim();
  if (validationError || !userId) return res.status(400).json({ error: validationError || 'authentication is required' });
  const context = normalizeContext(req.body);
  const requestId = String(req.body.requestId || crypto.createHash('sha256').update(`${userId}:${context.organizationId}:${toolName}:${JSON.stringify(req.body)}`).digest('hex')).slice(0, 128);
  const payload = { ...req.body, toolName, requestId, userId, appId: context.appId, organizationId: context.organizationId };
  try {
    const result = await invokeBackend('/tools/execute', payload, req);
    if (APPROVAL_TOOLS.has(toolName)) {
      await mongoose.connection.collection(COLLECTION).updateOne(
        { requestId },
        { $setOnInsert: { requestId, toolName, userId, appId: context.appId, organizationId: context.organizationId, payload, backendResult: result, status: 'pending', awaitingUserResponse: true, createdAt: new Date(), updatedAt: new Date() } },
        { upsert: true },
      );
      return res.status(202).json({ ...result, requestId, pendingActionId: requestId, awaitingUserResponse: true, status: 'pending' });
    }
    return res.json({ ...result, requestId });
  } catch (error) {
    return res.status(Number(error.status) || 502).json({ error: error.message || 'SeriesAI tool execution failed', requestId });
  }
});

router.post('/pending-actions/:requestId/resolve', requireJwtAuth, async (req, res) => {
  const requestId = String(req.params.requestId || '').trim();
  const context = normalizeContext(req.body);
  const userId = String(req.user?.id || req.user?._id || '').trim();
  const decision = req.body?.decision === 'reject' ? 'rejected' : req.body?.decision === 'approve' ? 'approved' : null;
  if (!requestId || !context || !userId || !decision) return res.status(400).json({ error: 'requestId, appId 3/4, organizationId, authentication, and decision are required' });

  const collection = mongoose.connection.collection(COLLECTION);
  const now = new Date();
  const filter = { requestId, userId, appId: context.appId, organizationId: context.organizationId, status: 'pending' };
  const result = await collection.updateOne(filter, { $set: { status: 'resolving', resolvedBy: userId, updatedAt: now } });
  if (result.matchedCount !== 1) {
    const existing = await collection.findOne({ requestId, userId, appId: context.appId, organizationId: context.organizationId });
    if (existing && existing.status === decision) return res.json({ requestId, status: decision, idempotent: true });
    if (!existing) return res.status(404).json({ error: 'pending action not found' });
    return res.status(409).json({ error: 'pending action is already being resolved or resolved', status: existing.status });
  }

  try {
    const action = await invokeBackend(`/pending-actions/${encodeURIComponent(requestId)}/resolve`, { requestId, decision, approvalToken: req.body.approvalToken, appId: context.appId, organizationId: context.organizationId, userId }, req);
    await collection.updateOne({ requestId, userId, appId: context.appId, organizationId: context.organizationId, status: 'resolving' }, { $set: { status: decision, awaitingUserResponse: false, resolvedAt: now, backendResult: action, updatedAt: now } });
    return res.json({ requestId, status: decision, idempotent: false, result: action });
  } catch (error) {
    await collection.updateOne({ requestId, userId, appId: context.appId, organizationId: context.organizationId, status: 'resolving' }, { $set: { status: 'pending', lastError: error.message, updatedAt: new Date() } });
    return res.status(Number(error.status) || 502).json({ error: error.message || 'pending action resolution failed' });
  }
});

module.exports = router;
