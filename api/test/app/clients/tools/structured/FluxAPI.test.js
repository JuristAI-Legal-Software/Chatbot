const mockCreateTransaction = jest.fn().mockResolvedValue({});

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}));
jest.mock('@librechat/agents/langchain/tools', () => ({
  Tool: class Tool {},
}));
jest.mock('@librechat/api', () => ({
  createMinimalRetentionRequest: jest.fn(() => ({})),
  getBalanceConfig: jest.fn(() => ({ enabled: true })),
  getTransactionsConfig: jest.fn(() => ({ enabled: true })),
}));
jest.mock('librechat-data-provider', () => ({
  FileContext: { image_generation: 'image_generation' },
  ContentTypes: { IMAGE_URL: 'image_url', TEXT: 'text' },
}));
jest.mock('~/models', () => ({
  createTransaction: mockCreateTransaction,
}));

const FluxAPI = require('~/app/clients/tools/structured/FluxAPI');

describe('FluxAPI image cost accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps dotted Flux endpoints and records one debit per generated image', async () => {
    expect(FluxAPI.getPrice('/v1/flux-pro-1.1-ultra')).toBe(0.06);

    const tool = new FluxAPI({
      override: true,
      userId: 'user-1',
      req: { config: { balance: { enabled: true } } },
    });
    await tool.recordImageCost({ endpoint: '/v1/flux-pro-1.1-ultra' });

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        model: '/v1/flux-pro-1.1-ultra',
        context: 'image_generation',
        tokenType: 'credits',
        rawAmount: -0.06,
      }),
    );
  });

  it('does not create a debit for non-generating actions', async () => {
    const tool = new FluxAPI({ override: true, userId: 'user-1', req: {} });
    await tool.recordImageCost({ endpoint: '/v1/my_finetunes' });
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });
});
