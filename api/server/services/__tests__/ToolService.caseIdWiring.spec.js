jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
}));

const { extractRequestCaseId, buildActionInjectParams } = require('../ToolService');

describe('extractRequestCaseId', () => {
  it('reads caseId from request metadata', () => {
    const req = { body: { metadata: { caseId: 'case-123' } } };
    expect(extractRequestCaseId(req)).toBe('case-123');
  });

  it('falls back to the structured conversationId', () => {
    const req = {
      body: {
        conversationId: 'userId:u1|caseId:case-456|threadId:conv_x|tag:research|customId:abc',
      },
    };
    expect(extractRequestCaseId(req)).toBe('case-456');
  });

  it('returns null when no case context is present', () => {
    expect(extractRequestCaseId({ body: { conversationId: 'userId:u1|tag:research' } })).toBeNull();
    expect(extractRequestCaseId({})).toBeNull();
  });
});

describe('buildActionInjectParams', () => {
  const caseScopedSignature = { parameters: { properties: { caseId: {}, contains: {} } } };
  const snakeSignature = { parameters: { properties: { case_id: {} } } };
  const accountSignature = { parameters: { properties: { resultLimit: {} } } };

  it('injects caseId for a tool whose schema declares caseId', () => {
    expect(buildActionInjectParams('case-123', caseScopedSignature)).toEqual({ caseId: 'case-123' });
  });

  it('uses the snake_case param name when that is what the schema declares', () => {
    expect(buildActionInjectParams('case-123', snakeSignature)).toEqual({ case_id: 'case-123' });
  });

  it('does not inject for a tool that does not declare a case param', () => {
    expect(buildActionInjectParams('case-123', accountSignature)).toBeNull();
  });

  it('does not inject when there is no caseId', () => {
    expect(buildActionInjectParams(null, caseScopedSignature)).toBeNull();
  });
});
