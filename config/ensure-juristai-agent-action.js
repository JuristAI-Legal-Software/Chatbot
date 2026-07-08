const fs = require('fs');
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const {
  actionDelimiter,
  openapiToFunction,
  validateAndParseOpenAPISpec,
} = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const db = require('~/models');
const {
  domainParser,
  legacyDomainEncode,
  encryptMetadata,
} = require('~/server/services/ActionService');

/**
 * Idempotently ensures the JuristAI chat agent has the django-tools OpenAPI
 * Action bound, so a fresh deploy self-heals the config instead of silently
 * shipping an agent with `tools: []` / `actions: null` (see QA finding
 * #CHAT-AGENT-NO-TOOLS-BOUND). Mirrors the exact model operations of
 * POST /agents/actions/:agent_id, but is safe to run repeatedly: it reuses the
 * existing action_id for the domain and no-ops when the agent already carries
 * the expected tools + action.
 *
 * No per-action auth is configured. The paired ActionService change mints a
 * short-lived per-user chat JWT for juristai.org actions at call time, so tool
 * calls run as the chatting user via django's ChatMintedJWTAuthentication.
 *
 * Config (env, all optional — defaults target the deployed dev agent):
 *   JURISTAI_AGENT_ID        agent to bind (default agent_lhpnDhDHKBbh96Ra1s1Qu)
 *   JURISTAI_ACTION_DOMAIN   action domain (default https://api-dev.juristai.org)
 *   JURISTAI_ACTION_SPEC     OpenAPI spec path (default config/juristai-agent-action-spec.json)
 *
 * Usage: node config/ensure-juristai-agent-action.js [--dry-run]
 */

const AGENT_ID = process.env.JURISTAI_AGENT_ID || 'agent_lhpnDhDHKBbh96Ra1s1Qu';
const ACTION_DOMAIN = process.env.JURISTAI_ACTION_DOMAIN || 'https://api-dev.juristai.org';
const SPEC_PATH =
  process.env.JURISTAI_ACTION_SPEC || path.resolve(__dirname, 'juristai-agent-action-spec.json');

function toolName(fn, encodedDomain) {
  return `${fn.function.name}${actionDelimiter}${encodedDomain}`;
}

function sameToolSet(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((tool) => setB.has(tool));
}

/**
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {object} [options.deps] - Injectable dependencies (for tests). Defaults
 *   to the live connect helper, `~/models`, and the ActionService encoders.
 */
async function ensureJuristaiAgentAction({ dryRun = true, deps } = {}) {
  const {
    connect: connectFn = connect,
    getAgent = db.getAgent,
    updateAgent = db.updateAgent,
    getActions = db.getActions,
    updateAction = db.updateAction,
    domainParser: parseDomain = domainParser,
    legacyDomainEncode: legacyEncode = legacyDomainEncode,
    encryptMetadata: encrypt = encryptMetadata,
    agentId = AGENT_ID,
    actionDomain = ACTION_DOMAIN,
    specPath = SPEC_PATH,
  } = deps || {};

  await connectFn();

  const rawSpec = fs.readFileSync(specPath, 'utf8');
  const validation = validateAndParseOpenAPISpec(rawSpec);
  if (!validation.status || !validation.spec) {
    throw new Error(`Invalid OpenAPI spec at ${specPath}: ${validation.message}`);
  }

  const { functionSignatures } = openapiToFunction(validation.spec, true);
  const functions = functionSignatures.map((sig) => sig.toObjectTool());
  if (!functions.length) {
    throw new Error('OpenAPI spec produced no functions');
  }

  const parsedUrl = new URL(
    actionDomain.includes('://') ? actionDomain : `https://${actionDomain}`,
  );
  const domain = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  const encodedDomain = await parseDomain(domain, true);
  const legacyDomain = legacyEncode(domain);

  const agent = await getAgent({ id: agentId });
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const existingActions = (await getActions({ agent_id: agentId }, true)) || [];
  const domainAction = existingActions.find((action) => {
    const currentDomain = action?.metadata?.domain || '';
    return currentDomain === domain || legacyEncode(currentDomain) === legacyDomain;
  });
  const action_id = domainAction?.action_id || require('nanoid').nanoid();

  const nextTools = (agent.tools || [])
    .filter(
      (tool) =>
        !(
          tool &&
          (tool.includes(encodedDomain) || tool.includes(legacyDomain) || tool.includes(action_id))
        ),
    )
    .concat(functions.map((fn) => toolName(fn, encodedDomain)));

  const actionRef = `${encodedDomain}${actionDelimiter}${action_id}`;
  const nextActions = (agent.actions || [])
    .filter((ref) => ref.split(actionDelimiter)[1] !== action_id)
    .concat(actionRef);

  // Comparing tool *names* alone is not sufficient: two catalog builds can
  // share the exact same operationIds while differing in parameter schemas
  // (a required-field fix, a new property, a changed enum). A name-only
  // check would silently skip re-applying a schema-only fix on every future
  // deploy, exactly like it did the first time this class of bug shipped.
  const specUnchanged = domainAction?.metadata?.raw_spec === rawSpec;

  const alreadyBound =
    !!domainAction &&
    sameToolSet(agent.tools || [], nextTools) &&
    (agent.actions || []).includes(actionRef) &&
    specUnchanged;

  const plan = {
    agentId,
    domain,
    action_id,
    reusedExistingAction: !!domainAction,
    functionCount: functions.length,
    toolNames: functions.map((fn) => fn.function.name),
    specUnchanged,
    alreadyBound,
  };

  if (alreadyBound) {
    logger.info('[ensure-juristai-agent-action] already bound; no change', plan);
    return { changed: false, ...plan };
  }

  if (dryRun) {
    logger.info('[ensure-juristai-agent-action] DRY RUN — would bind action', plan);
    return { changed: false, dryRun: true, ...plan };
  }

  const metadata = await encrypt({ domain, raw_spec: rawSpec });

  const updatedAgent = await updateAgent(
    { id: agentId },
    { tools: nextTools, actions: nextActions },
    { updatingUserId: agent.author, forceVersion: true },
  );

  const updateData = { metadata, agent_id: agentId };
  if (!domainAction) {
    updateData.user = agent.author;
  }
  await updateAction({ action_id, agent_id: agentId }, updateData);

  logger.info('[ensure-juristai-agent-action] bound action', {
    ...plan,
    boundTools: (updatedAgent?.tools || []).length,
  });
  return { changed: true, ...plan };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  ensureJuristaiAgentAction({ dryRun })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('[ensure-juristai-agent-action] failed:', error);
      process.exit(1);
    });
}

module.exports = { ensureJuristaiAgentAction };
