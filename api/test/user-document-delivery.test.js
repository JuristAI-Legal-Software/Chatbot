const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const sourcePaths = {
  chatProxy: path.join(repoRoot, 'Atticus-Back-End', 'AI_Logic', 'Chat', 'Lambda_chat_proxy.py'),
  djangoMcp: path.join(repoRoot, 'django-hub', 'mcp_server', 'server.py'),
  djangoView: path.join(repoRoot, 'django-hub', 'jurist_backend', 'core', 'api', 'views.py'),
};
const sourcesAvailable = Object.values(sourcePaths).every((sourcePath) =>
  fs.existsSync(sourcePath),
);

// These files live in sibling repositories in the integrated JuristAI workspace.
// GitHub Actions checks out this repository alone, so leave the contract suite
// skipped there rather than failing during module initialization.
const describeIfSourcesAvailable = sourcesAvailable ? describe : describe.skip;
const chatProxy = sourcesAvailable ? fs.readFileSync(sourcePaths.chatProxy, 'utf8') : '';
const djangoMcp = sourcesAvailable ? fs.readFileSync(sourcePaths.djangoMcp, 'utf8') : '';
const djangoView = sourcesAvailable ? fs.readFileSync(sourcePaths.djangoView, 'utf8') : '';

describeIfSourcesAvailable('user document delivery tool contract', () => {
  test('chat proxy publishes list and send tools with exact operation IDs', () => {
    expect(chatProxy).toMatch(/"name": "list_uploaded_documents"/);
    expect(chatProxy).toMatch(
      /"operationIds": \["list-uploaded-documents", "user-document-delivery"\]/,
    );
    expect(chatProxy).toMatch(/"name": "send_uploaded_documents"/);
    expect(chatProxy).toMatch(
      /"operationIds": \["send-uploaded-documents", "user-document-delivery"\]/,
    );
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
    expect(djangoView).toMatch(
      /class UserDocumentDeliveryView\(AuthenticatedCaseScopedLambdaAPIView\)/,
    );
  });
});
