import type { Agent, AgentModelParameters } from 'librechat-data-provider';
import type { LoadAgentDeps, LoadAgentParams } from '../load';
import { loadAgent } from '../load';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/app/config', () => ({
  getCustomEndpointConfig: jest.fn(),
}));

const makeAgent = (overrides: Partial<Agent> = {}): Agent =>
  ({
    id: 'agent_case_context',
    provider: 'openai',
    model: 'gpt-4o',
    instructions: 'Stored author instructions.',
    ...overrides,
  }) as Agent;

const makeParams = (instructions?: string): LoadAgentParams => ({
  req: {
    user: { id: 'user-1' },
    body: instructions === undefined ? {} : { instructions },
  },
  agent_id: 'agent_case_context',
  endpoint: 'openai',
  model_parameters: { model: 'gpt-4o' } as AgentModelParameters,
});

describe('loadAgent request instructions', () => {
  test('appends trusted per-run case context without mutating stored instructions', async () => {
    const getAgent = jest.fn(async () =>
      makeAgent({ additional_instructions: 'Existing dynamic context.' }),
    );
    const deps: LoadAgentDeps = {
      getAgent,
      getMCPServerTools: jest.fn(),
    };

    const result = await loadAgent(
      makeParams('Case context: active caseId is 73181283.'),
      deps,
    );

    expect(result?.instructions).toBe('Stored author instructions.');
    expect(result?.additional_instructions).toBe(
      'Existing dynamic context.\n\nCase context: active caseId is 73181283.',
    );
    expect(getAgent).toHaveBeenCalledWith({ id: 'agent_case_context' });
  });

  test('ignores blank request instructions and leaves dynamic context unchanged', async () => {
    const agent = makeAgent({ additional_instructions: 'Existing dynamic context.' });
    const deps: LoadAgentDeps = {
      getAgent: jest.fn(async () => agent),
      getMCPServerTools: jest.fn(),
    };

    const result = await loadAgent(makeParams('   '), deps);

    expect(result?.additional_instructions).toBe('Existing dynamic context.');
    expect(result?.instructions).toBe('Stored author instructions.');
  });
});
