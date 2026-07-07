const jwt = require('jsonwebtoken');
const {
  createActionTool,
  isChatMintedActionDomain,
  generateChatMintedToken,
} = require('../ActionService');

/**
 * Real-logic tests for per-user chat-minted JWT injection in createActionTool._call.
 * Only the request executor boundary is faked so we can capture the exact
 * auth headers handed to the OpenAPI request executor.
 */
const makeRequestBuilder = () => {
  const executor = {
    authHeaders: {},
    setParams(params) {
      this.capturedParams = params;
      return this;
    },
    async setAuth() {
      return this;
    },
    async execute() {
      return { data: { ok: true } };
    },
  };
  const requestBuilder = {
    createExecutor: () => executor,
  };
  return { requestBuilder, executor };
};

const juristaiAction = { metadata: { domain: 'https://api-dev.juristai.org' } };
const externalAction = { metadata: { domain: 'https://api.example.com' } };
const chatUser = { id: '665f1c0ffee1c0ffee1c0ffe', email: 'user@juristai.org' };

describe('chat-minted action auth', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, CHAT_SECRET: 'test-chat-secret' };
    delete process.env.CHAT_MINTED_ACTION_DOMAINS;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('isChatMintedActionDomain', () => {
    it('matches the default juristai.org domain and subdomains', () => {
      expect(isChatMintedActionDomain('https://juristai.org')).toBe(true);
      expect(isChatMintedActionDomain('https://api-dev.juristai.org')).toBe(true);
      expect(isChatMintedActionDomain('api-dev.juristai.org')).toBe(true);
    });

    it('rejects external and suffix-spoofed domains', () => {
      expect(isChatMintedActionDomain('https://api.example.com')).toBe(false);
      expect(isChatMintedActionDomain('https://notjuristai.org')).toBe(false);
      expect(isChatMintedActionDomain('')).toBe(false);
      expect(isChatMintedActionDomain(undefined)).toBe(false);
    });

    it('honors CHAT_MINTED_ACTION_DOMAINS overrides', () => {
      process.env.CHAT_MINTED_ACTION_DOMAINS = 'internal.example.com';
      expect(isChatMintedActionDomain('https://internal.example.com')).toBe(true);
      expect(isChatMintedActionDomain('https://api-dev.juristai.org')).toBe(false);
    });
  });

  describe('generateChatMintedToken', () => {
    it('mints an HS256 token django ChatMintedJWTAuthentication accepts', () => {
      const token = generateChatMintedToken(chatUser);
      const claims = jwt.verify(token, 'test-chat-secret', {
        algorithms: ['HS256'],
        issuer: 'librechat',
      });
      expect(claims.sub).toBe(chatUser.id);
      expect(claims.email).toBe(chatUser.email);
      expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('returns null without a signing secret', () => {
      delete process.env.CHAT_SECRET;
      delete process.env.JWT_SECRET;
      expect(generateChatMintedToken(chatUser)).toBeNull();
    });

    it('returns null without a user email', () => {
      expect(generateChatMintedToken({ id: 'abc' })).toBeNull();
      expect(generateChatMintedToken(null)).toBeNull();
    });
  });

  describe('createActionTool._call injection', () => {
    it('injects a per-user bearer token for juristai domains with no auth configured', async () => {
      const { requestBuilder, executor } = makeRequestBuilder();
      const tool = await createActionTool({
        userId: chatUser.id,
        user: chatUser,
        action: juristaiAction,
        requestBuilder,
      });

      await tool._call({ caseId: 'case-1' });

      const header = executor.authHeaders.Authorization;
      expect(header).toMatch(/^Bearer /);
      const claims = jwt.verify(header.slice('Bearer '.length), 'test-chat-secret', {
        algorithms: ['HS256'],
        issuer: 'librechat',
      });
      expect(claims.email).toBe(chatUser.email);
    });

    it('does not inject for non-allowlisted domains', async () => {
      const { requestBuilder, executor } = makeRequestBuilder();
      const tool = await createActionTool({
        userId: chatUser.id,
        user: chatUser,
        action: externalAction,
        requestBuilder,
      });

      await tool._call({});

      expect(executor.authHeaders.Authorization).toBeUndefined();
    });

    it('does not override explicitly configured action auth', async () => {
      const { requestBuilder, executor } = makeRequestBuilder();
      const tool = await createActionTool({
        userId: chatUser.id,
        user: chatUser,
        action: {
          metadata: {
            domain: 'https://api-dev.juristai.org',
            auth: { type: 'service_http', authorization_type: 'bearer' },
            api_key: 'static-key',
          },
        },
        requestBuilder,
      });

      await tool._call({});

      expect(executor.authHeaders.Authorization).toBeUndefined();
    });

    it('executes unauthenticated when no user is available', async () => {
      const { requestBuilder, executor } = makeRequestBuilder();
      const tool = await createActionTool({
        userId: chatUser.id,
        action: juristaiAction,
        requestBuilder,
      });

      const result = await tool._call({});

      expect(executor.authHeaders.Authorization).toBeUndefined();
      expect(result).toBe(JSON.stringify({ ok: true }));
    });
  });
});
