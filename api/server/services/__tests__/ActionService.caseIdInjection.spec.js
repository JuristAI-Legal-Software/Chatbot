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
