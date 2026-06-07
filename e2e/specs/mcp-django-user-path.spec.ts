import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

const basePath = 'http://localhost:3080/c/';
const initialUrl = `${basePath}new`;
const endpoints = ['google', 'openAI', 'azureOpenAI'];

type MCPTool = {
  description: string;
  name: string;
  pluginKey: string;
};

type MCPServer = {
  authenticated: boolean;
  authConfig: Array<{ authField: string; description?: string; label?: string }>;
  icon: string;
  name: string;
  tools: MCPTool[];
};

type MCPToolsResponse = {
  servers: Record<string, MCPServer>;
};

type MCPServerConfig = {
  title?: string;
};

type MCPServersConfigResponse = Record<string, MCPServerConfig>;

type ToolCallResult = {
  attachments?: unknown[];
  blockIndex?: number;
  conversationId: string;
  messageId: string;
  partIndex?: number;
  result?: unknown;
  toolId: string;
  user: string;
};

type PromptOverride = {
  prompt?: string;
};

type PromptOverrides = Record<string, PromptOverride>;

type ToolOutcome =
  | 'invoked_expected_tool'
  | 'invoked_expected_tool_but_failed'
  | 'invoked_other_tool'
  | 'no_tool_invoked'
  | 'oauth_required'
  | 'skipped_mutation';

function parseBoolean(value: string | undefined, defaultValue = false) {
  if (value == null) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseCsv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function classifyToolSafety(toolName: string) {
  if (
    /^(get|list|search|find|fetch|read|lookup|query|check|validate|preview|inspect|resolve|count|status)/i.test(
      toolName,
    )
  ) {
    return 'read' as const;
  }

  if (
    /^(create|update|delete|remove|add|set|submit|send|write|store|save|upload|cancel|approve|reject|archive|rename|publish|sync|trigger|run|execute)/i.test(
      toolName,
    )
  ) {
    return 'mutation' as const;
  }

  return 'unknown' as const;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isUUID(uuid: string) {
  const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return regex.test(uuid);
}

async function safeJson<T>(response: { json(): Promise<unknown>; text(): Promise<string> }) {
  try {
    return (await response.json()) as T;
  } catch {
    return { raw: await response.text() } as T;
  }
}

async function loadPromptOverrides() {
  const overridesPath = process.env.E2E_MCP_USER_PROMPTS_PATH;
  if (!overridesPath) {
    return {} as PromptOverrides;
  }

  const raw = await fs.readFile(overridesPath, 'utf8');
  return JSON.parse(raw) as PromptOverrides;
}

async function clearConvos(page: import('@playwright/test').Page) {
  await page.goto(initialUrl, { timeout: 5000 });
  await page.getByRole('button', { name: 'test' }).click();
  await page.getByText('Settings').click();
  await page.getByTestId('clear-convos-initial').click();
  await page.getByTestId('clear-convos-confirm').click();
  await page.waitForSelector('[data-testid="convo-icon"]', { state: 'detached' });
  await page.getByRole('button', { name: 'Close' }).click();
}

function waitForServerStream(response: import('@playwright/test').Response) {
  return response.url().includes('/api/agents') && response.status() === 200;
}

async function openEndpointMenu(page: import('@playwright/test').Page, endpoint = endpoints[1]) {
  await page.goto(initialUrl, { timeout: 5000 });
  await page.locator('#new-conversation-menu').click();
  await page.locator(`#${endpoint}`).click();
}

async function openMCPMenu(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /MCP Servers/i }).click();
  await expect(page.getByRole('menu', { name: /MCP Servers/i })).toBeVisible();
}

async function selectOnlyMCPServer(
  page: import('@playwright/test').Page,
  displayName: string,
  serverName: string,
) {
  await openMCPMenu(page);
  const menu = page.getByRole('menu', { name: /MCP Servers/i });
  const items = menu.getByRole('menuitemcheckbox');
  const itemCount = await items.count();

  for (let index = 0; index < itemCount; index += 1) {
    const item = items.nth(index);
    const isChecked = (await item.getAttribute('aria-checked')) === 'true';
    const label = (await item.getAttribute('aria-label')) ?? '';
    const isTarget =
      new RegExp(escapeRegex(displayName), 'i').test(label) ||
      new RegExp(escapeRegex(serverName), 'i').test(label);

    if (isChecked && !isTarget) {
      await item.click();
    }
  }

  const target =
    menu.getByRole('menuitemcheckbox', {
      name: new RegExp(`${escapeRegex(displayName)}|${escapeRegex(serverName)}`, 'i'),
    }) ?? items.first();
  const targetChecked = (await target.getAttribute('aria-checked')) === 'true';
  if (!targetChecked) {
    await target.click();
  }

  await page.keyboard.press('Escape');
}

async function submitPrompt(page: import('@playwright/test').Page, prompt: string) {
  await page.locator('form').getByRole('textbox').click();
  await page.locator('form').getByRole('textbox').fill(prompt);

  const [response] = await Promise.all([
    page.waitForResponse(waitForServerStream, { timeout: 120000 }),
    page.locator('form').getByRole('textbox').press('Enter'),
  ]);

  const responseBody = await response.body();
  expect(responseBody.includes('"final":true')).toBe(true);
}

async function getConversationId(page: import('@playwright/test').Page) {
  const currentUrl = page.url();
  const currentId = currentUrl.split(basePath).pop() ?? '';
  if (isUUID(currentId)) {
    return currentId;
  }

  await page.getByTestId('convo-icon').first().click({ timeout: 5000 });
  const convoUrl = page.url();
  const conversationId = convoUrl.split(basePath).pop() ?? '';
  expect(isUUID(conversationId)).toBeTruthy();
  return conversationId;
}

function buildPrompt(serverDisplayName: string, serverName: string, tool: MCPTool) {
  return [
    `Use the "${tool.name}" tool from the "${serverDisplayName}" MCP server.`,
    'Act like a careful end user trying the smallest safe real request possible.',
    'Prefer a read-only action with a simple test input.',
    'If the tool needs authentication, required account context, or missing arguments, say exactly that.',
    'Do not use a different tool unless the requested one is unavailable.',
    `Server key: ${serverName}.`,
  ].join(' ');
}

function stringifyResult(result: unknown) {
  if (typeof result === 'string') {
    return result;
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

test.describe('Django MCP user path', () => {
  let beforeAfterAllPage: import('@playwright/test').Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    beforeAfterAllPage = await context.newPage();
    await clearConvos(beforeAfterAllPage);
  });

  test.afterAll(async () => {
    await beforeAfterAllPage?.close();
  });

  test('drives Django/JuristAI MCP tools through normal chat usage', async ({ page }, testInfo) => {
    test.setTimeout(480000);

    const endpoint = process.env.E2E_TOOL_ENDPOINT ?? endpoints[1];
    const includeMutatingTools = parseBoolean(process.env.E2E_MCP_INCLUDE_MUTATING, false);
    const failOnFailure = parseBoolean(process.env.E2E_MCP_FAIL_ON_FAILURE, false);
    const exactServerNames = parseCsv(process.env.E2E_MCP_SERVER_NAMES);
    const serverMatch = process.env.E2E_MCP_SERVER_MATCH ?? '(django|juristai)';
    const promptOverrides = await loadPromptOverrides();
    const matcher = new RegExp(serverMatch, 'i');

    const [toolsResponse, serverConfigResponse] = await Promise.all([
      page.request.get('http://localhost:3080/api/mcp/tools'),
      page.request.get('http://localhost:3080/api/mcp/servers'),
    ]);
    expect(toolsResponse.ok()).toBeTruthy();
    expect(serverConfigResponse.ok()).toBeTruthy();

    const toolsData = await safeJson<MCPToolsResponse>(toolsResponse);
    const serverConfigs = await safeJson<MCPServersConfigResponse>(serverConfigResponse);

    const selectedServers = Object.entries(toolsData.servers).filter(([serverName, serverData]) => {
      if (!serverData.tools.length) {
        return false;
      }
      if (exactServerNames.length > 0) {
        return exactServerNames.includes(serverName);
      }
      return matcher.test(serverName);
    });

    expect(
      selectedServers.length,
      `No MCP servers matched the Django filter. Available servers: ${Object.keys(toolsData.servers).join(', ') || '(none)'}`,
    ).toBeGreaterThan(0);

    const report = {
      generatedAt: new Date().toISOString(),
      filters: {
        endpoint,
        exactServerNames,
        failOnFailure,
        includeMutatingTools,
        serverMatch,
      },
      results: [] as Array<{
        actualToolIds: string[];
        conversationId: string;
        displayName: string;
        outcome: ToolOutcome;
        prompt: string;
        resultPreview?: string;
        safety: 'mutation' | 'read' | 'unknown';
        serverName: string;
        toolName: string;
        visibleAuthPrompt: boolean;
        visibleServerSubtitle: boolean;
        visibleToolName: boolean;
      }>,
    };

    for (const [serverName, serverData] of selectedServers) {
      const displayName = serverConfigs[serverName]?.title || serverName;

      for (const tool of serverData.tools) {
        const safety = classifyToolSafety(tool.name);
        if (safety === 'mutation' && !includeMutatingTools) {
          report.results.push({
            actualToolIds: [],
            conversationId: '',
            displayName,
            outcome: 'skipped_mutation',
            prompt: '',
            safety,
            serverName,
            toolName: tool.name,
            visibleAuthPrompt: false,
            visibleServerSubtitle: false,
            visibleToolName: false,
          });
          continue;
        }

        await openEndpointMenu(page, endpoint);
        await selectOnlyMCPServer(page, displayName, serverName);

        const override = promptOverrides[`${serverName}.${tool.name}`] ?? promptOverrides[tool.name];
        const prompt = override?.prompt ?? buildPrompt(displayName, serverName, tool);
        await submitPrompt(page, prompt);

        const conversationId = await getConversationId(page);
        const toolCallsResponse = await page.request.get(
          `http://localhost:3080/api/agents/tools/calls?conversationId=${encodeURIComponent(conversationId)}`,
        );
        expect(toolCallsResponse.ok()).toBeTruthy();
        const toolCalls = await safeJson<ToolCallResult[]>(toolCallsResponse);

        const expectedToolId = tool.pluginKey;
        const expectedCalls = toolCalls.filter((call) => call.toolId === expectedToolId);
        const actualToolIds = [...new Set(toolCalls.map((call) => call.toolId))];
        const visibleToolName = await page
          .getByText(new RegExp(escapeRegex(tool.name), 'i'))
          .first()
          .isVisible()
          .catch(() => false);
        const visibleServerSubtitle = await page
          .getByText(new RegExp(`via server\\s+${escapeRegex(serverName)}`, 'i'))
          .first()
          .isVisible()
          .catch(() => false);
        const visibleAuthPrompt = await page
          .getByRole('button', { name: /Sign in to/i })
          .first()
          .isVisible()
          .catch(() => false);

        let outcome: ToolOutcome = 'no_tool_invoked';
        let resultPreview = '';
        if (expectedCalls.length > 0) {
          resultPreview = stringifyResult(expectedCalls[expectedCalls.length - 1].result);
          const lower = resultPreview.toLowerCase();
          if (visibleAuthPrompt || /oauth|authentication|sign in|unauthorized|401/.test(lower)) {
            outcome = 'oauth_required';
          } else if (/tool call failed|error|exception|invalid|required/.test(lower)) {
            outcome = 'invoked_expected_tool_but_failed';
          } else {
            outcome = 'invoked_expected_tool';
          }
        } else if (actualToolIds.length > 0) {
          outcome = 'invoked_other_tool';
        }

        report.results.push({
          actualToolIds,
          conversationId,
          displayName,
          outcome,
          prompt,
          resultPreview,
          safety,
          serverName,
          toolName: tool.name,
          visibleAuthPrompt,
          visibleServerSubtitle,
          visibleToolName,
        });
      }
    }

    const outputPath = testInfo.outputPath('mcp-django-user-path-report.json');
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    await testInfo.attach('mcp-django-user-path-report', {
      contentType: 'application/json',
      path: outputPath,
    });

    const attempted = report.results.filter((result) => result.outcome !== 'skipped_mutation');
    expect(
      attempted.length,
      'No Django/JuristAI MCP tools were attempted. Check the runtime configuration and filters.',
    ).toBeGreaterThan(0);

    if (failOnFailure) {
      const failures = attempted.filter((result) => result.outcome !== 'invoked_expected_tool');
      expect(
        failures,
        `One or more user-path MCP tool attempts did not cleanly succeed:\n${JSON.stringify(failures, null, 2)}`,
      ).toEqual([]);
    }
  });
});
