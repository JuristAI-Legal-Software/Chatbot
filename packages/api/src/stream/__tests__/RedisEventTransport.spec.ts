import type { Redis } from 'ioredis';
import { logger } from '@librechat/data-schemas';
import { RedisEventTransport } from '~/stream/implementations/RedisEventTransport';
import { createMockPublisher } from './helpers/publisher';

logger.silent = true;

function createMockSubscriber() {
  return {
    on: jest.fn(),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
  };
}

function getMessageHandler(mockSubscriber: ReturnType<typeof createMockSubscriber>) {
  return mockSubscriber.on.mock.calls.find((call) => call[0] === 'message')?.[1] as (
    channel: string,
    message: string,
  ) => void;
}

describe('RedisEventTransport', () => {
  it('resets stale abort-listener reorder state before the next real subscriber', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );

    const streamId = 'reorder-abort-listener-reuse-test';
    transport.onAbort(streamId, () => {});

    const messageHandler = getMessageHandler(mockSubscriber);
    const channel = `stream:{${streamId}}:events`;

    for (let i = 0; i < 5; i++) {
      await transport.emitChunk(streamId, { index: i });
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: i, data: { index: i } }));
    }

    await mockPublisher.del(`stream:{${streamId}}:seq`);

    const secondRunChunks: unknown[] = [];
    transport.subscribe(streamId, {
      onChunk: (event) => secondRunChunks.push(event),
    });

    messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 0, data: { index: 0 } }));

    expect(secondRunChunks.map((chunk) => (chunk as { index: number }).index)).toEqual([0]);

    transport.destroy();
  });

  it('keeps the Redis channel subscribed while only abort listeners remain', () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );

    const streamId = 'abort-listener-stays-subscribed-test';
    let abortCallbackFired = false;

    transport.onAbort(streamId, () => {
      abortCallbackFired = true;
    });

    const subscription = transport.subscribe(streamId, { onChunk: () => {} });
    subscription.unsubscribe();

    expect(mockSubscriber.unsubscribe).not.toHaveBeenCalled();

    const messageHandler = getMessageHandler(mockSubscriber);
    const channel = `stream:{${streamId}}:events`;
    messageHandler(channel, JSON.stringify({ type: 'abort' }));

    expect(abortCallbackFired).toBe(true);

    transport.cleanup(streamId);
    expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(channel);

    transport.destroy();
  });

  it('retries a transient subscribe failure before resolving ready', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    mockSubscriber.subscribe
      .mockRejectedValueOnce(new Error('temporary subscribe failure'))
      .mockResolvedValue(undefined);

    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );

    const subscription = transport.subscribe('retry-subscribe-test', { onChunk: () => {} });

    await expect(subscription.ready).resolves.toBeUndefined();
    expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(2);

    transport.destroy();
  });

  it('rejects ready when subscribe keeps failing', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    mockSubscriber.subscribe.mockRejectedValue(new Error('permanent subscribe failure'));

    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );

    const subscription = transport.subscribe('failed-subscribe-test', { onChunk: () => {} });

    await expect(subscription.ready).rejects.toThrow('permanent subscribe failure');
    expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(3);

    transport.destroy();
  });
});
