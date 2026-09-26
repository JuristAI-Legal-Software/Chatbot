import { describe, expect, it, jest } from '@jest/globals';
import type { TokenUsage, TxMetadata } from '~/agents/transactions';
import { createThreadUsageRecorder } from './usage';

describe('createThreadUsageRecorder', () => {
  it('passes token counts and transaction config to the injected writer', async () => {
    const spendTokens = jest.fn(
      async (_metadata: TxMetadata, _usage: TokenUsage): Promise<void> => undefined,
    );
    const recordUsage = createThreadUsageRecorder(spendTokens);

    await recordUsage({
      prompt_tokens: 10,
      completion_tokens: 5,
      model: 'gpt-4.1',
      user: 'user-1',
      conversationId: 'conversation-1',
      transactions: { enabled: false },
    });

    expect(spendTokens).toHaveBeenCalledWith(
      {
        user: 'user-1',
        model: 'gpt-4.1',
        context: 'message',
        conversationId: 'conversation-1',
        transactions: { enabled: false },
      },
      { promptTokens: 10, completionTokens: 5 },
    );
  });
});
