const { logger } = require('@librechat/data-schemas');
const { isAgentsEndpoint, removeNullishValues, Constants } = require('librechat-data-provider');
const { loadAgent } = require('~/models/Agent');

const DEFAULT_AGENT_ID = process.env.DEFAULT_AGENT_ID ?? 'agent_lhpnDhDHKBbh96Ra1s1Qu';

const readTextValue = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildOptions = (req, endpoint, parsedBody, endpointType) => {
  const {
    spec,
    iconURL,
    agent_id,
    threadId,
    promptId,
    promptVersion,
    openaiConversationId,
    openai_conversation_id,
    prompt_id,
    prompt_version,
    ...model_parameters
  } = parsedBody;
  const resolvedAgentId = isAgentsEndpoint(endpoint)
    ? agent_id || DEFAULT_AGENT_ID
    : Constants.EPHEMERAL_AGENT_ID;
  const normalizedModelParameters = removeNullishValues({
    ...model_parameters,
    openai_conversation_id:
      readTextValue(openai_conversation_id) ??
      readTextValue(openaiConversationId) ??
      readTextValue(threadId),
    prompt_id: readTextValue(prompt_id) ?? readTextValue(promptId),
    prompt_version: readTextValue(prompt_version) ?? readTextValue(promptVersion),
  });

  const agentPromise = loadAgent({
    req,
    spec,
    agent_id: resolvedAgentId,
    endpoint,
    model_parameters: normalizedModelParameters,
  }).catch((error) => {
    logger.error(`[/agents/:${resolvedAgentId}] Error retrieving agent during build options step`, error);
    return undefined;
  });

  /** @type {import('librechat-data-provider').TConversation | undefined} */
  const addedConvo = req.body?.addedConvo;

  return removeNullishValues({
    spec,
    iconURL,
    endpoint,
    agent_id: resolvedAgentId,
    endpointType,
    model_parameters: normalizedModelParameters,
    agent: agentPromise,
    addedConvo,
  });
};

module.exports = { buildOptions };
