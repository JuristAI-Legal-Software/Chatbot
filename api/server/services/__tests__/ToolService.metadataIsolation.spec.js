// Keep this regression on a pure required-action boundary. The production
// ToolService imports the complete LibreChat provider registry; loading that
// registry here makes a focused metadata assertion depend on unrelated DB and
// provider initialization.
const mockLoadTools = jest.fn();
const mockLoadActionSets = jest.fn();
const mockCreateActionTool = jest.fn();
const mockDomainParser = jest.fn();
const mockLegacyDomainEncode = jest.fn();
const mockDecryptMetadata = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@librechat/agents/langchain/tools', () => ({
  tool: jest.fn((fn) => fn),
  DynamicStructuredTool: class DynamicStructuredTool {},
}));
jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
  StepTypes: {},
  GraphEvents: {},
  createToolSearch: jest.fn(),
  createBashExecutionTool: jest.fn(),
  Constants: {},
  createBashProgrammaticToolCallingTool: jest.fn(),
}));
jest.mock('librechat-data-provider', () => ({
  Time: {},
  Tools: { execute_code: 'execute_code', file_search: 'file_search', web_search: 'web_search' },
  Constants: { mcp_prefix: 'mcp_', mcp_delimiter: '___', EPHEMERAL_AGENT_ID: 'ephemeral' },
  CacheKeys: {},
  ErrorTypes: { INVALID_ACTION: 'invalid_action' },
  ContentTypes: { TOOL_CALL: 'tool_call' },
  imageGenTools: new Set(),
  EModelEndpoint: { agents: 'agents' },
  EToolResources: {},
  isActionTool: (name) => String(name).includes('_action_'),
  actionDelimiter: '_action_',
  ImageVisionTool: { function: { name: 'image_gen' } },
  openapiToFunction: () => ({
    requestBuilders: { echoMessage: { path: '/echo' } },
    functionSignatures: [{ name: 'echoMessage' }],
    zodSchemas: {},
  }),
  AgentCapabilities: {},
  isEphemeralAgentId: () => false,
  validateActionDomain: () => ({ isValid: true }),
  defaultAgentCapabilities: [],
  validateAndParseOpenAPISpec: () => ({ spec: {}, serverUrl: 'https://api.example.com' }),
}));
jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  getToolkitKey: jest.fn(),
  getUserMCPAuthMap: jest.fn(),
  loadToolDefinitions: jest.fn(),
  GenerationJobManager: jest.fn(),
  isActionDomainAllowed: jest.fn(() => true),
  buildWebSearchContext: jest.fn(),
  buildImageToolContext: jest.fn(),
  buildOAuthToolCallName: jest.fn(),
  buildToolClassification: jest.fn(),
  getMissingCustomUserVars: jest.fn(() => []),
  buildWebSearchDynamicContext: jest.fn(),
  getCodeApiAuthHeaders: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({ getCachedTools: jest.fn(() => ({})) }));
jest.mock('~/server/services/Files/process', () => ({ processFileURL: jest.fn(), uploadImageBuffer: jest.fn() }));
jest.mock('~/app/clients/tools/util/fileSearch', () => ({ primeFiles: jest.fn() }));
jest.mock('~/server/services/Files/Code/process', () => ({ primeFiles: jest.fn() }));
jest.mock('~/app/clients/tools/manifest', () => ({ manifestToolMap: {}, toolkits: [] }));
jest.mock('~/server/services/Tools/search', () => ({ createOnSearchResults: jest.fn() }));
jest.mock('~/server/services/Tools/mcp', () => ({ reinitMCPServer: jest.fn() }));
jest.mock('~/server/services/MCP', () => ({ resolveConfigServers: jest.fn() }));
jest.mock('~/server/services/Threads', () => ({ recordUsage: jest.fn() }));
jest.mock('~/app/clients/tools/util', () => ({ loadTools: (...args) => mockLoadTools(...args) }));
jest.mock('~/config/parsers', () => ({ redactMessage: (value) => String(value) }));
jest.mock('~/models', () => ({ findPluginAuthsByKeys: jest.fn() }));
jest.mock('~/config', () => ({ getFlowStateManager: jest.fn(), getMCPServersRegistry: jest.fn() }));
jest.mock('~/cache', () => ({ getLogStores: jest.fn() }));
jest.mock('../ActionService', () => ({
  loadActionSets: (...args) => mockLoadActionSets(...args),
  legacyDomainEncode: (...args) => mockLegacyDomainEncode(...args),
  decryptMetadata: (...args) => mockDecryptMetadata(...args),
  createActionTool: (...args) => mockCreateActionTool(...args),
  domainParser: (...args) => mockDomainParser(...args),
}));

const { processRequiredActions } = require('../ToolService');

test('keeps built-in and action tool output metadata scoped to each call', async () => {
  const builtInCall = jest.fn().mockResolvedValue('{"value":2}');
  mockLoadTools.mockResolvedValue({ loadedTools: [{ name: 'calculator', _call: builtInCall }] });
  mockLoadActionSets.mockResolvedValue([{ action_id: 'action-a', metadata: {
    domain: 'https://api.example.com', raw_spec: '{}',
  } }]);
  mockDomainParser.mockResolvedValue('shared_dom');
  mockLegacyDomainEncode.mockReturnValue('legacy_dom');
  mockDecryptMetadata.mockImplementation(async (metadata) => metadata);
  mockCreateActionTool.mockResolvedValue({ _call: jest.fn().mockResolvedValue('{"status":"ok"}') });

  const client = {
    req: { user: { id: 'user-1' }, body: { assistant_id: 'assistant-1', model: 'gpt-4o-mini', endpoint: 'openAI' }, config: {} },
    res: {}, apiKey: 'sk-test', mappedOrder: new Map(), seenToolCalls: new Map(), addContentData: jest.fn(),
  };
  await processRequiredActions(client, [
    { tool: 'calculator', toolInput: { input: '1+1' }, toolCallId: 'builtin-1', thread_id: 'thread-1', run_id: 'run-1' },
    { tool: 'echoMessage_action_shared_dom', toolInput: {}, toolCallId: 'action-1', thread_id: 'thread-1', run_id: 'run-1' },
  ]);

  const calls = client.addContentData.mock.calls
    .map(([payload]) => Object.values(payload).find((value) => value?.function?.name))
    .filter(Boolean);
  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ function: expect.objectContaining({ name: 'calculator' }), action: false }),
    expect.objectContaining({ function: expect.objectContaining({ name: 'echoMessage_action_shared_dom' }), action: true }),
  ]));
});
