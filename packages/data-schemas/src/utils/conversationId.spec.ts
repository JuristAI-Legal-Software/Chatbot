import {
  isValidConversationId,
  isUuidConversationId,
  isStructuredConversationId,
} from './conversationId';

/** The exact identifier from the production incident (LitigAI → api-dev). */
const PROD_STRUCTURED_ID =
  'userId:84083408-a051-70d1-f910-749d49645793|caseId:juristai|threadId:conv_69d2f08c97ac8194bf592f3eed58b7fe0fe37d745495bce4|tag:research|customId:crsh0js0x7h';

describe('isUuidConversationId', () => {
  it('accepts an upstream LibreChat UUID', () => {
    expect(isUuidConversationId('9f1d4c2a-1b3e-4f5a-8c7d-2e6b0a9f4c31')).toBe(true);
  });

  it('rejects a structured id', () => {
    expect(isUuidConversationId(PROD_STRUCTURED_ID)).toBe(false);
  });
});

describe('isStructuredConversationId', () => {
  it('accepts the production structured id', () => {
    expect(isStructuredConversationId(PROD_STRUCTURED_ID)).toBe(true);
  });

  it('accepts a structured id without the optional caseId segment', () => {
    expect(
      isStructuredConversationId(
        'userId:84083408-a051-70d1-f910-749d49645793|threadId:conv_69c462ba82f08196|tag:research|customId:crs85g4g8pd',
      ),
    ).toBe(true);
  });

  it('rejects when a required segment is missing', () => {
    expect(
      isStructuredConversationId(
        'userId:84083408-a051-70d1-f910-749d49645793|threadId:conv_69c462ba|tag:research',
      ),
    ).toBe(false);
  });

  it('rejects unknown segment keys', () => {
    expect(
      isStructuredConversationId(
        'userId:abc|threadId:conv_1|tag:research|customId:crs1|role:admin',
      ),
    ).toBe(false);
  });

  it('rejects duplicated segment keys', () => {
    expect(
      isStructuredConversationId(
        'userId:abc|userId:victim|threadId:conv_1|tag:research|customId:crs1',
      ),
    ).toBe(false);
  });

  it('rejects segments with empty values or whitespace', () => {
    expect(isStructuredConversationId('userId:|threadId:conv_1|tag:research|customId:crs1')).toBe(
      false,
    );
    expect(
      isStructuredConversationId('userId:a b|threadId:conv_1|tag:research|customId:crs1'),
    ).toBe(false);
  });

  it('rejects a segment without a separator', () => {
    expect(isStructuredConversationId('userId:abc|threadId|tag:research|customId:crs1')).toBe(
      false,
    );
  });

  it('rejects an over-long id', () => {
    const longId = `userId:${'a'.repeat(600)}|threadId:conv_1|tag:research|customId:crs1`;
    expect(isStructuredConversationId(longId)).toBe(false);
  });
});

describe('isValidConversationId', () => {
  it('accepts both durable identifier shapes', () => {
    expect(isValidConversationId('9f1d4c2a-1b3e-4f5a-8c7d-2e6b0a9f4c31')).toBe(true);
    expect(isValidConversationId(PROD_STRUCTURED_ID)).toBe(true);
  });

  it('rejects junk that the original guard was protecting against', () => {
    expect(isValidConversationId('new')).toBe(false);
    expect(isValidConversationId('')).toBe(false);
    expect(isValidConversationId(undefined)).toBe(false);
    expect(isValidConversationId(null)).toBe(false);
    expect(isValidConversationId(42)).toBe(false);
    expect(isValidConversationId({ conversationId: PROD_STRUCTURED_ID })).toBe(false);
  });
});
