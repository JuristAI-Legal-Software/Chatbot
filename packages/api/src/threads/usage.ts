import type { TxMetadata, TokenUsage } from '~/agents/transactions';

export interface ThreadUsageParams {
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
  user: string;
  conversationId: string;
  context?: string;
  transactions?: TxMetadata['transactions'];
}

type SpendTokens = (txData: TxMetadata, tokenUsage: TokenUsage) => Promise<unknown>;

/** Builds a thread usage recorder around the host's transaction writer. */
export function createThreadUsageRecorder(spendTokens: SpendTokens) {
  return async ({
    prompt_tokens,
    completion_tokens,
    model,
    user,
    conversationId,
    context = 'message',
    transactions,
  }: ThreadUsageParams): Promise<void> => {
    await spendTokens(
      { user, model, context, conversationId, transactions },
      { promptTokens: prompt_tokens, completionTokens: completion_tokens },
    );
  };
}
