const axios = require('axios');

const SERIESAI_APPS = new Set(['3', '4']);
const SERIESAI_TOOL_NAMES = new Set(['triggerSafeDraft', 'sendRoundUpdate', 'queryCapTableOwnership', 'scheduleComplianceDeadline', 'requestSignaturesViaEmail', 'inviteExternalParticipant']);
const TOOL_REQUIRED_FIELDS = { triggerSafeDraft: ['investorName', 'investorEmail', 'investmentAmount'], sendRoundUpdate: ['roundId'], queryCapTableOwnership: [], scheduleComplianceDeadline: ['deadlineType', 'dueDate'], requestSignaturesViaEmail: ['documentInstanceId', 'signers'], inviteExternalParticipant: ['participantType', 'organizationName', 'primaryContactName', 'primaryContactEmail', 'roleInDeal', 'accessScope'] };

const getSeriesAIContext = (req) => {
  const body = req?.body || {};
  const source = body.seriesaiContext || body.metadata || body;
  const appId = String(source.appId ?? '').trim();
  const organizationId = String(source.organizationId ?? '').trim();
  return SERIESAI_APPS.has(appId) && organizationId ? { appId, organizationId } : null;
};

const schemaFor = (name) => ({ type: 'object', properties: { appId: { type: 'string', enum: ['3', '4'] }, organizationId: { type: 'string', minLength: 1 } }, required: ['appId', 'organizationId', ...TOOL_REQUIRED_FIELDS[name]], additionalProperties: true });

const createSeriesAITool = ({ name, req }) => ({
  name,
  description: `SeriesAI organization-scoped action: ${name}.`,
  schema: schemaFor(name),
  async _call(input = {}) {
    const context = getSeriesAIContext(req);
    const appId = String(input.appId ?? context?.appId ?? '').trim();
    const organizationId = String(input.organizationId ?? context?.organizationId ?? '').trim();
    if (!SERIESAI_APPS.has(appId) || !organizationId) throw new Error('SeriesAI tools require appId 3/4 and organizationId');
    const backend = String(process.env.SERIESAI_TOOL_BACKEND_URL || '').trim().replace(/\/$/, '');
    if (!backend) throw new Error('SERIESAI_TOOL_BACKEND_URL is not configured');
    const response = await axios.post(`${backend}/tools/execute`, { ...input, toolName: name, appId, organizationId }, { timeout: Number(process.env.SERIESAI_TOOL_BACKEND_TIMEOUT_MS || 15000), headers: { authorization: req?.headers?.authorization || '' }, validateStatus: () => true });
    if (response.status >= 400) throw new Error(response.data?.error || 'SeriesAI tool execution failed');
    return JSON.stringify(response.data);
  },
  async invoke(input = {}) { return { content: await this._call(input) }; },
});

module.exports = { SERIESAI_APPS, SERIESAI_TOOL_NAMES, TOOL_REQUIRED_FIELDS, getSeriesAIContext, createSeriesAITool };
