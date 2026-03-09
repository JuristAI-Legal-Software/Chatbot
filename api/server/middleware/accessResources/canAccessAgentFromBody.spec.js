jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  Constants: {
    EPHEMERAL_AGENT_ID: 'ephemeral_agent_id',
  },
  ResourceType: {
    AGENT: 'agent',
  },
  isAgentsEndpoint: (endpoint) => endpoint === 'agents',
  isEphemeralAgentId: (agentId) => !String(agentId ?? '').startsWith('agent_'),
}));

jest.mock('./canAccessResource', () => ({
  canAccessResource: jest.fn(),
}));

jest.mock('~/models/Agent', () => ({
  getAgent: jest.fn(),
}));

describe('canAccessAgentFromBody default agent', () => {
  const { canAccessResource } = require('./canAccessResource');
  const { canAccessAgentFromBody } = require('./canAccessAgentFromBody');

  let res;
  let next;
  let delegatedMiddleware;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    delegatedMiddleware = jest.fn((_req, _res, middlewareNext) => middlewareNext());
    canAccessResource.mockReturnValue(delegatedMiddleware);
    jest.clearAllMocks();
  });

  test('uses DEFAULT_AGENT_ID when endpoint is agents and agent_id is missing', async () => {
    const req = {
      body: {
        endpoint: 'agents',
      },
      params: {},
    };

    const middleware = canAccessAgentFromBody({ requiredPermission: 1 });
    await middleware(req, res, next);

    expect(canAccessResource).toHaveBeenCalledTimes(1);
    const forwardedReq = delegatedMiddleware.mock.calls[0][0];
    expect(forwardedReq.params.agent_id).toBe('agent_lhpnDhDHKBbh96Ra1s1Qu');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
