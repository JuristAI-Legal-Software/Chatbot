import type { RedisStore } from 'rate-limit-redis';
type ClosableClient = {
  quit?: () => Promise<unknown>;
  disconnect?: () => void;
  end?: () => Promise<unknown>;
};

type StoreWithClients = RedisStore & {
  client?: ClosableClient;
  redis?: ClosableClient;
  clientRedis?: ClosableClient;
};

describe('limiterCache', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let testStore: RedisStore | undefined = undefined;

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Set test configuration with fallback defaults for local testing
    process.env.REDIS_PING_INTERVAL = '0';
    process.env.REDIS_KEY_PREFIX = 'Cache-Integration-Test';
    process.env.REDIS_RETRY_MAX_ATTEMPTS = '5';
    process.env.USE_REDIS = process.env.USE_REDIS || 'true';
    process.env.USE_REDIS_CLUSTER = process.env.USE_REDIS_CLUSTER || 'false';
    process.env.REDIS_URI = process.env.REDIS_URI || 'redis://127.0.0.1:6379';

    // Clear require cache to reload modules
    jest.resetModules();
  });

  afterEach(async () => {
    process.env = originalEnv;

    // Close any client attached to testStore (covers various Redis store implementations)
    if (testStore) {
      const maybeClient =
        (testStore as StoreWithClients).client ||
        (testStore as StoreWithClients).redis ||
        (testStore as StoreWithClients).clientRedis;

      if (maybeClient) {
        try {
          // node-redis v4
          if (typeof maybeClient.quit === 'function') {
            await maybeClient.quit();
          }
          // ioredis or cluster
          if (typeof maybeClient.disconnect === 'function') {
            maybeClient.disconnect();
            // allow some time to close sockets
            await new Promise((r) => setTimeout(r, 50));
          }
        } catch (_err) {
          // swallow to avoid masking test failures
        }
      }

      testStore = undefined;
    }

    // Try closing shared clients from redisClients module (if present)
    try {
      const redisClients = await import('../../redisClients');
      const closers: Promise<unknown>[] = [];

      if (redisClients) {
        const maybeClose = (obj: ClosableClient | null | undefined) => {
          if (!obj) return;
          try {
            if (typeof obj.quit === 'function') {
              closers.push(obj.quit());
            } else if (typeof obj.disconnect === 'function') {
              // ioredis.disconnect is synchronous, but call it and allow a tick for sockets to close
              obj.disconnect();
            } else if (typeof obj.end === 'function') {
              closers.push(obj.end());
            }
          } catch (_e) {
            // ignore
          }
        };

        // Common exports to try shutting down
        maybeClose(redisClients.ioredisClient);
        maybeClose(redisClients.redisClient);
        maybeClose(redisClients.clusterClient);
      }

      // await any async quits
      if (closers.length > 0) await Promise.allSettled(closers);
    } catch (_err) {
      // ignore cleanup errors
    }

    jest.resetModules();
  });

  afterAll(async () => {
    // Final cleanup: ensure the shared redisClients are closed fully
    try {
      const redisClients = await import('../../redisClients');
      if (redisClients && typeof redisClients.closeRedisClients === 'function') {
        await redisClients.closeRedisClients();
      } else {
        // Fallback: attempt to individually close known clients (non-fatal)
        const maybeClose = async (c: ClosableClient | null | undefined) => {
          if (!c) return;
          try {
            if (typeof c.quit === 'function') await c.quit();
            if (typeof c.disconnect === 'function') c.disconnect();
          } catch (_e) {
            // swallow
          }
        };
        await maybeClose(
          (redisClients as Partial<Record<'ioredisClient', ClosableClient>>)?.ioredisClient,
        );
        await maybeClose(
          (redisClients as Partial<Record<'clusterClient', ClosableClient>>)?.clusterClient,
        );
      }
    } catch (_err) {
      // ignore
    }
  });

  test('should throw error when prefix is not provided', async () => {
    const cacheFactory = await import('../../cacheFactory');
    expect(() => cacheFactory.limiterCache('')).toThrow('prefix is required');
  });

  test('should return undefined when USE_REDIS is false', async () => {
    process.env.USE_REDIS = 'false';

    const cacheFactory = await import('../../cacheFactory');
    testStore = cacheFactory.limiterCache('test-limiter');

    expect(testStore).toBeUndefined();
  });

  test('should return RedisStore with sendCommand when USE_REDIS is true', async () => {
    const cacheFactory = await import('../../cacheFactory');
    const redisClients = await import('../../redisClients');
    const { ioredisClient } = redisClients;
    testStore = cacheFactory.limiterCache('test-limiter');

    // Wait for Redis connection to be ready
    if (ioredisClient && ioredisClient.status !== 'ready') {
      await new Promise<void>((resolve) => {
        ioredisClient.once('ready', resolve);
      });
    }

    // Verify it returns a RedisStore instance
    expect(testStore).toBeDefined();
    expect(testStore!.constructor.name).toBe('RedisStore');
    expect(testStore!.prefix).toBe('test-limiter:');
    expect(typeof testStore!.sendCommand).toBe('function');

    const testKey = 'user:123';

    // SET operation
    await testStore!.sendCommand('SET', testKey, '1', 'EX', '60');

    // Verify the key was created WITHOUT prefix using ioredis
    // Note: Using call method since get method seems to have issues in test environment
    // Type assertion for ioredis call method
    type RedisClientWithCall = typeof ioredisClient & {
      call: (command: string, key: string) => Promise<string | null>;
    };
    const directValue = await (ioredisClient as RedisClientWithCall).call('GET', testKey);

    expect(directValue).toBe('1');

    // GET operation
    const value = await testStore!.sendCommand('GET', testKey);
    expect(value).toBe('1');

    // INCR operation
    const incremented = await testStore!.sendCommand('INCR', testKey);
    expect(incremented).toBe(2);

    // Verify increment worked with ioredis
    const incrementedValue = await (ioredisClient as RedisClientWithCall).call('GET', testKey);
    expect(incrementedValue).toBe('2');

    // TTL operation
    const ttl = (await testStore!.sendCommand('TTL', testKey)) as number;
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);

    // DEL operation
    const deleted = await testStore!.sendCommand('DEL', testKey);
    expect(deleted).toBe(1);

    // Verify deletion
    const afterDelete = await testStore!.sendCommand('GET', testKey);
    expect(afterDelete).toBeNull();
    const directAfterDelete = await ioredisClient!.get(testKey);
    expect(directAfterDelete).toBeNull();

    // Test error handling
    await expect(testStore!.sendCommand('INVALID_COMMAND')).rejects.toThrow();
  });
});
