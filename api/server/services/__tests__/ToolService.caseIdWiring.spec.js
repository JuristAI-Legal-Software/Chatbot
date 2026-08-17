// This file covers two pure request-shaping helpers. ToolService also imports
// the complete tool/provider registry, which makes the test boot unrelated
// database, filesystem, and provider modules. Keep those dependencies out of
// this unit boundary so collection cannot wait on external initialization.
jest.mock('@librechat/api', () => ({}));
jest.mock('@librechat/agents', () => ({}));
jest.mock('@librechat/agents/langchain/tools', () => ({}));
jest.mock('@librechat/data-schemas', () => ({}));
jest.mock('librechat-data-provider', () => ({
  Tools: { execute_code: 'execute_code', file_search: 'file_search', web_search: 'web_search' },
  actionDomainSeparator: '---',
  imageGenTools: new Set(),
}));
jest.mock('../ActionService', () => ({}));
jest.mock('~/server/services/Config', () => ({}));
jest.mock('~/server/services/Files/process', () => ({}));
jest.mock('~/app/clients/tools/util/fileSearch', () => ({}));
jest.mock('~/server/services/Files/Code/process', () => ({}));
jest.mock('~/app/clients/tools/manifest', () => ({ manifestToolMap: {}, toolkits: [] }));
jest.mock('~/server/services/Tools/search', () => ({}));
jest.mock('~/server/services/Tools/mcp', () => ({}));
jest.mock('~/server/services/MCP', () => ({}));
jest.mock('~/server/services/Threads', () => ({}));
jest.mock('~/app/clients/tools/util', () => ({}));
jest.mock('~/config/parsers', () => ({}));
jest.mock('~/models', () => ({}));
jest.mock('~/config', () => ({}));
jest.mock('~/cache', () => ({}));

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
    expect(buildActionInjectParams('case-123', caseScopedSignature)).toEqual({
      caseId: 'case-123',
    });
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
