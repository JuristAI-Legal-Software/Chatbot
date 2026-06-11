import { expect, test } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';
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

type RefreshTokenResponse = {
  token?: string;
};

type ToolOutcome =
  | 'invoked_expected_tool'
  | 'invoked_expected_tool_but_failed'
  | 'invoked_other_tool'
  | 'no_tool_invoked'
  | 'oauth_required';

type AccountDataPrompt = {
  expectedServerName: string;
  expectedToolName: string;
  name: string;
  prompt: string;
};

type AccountDataPromptResult = {
  actualToolIds: string[];
  conversationId: string;
  displayName: string;
  expectedToolId: string;
  name: string;
  outcome: ToolOutcome;
  prompt: string;
  resultPreview?: string;
  serverName: string;
  toolName: string;
  visibleAuthPrompt: boolean;
  visibleServerSubtitle: boolean;
  visibleToolName: boolean;
};

const accountDataPrompts: AccountDataPrompt[] = [
  {
    expectedServerName: process.env.E2E_ACCOUNT_DATA_SERVER_NAME ?? 'juristai-django',
    expectedToolName: process.env.E2E_ACCOUNT_DATA_CASES_TOOL ?? 'list_my_cases',
    name: 'current_account_cases',
    prompt: 'what cases are currently on my account',
  },
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isUUID(uuid: string) {
  const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return regex.test(uuid);
}

async function postSessionJson<T>(page: Page, url: string) {
  return page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
      },
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }

    return {
      json,
      ok: response.ok,
      status: response.status,
      text,
    };
  }, url) as Promise<{ json?: T; ok: boolean; status: number; text: string }>;
}

async function getAccessToken(page: Page) {
  const refreshResponse = await postSessionJson<RefreshTokenResponse>(
    page,
    'http://localhost:3080/api/auth/refresh',
  );
  expect(
    refreshResponse.ok,
    `POST /api/auth/refresh bootstrap failed with ${refreshResponse.status}: ${refreshResponse.text}`,
  ).toBeTruthy();
  expect(refreshResponse.json?.token, `No access token returned from refresh: ${refreshResponse.text}`).toBeTruthy();
  return refreshResponse.json?.token as string;
}

async function fetchAuthorizedJson<T>(page: Page, url: string, accessToken: string) {
  return page.evaluate(
    async ({ accessToken: token, targetUrl }) => {
      const response = await fetch(targetUrl, {
        credentials: 'include',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }

      return {
        json,
        ok: response.ok,
        status: response.status,
        text,
      };
    },
    { accessToken, targetUrl: url },
  ) as Promise<{ json?: T; ok: boolean; status: number; text: string }>;
}

function waitForServerStream(response: Response) {
  return response.url().includes('/api/agents') && response.status() === 200;
}

async function clickIfVisible(locator: Locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    return true;
  }

  return false;
}

async function openEndpointMenu(page: Page, endpoint = endpoints[1]) {
  await page.goto(initialUrl, { timeout: 10000 });

  if (page.url() !== initialUrl) {
    await clickIfVisible(page.getByTestId('nav-new-chat-button'));
    await clickIfVisible(page.getByTestId('new-chat-button'));
    await page.waitForURL(initialUrl, { timeout: 10000 }).catch(() => undefined);
  }

  const legacyMenuOpened = await clickIfVisible(page.getByTestId('new-conversation-menu'));
  if (legacyMenuOpened) {
    await clickIfVisible(page.locator(`#${endpoint}`));
  }

  await expect(page.locator('form').getByRole('textbox')).toBeVisible({ timeout: 15000 });
}

async function openMCPMenu(page: Page) {
  await page.getByRole('button', { name: /MCP Servers/i }).click();
  await expect(page.getByRole('menu', { name: /MCP Servers/i })).toBeVisible();
}

async function selectOnlyMCPServer(page: Page, displayName: string, serverName: string) {
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

async function submitPrompt(page: Page, prompt: string) {
  const input = page.locator('form').getByRole('textbox');
  await input.click();
  await input.fill(prompt);

  const [response] = await Promise.all([
    page.waitForResponse(waitForServerStream, { timeout: 120000 }),
    input.press('Enter'),
  ]);

  const responseBody = await response.body();
  expect(responseBody.includes('"final":true')).toBe(true);
}

async function getConversationId(page: Page) {
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

test.describe('MCP account data regression', () => {
  test('forces live account-data tool calls for exact prompts', async ({ page }, testInfo) => {
    test.setTimeout(240000);

    const endpoint = process.env.E2E_TOOL_ENDPOINT ?? endpoints[1];

    await page.goto(initialUrl, { timeout: 10000 });
    const accessToken = await getAccessToken(page);

    const [toolsResponse, serverConfigResponse] = await Promise.all([
      fetchAuthorizedJson<MCPToolsResponse>(page, 'http://localhost:3080/api/mcp/tools', accessToken),
      fetchAuthorizedJson<MCPServersConfigResponse>(
        page,
        'http://localhost:3080/api/mcp/servers',
        accessToken,
      ),
    ]);

    expect(toolsResponse.ok, `GET /api/mcp/tools failed with ${toolsResponse.status}: ${toolsResponse.text}`).toBeTruthy();
    expect(
      serverConfigResponse.ok,
      `GET /api/mcp/servers failed with ${serverConfigResponse.status}: ${serverConfigResponse.text}`,
    ).toBeTruthy();

    const toolsData = (toolsResponse.json ?? {}) as MCPToolsResponse;
    const serverConfigs = (serverConfigResponse.json ?? {}) as MCPServersConfigResponse;

    const report = {
      generatedAt: new Date().toISOString(),
      filters: {
        endpoint,
        prompts: accountDataPrompts,
      },
      results: [] as AccountDataPromptResult[],
    };

    for (const promptCase of accountDataPrompts) {
      const selectedServer = toolsData.servers[promptCase.expectedServerName];
      expect(
        selectedServer,
        `Expected MCP server "${promptCase.expectedServerName}" was not available. Available servers: ${Object.keys(toolsData.servers).join(', ') || '(none)'}`,
      ).toBeTruthy();

      if (!selectedServer) {
        continue;
      }

      const selectedTool = selectedServer.tools.find(
        (candidate) => candidate.name === promptCase.expectedToolName,
      );
      expect(
        selectedTool,
        `Expected tool "${promptCase.expectedToolName}" was not available on "${promptCase.expectedServerName}". Available tools: ${selectedServer.tools.map((candidate) => candidate.name).join(', ') || '(none)'}`,
      ).toBeTruthy();

      if (!selectedTool) {
        continue;
      }

      const displayName =
        serverConfigs[promptCase.expectedServerName]?.title ?? promptCase.expectedServerName;

      await openEndpointMenu(page, endpoint);
      await selectOnlyMCPServer(page, displayName, promptCase.expectedServerName);
      await submitPrompt(page, promptCase.prompt);

      const conversationId = await getConversationId(page);
      const toolCallsResponse = await fetchAuthorizedJson<ToolCallResult[]>(
        page,
        `http://localhost:3080/api/agents/tools/calls?conversationId=${encodeURIComponent(conversationId)}`,
        accessToken,
      );
      expect(
        toolCallsResponse.ok,
        `GET /api/agents/tools/calls failed with ${toolCallsResponse.status}: ${toolCallsResponse.text}`,
      ).toBeTruthy();

      const toolCalls = (toolCallsResponse.json ?? []) as ToolCallResult[];
      const actualToolIds = [...new Set(toolCalls.map((call) => call.toolId))];
      const expectedCalls = toolCalls.filter((call) => call.toolId === selectedTool.pluginKey);
      const visibleToolName = await page
        .getByText(new RegExp(escapeRegex(selectedTool.name), 'i'))
        .first()
        .isVisible()
        .catch(() => false);
      const visibleServerSubtitle = await page
        .getByText(new RegExp(`via server\\s+${escapeRegex(promptCase.expectedServerName)}`, 'i'))
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
        expectedToolId: selectedTool.pluginKey,
        name: promptCase.name,
        outcome,
        prompt: promptCase.prompt,
        resultPreview,
        serverName: promptCase.expectedServerName,
        toolName: selectedTool.name,
        visibleAuthPrompt,
        visibleServerSubtitle,
        visibleToolName,
      });
    }

    const outputPath = testInfo.outputPath('mcp-account-data-report.json');
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    await testInfo.attach('mcp-account-data-report', {
      contentType: 'application/json',
      path: outputPath,
    });

    const failures = report.results.filter((result) => result.outcome !== 'invoked_expected_tool');
    expect(
      failures,
      `One or more account-data prompts did not trigger the expected live tool call:\n${JSON.stringify(failures, null, 2)}`,
    ).toEqual([]);
  });
});
