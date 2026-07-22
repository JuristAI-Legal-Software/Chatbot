const axios = require('axios');
const { createSeriesAITool, getSeriesAIContext } = require('./seriesai');

jest.mock('axios');

describe('SeriesAI tool adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SERIESAI_TOOL_BACKEND_URL = 'https://django.example/seriesai';
  });

  it('rejects non-SeriesAI workspace context before calling the backend', async () => {
    const tool = createSeriesAITool({ name: 'queryCapTableOwnership', req: { body: { appId: '2', organizationId: 'org-1' } } });
    await expect(tool._call({})).rejects.toThrow('appId 3/4');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('delegates a scoped tool call with the active auth header', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { requestId: 'req-1' } });
    const req = { body: { appId: '4', organizationId: 'org-1' }, headers: { authorization: 'Bearer token' } };
    const tool = createSeriesAITool({ name: 'queryCapTableOwnership', req });
    await expect(tool._call({ includeScenarios: true })).resolves.toContain('req-1');
    expect(axios.post).toHaveBeenCalledWith(
      'https://django.example/seriesai/tools/execute',
      expect.objectContaining({ toolName: 'queryCapTableOwnership', appId: '4', organizationId: 'org-1', includeScenarios: true }),
      expect.objectContaining({ headers: { authorization: 'Bearer token' } }),
    );
  });

  it('normalizes only canonical workspace contexts', () => {
    expect(getSeriesAIContext({ body: { appId: '3', organizationId: 'org-3' } })).toEqual({ appId: '3', organizationId: 'org-3' });
    expect(getSeriesAIContext({ body: { appId: '1', organizationId: 'org-3' } })).toBeNull();
  });
});
