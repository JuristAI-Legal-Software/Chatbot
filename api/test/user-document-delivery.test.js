const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const chatProxy = fs.readFileSync(path.join(repoRoot, 'Atticus-Back-End', 'AI_Logic', 'Chat', 'Lambda_chat_proxy.py'), 'utf8');
const djangoMcp = fs.readFileSync(path.join(repoRoot, 'django-hub', 'mcp_server', 'server.py'), 'utf8');
const djangoView = fs.readFileSync(path.join(repoRoot, 'django-hub', 'jurist_backend', 'core', 'api', 'views.py'), 'utf8');

describe('user document delivery tool contract', () => {
  test('chat proxy publishes list and send tools with exact operation IDs', () => {
    expect(chatProxy).toMatch(/"name": "list_uploaded_documents"/);
    expect(chatProxy).toMatch(/"operationIds": \["list-uploaded-documents", "user-document-delivery"\]/);
    expect(chatProxy).toMatch(/"name": "send_uploaded_documents"/);
    expect(chatProxy).toMatch(/"operationIds": \["send-uploaded-documents", "user-document-delivery"\]/);
  });

  test('django-hub MCP registers both tools on the authorized API route', () => {
    expect(djangoMcp).toMatch(/async def list_uploaded_documents\(ctx: Context, case_id: str\)/);
    expect(djangoMcp).toMatch(/async def send_uploaded_documents\(/);
    expect((djangoMcp.match(/\/api\/user-document-delivery\//g) || []).length).toBe(2);
    expect(djangoMcp).toMatch(/"mode": "list", "caseId": case_id/);
    expect(djangoMcp).toMatch(/"mode": "send", "caseId": case_id, "zip": bool\(zip_requested\)/);
  });

  test('django derives the send recipient from the authenticated user', () => {
    expect(djangoView).toMatch(/payload\["recipientEmail"\] = email/);
    expect(djangoView).toMatch(/class UserDocumentDeliveryView\(AuthenticatedCaseScopedLambdaAPIView\)/);
  });
});
