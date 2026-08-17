// This unit lane exercises only ActionService request shaping. Prevent the
// unrelated provider/cache/model import graph from booting during collection.
jest.mock('@librechat/agents', () => ({ GraphEvents: {}, sleep: jest.fn() }));
jest.mock('@librechat/agents/langchain/tools', () => ({ tool: jest.fn((call) => ({ _call: call })) }));
jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
  encryptV2: jest.fn(async (value) => value),
  decryptV2: jest.fn(async (value) => value),
}));
jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  logAxiosError: jest.fn(({ error }) => `error:${error?.message || 'unknown'}`),
  refreshAccessToken: jest.fn(),
  GenerationJobManager: { emitChunk: jest.fn() },
  createSSRFSafeAgents: jest.fn(),
  validateActionOAuthMetadata: jest.fn(),
}));
jest.mock('librechat-data-provider', () => ({
  Time: { TWO_MINUTES: 120000 },
  CacheKeys: { ENCODED_DOMAINS: 'encoded-domains', FLOWS: 'flows' },
  StepTypes: { TOOL_CALLS: 'tool_calls' },
  Constants: {},
  AuthTypeEnum: { None: 'none', OAuth: 'oauth' },
  actionDelimiter: '---',
  isImageVisionTool: jest.fn(() => false),
  actionDomainSeparator: '---',
}));
jest.mock('~/models', () => ({
  findToken: jest.fn(), updateToken: jest.fn(), createToken: jest.fn(),
  getActions: jest.fn(), deleteActions: jest.fn(), deleteAssistant: jest.fn(),
}));
jest.mock('~/config', () => ({ getFlowStateManager: jest.fn() }));
jest.mock('~/cache', () => ({ getLogStores: jest.fn(() => ({})) }));

const { createActionTool } = require('../ActionService');

/**
 * Real-logic tests for server-injected params (caseId) in createActionTool._call.
 * Only the request executor boundary is faked so we can capture the exact params
 * handed to the OpenAPI request builder.
 */
const makeRequestBuilder = () => {
  const state = { capturedParams: undefined };
  const requestBuilder = {
    createExecutor: () => ({
      setParams: (params) => {
        state.capturedParams = params;
        return {
          execute: async () => ({ data: { ok: true } }),
        };
      },
    }),
  };
  return { requestBuilder, state };
};

const baseAction = { metadata: { domain: 'juristai.org' } };

describe('createActionTool caseId injection', () => {
  it('fills caseId when the model omits it', async () => {
    const { requestBuilder, state } = makeRequestBuilder();
    const tool = await createActionTool({
      userId: 'u1',
      action: baseAction,
      requestBuilder,
      injectParams: { caseId: 'case-123' },
    });

    await tool._call({});

    expect(state.capturedParams).toEqual({ caseId: 'case-123' });
  });

  it('does not override a caseId the model already supplied', async () => {
    const { requestBuilder, state } = makeRequestBuilder();
    const tool = await createActionTool({
      userId: 'u1',
      action: baseAction,
      requestBuilder,
      injectParams: { caseId: 'case-123' },
    });

    await tool._call({ caseId: 'model-supplied' });

    expect(state.capturedParams).toEqual({ caseId: 'model-supplied' });
  });

  it('fills caseId when the model supplied an empty string', async () => {
    const { requestBuilder, state } = makeRequestBuilder();
    const tool = await createActionTool({
      userId: 'u1',
      action: baseAction,
      requestBuilder,
      injectParams: { caseId: 'case-123' },
    });

    await tool._call({ caseId: '' });

    expect(state.capturedParams).toEqual({ caseId: 'case-123' });
  });

  it('is a no-op when there are no inject params', async () => {
    const { requestBuilder, state } = makeRequestBuilder();
    const tool = await createActionTool({
      userId: 'u1',
      action: baseAction,
      requestBuilder,
    });

    await tool._call({ foo: 'bar' });

    expect(state.capturedParams).toEqual({ foo: 'bar' });
  });
});
