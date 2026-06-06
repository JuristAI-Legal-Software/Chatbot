import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

type JsonSchema = {
  anyOf?: JsonSchema[];
  default?: unknown;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
  minItems?: number;
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string | string[];
};

type ToolInventory = {
  description: string;
  name: string;
  pluginKey: string;
  safety: 'mutation' | 'read' | 'unknown';
  schema: JsonSchema | null;
};

type ServerInventory = {
  connection: {
    connectionState: string;
    requiresOAuth: boolean;
  };
  customUserVars: string[];
  requiresOAuth: boolean;
  toolCount: number;
  tools: ToolInventory[];
};

type InventoryResponse = {
  servers: Record<string, ServerInventory>;
};

type ExecuteResponse = {
  classification?: string;
  error?: string;
};

type ToolCase = {
  args?: Record<string, unknown>;
};

type ToolResult = {
  args: Record<string, unknown> | null;
  classification: string;
  error?: string;
  name: string;
  safety: ToolInventory['safety'];
};

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

function pickCaseKey(serverName: string, toolName: string, cases: Record<string, ToolCase>) {
  return cases[`${serverName}.${toolName}`] ?? cases[toolName] ?? null;
}

async function loadToolCases() {
  const casesPath = process.env.E2E_MCP_TOOL_CASES_PATH;
  if (!casesPath) {
    return {};
  }

  const raw = await fs.readFile(casesPath, 'utf8');
  return JSON.parse(raw) as Record<string, ToolCase>;
}

function normalizeSchema(schema: JsonSchema | null | undefined): JsonSchema | null {
  if (!schema) {
    return null;
  }
  if (schema.oneOf?.length) {
    return normalizeSchema(schema.oneOf[0]);
  }
  if (schema.anyOf?.length) {
    return normalizeSchema(schema.anyOf[0]);
  }
  return schema;
}

function inferStringValue(name: string, description: string, toolName: string) {
  const hint = `${name} ${description} ${toolName}`.toLowerCase();
  if (/(query|search|keyword|term|prompt|question|text|name|title)/.test(hint)) {
    return 'test';
  }
  if (/(email)/.test(hint)) {
    return 'test@example.com';
  }
  if (/(url|uri|link|website)/.test(hint)) {
    return 'https://example.com';
  }
  if (/(date)/.test(hint)) {
    return '2024-01-01';
  }
  if (/(id|uuid)/.test(hint)) {
    return 'test-id';
  }
  return 'test';
}

function buildValue(
  schema: JsonSchema | null | undefined,
  propName: string,
  toolName: string,
): unknown {
  const normalized = normalizeSchema(schema);
  if (!normalized) {
    return null;
  }
  if (normalized.default !== undefined) {
    return normalized.default;
  }
  if (normalized.enum?.length) {
    return normalized.enum[0];
  }

  const schemaType = Array.isArray(normalized.type) ? normalized.type[0] : normalized.type;
  switch (schemaType) {
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return normalized.minimum ?? 1;
    case 'array': {
      const item = buildValue(normalized.items, propName, toolName);
      return normalized.minItems && normalized.minItems > 0 ? [item] : [];
    }
    case 'object':
      return buildArgs(normalized, toolName);
    case 'string':
    default:
      return inferStringValue(propName, normalized.description ?? '', toolName);
  }
}

function buildArgs(schema: JsonSchema | null | undefined, toolName: string): Record<string, unknown> {
  const normalized = normalizeSchema(schema);
  if (!normalized) {
    return {};
  }

  if ((Array.isArray(normalized.type) ? normalized.type[0] : normalized.type) !== 'object') {
    return {};
  }

  const args: Record<string, unknown> = {};
  for (const key of normalized.required ?? []) {
    const value = buildValue(normalized.properties?.[key], key, toolName);
    if (value !== null) {
      args[key] = value;
    }
  }
  return args;
}

async function safeJson(response: { json(): Promise<unknown>; text(): Promise<string> }) {
  try {
    return await response.json();
  } catch {
    return { raw: await response.text() };
  }
}

test.describe('Django MCP tools', () => {
  test('inventories and exercises configured Django/JuristAI MCP tools', async ({ page }, testInfo) => {
    test.setTimeout(240000);

    const exactServerNames = parseCsv(process.env.E2E_MCP_SERVER_NAMES);
    const serverMatch = process.env.E2E_MCP_SERVER_MATCH ?? '(django|juristai)';
    const allowMutatingTools = parseBoolean(process.env.E2E_MCP_INCLUDE_MUTATING, false);
    const failOnExecutionFailure = parseBoolean(process.env.E2E_MCP_FAIL_ON_FAILURE, false);
    const toolCases = await loadToolCases();

    await page.goto('http://localhost:3080/c/new', { timeout: 15000 });
    const origin = new URL(page.url()).origin;

    const inventoryResponse = await page.request.get(`${origin}/api/mcp/e2e/inventory`);
    expect(inventoryResponse.ok(), 'The CI-only MCP E2E inventory endpoint was unavailable.').toBeTruthy();
    const fullInventory = (await safeJson(inventoryResponse)) as InventoryResponse;

    const availableServers = Object.keys(fullInventory.servers);
    const matcher = new RegExp(serverMatch, 'i');
    const selectedServers = availableServers.filter((serverName) => {
      if (exactServerNames.length > 0) {
        return exactServerNames.includes(serverName);
      }
      return matcher.test(serverName);
    });

    expect(
      selectedServers.length,
      `No MCP servers matched the Django filter. Available servers: ${availableServers.join(', ') || '(none)'}`,
    ).toBeGreaterThan(0);

    const report = {
      generatedAt: new Date().toISOString(),
      filters: {
        allowMutatingTools,
        exactServerNames,
        failOnExecutionFailure,
        serverMatch,
      },
      servers: {} as Record<
        string,
        {
          before: ServerInventory;
          reinitialize: unknown;
          toolResults: ToolResult[];
        }
      >,
    };

    for (const serverName of selectedServers) {
      const before = fullInventory.servers[serverName];
      const reinitializeResponse = await page.request.post(
        `${origin}/api/mcp/${serverName}/reinitialize`,
        {
          data: {},
        },
      );
      const reinitialize = await safeJson(reinitializeResponse);

      const refreshedInventoryResponse = await page.request.get(
        `${origin}/api/mcp/e2e/inventory?serverNames=${encodeURIComponent(serverName)}`,
      );
      expect(
        refreshedInventoryResponse.ok(),
        `Unable to refresh MCP inventory for server "${serverName}".`,
      ).toBeTruthy();
      const refreshedInventory = (await safeJson(refreshedInventoryResponse)) as InventoryResponse;
      const serverInventory = refreshedInventory.servers[serverName] ?? before;
      const toolResults: ToolResult[] = [];

      for (const toolInfo of serverInventory.tools) {
        if (toolInfo.safety === 'mutation' && !allowMutatingTools) {
          toolResults.push({
            args: null,
            classification: 'skipped_mutation',
            name: toolInfo.name,
            safety: toolInfo.safety,
          });
          continue;
        }

        const toolCase = pickCaseKey(serverName, toolInfo.name, toolCases);
        const args = toolCase?.args ?? buildArgs(toolInfo.schema, toolInfo.name);
        const executeResponse = await page.request.post(`${origin}/api/mcp/e2e/execute`, {
          data: {
            allowMutatingTools,
            args,
            serverName,
            toolName: toolInfo.name,
          },
        });
        const executeBody = (await safeJson(executeResponse)) as ExecuteResponse;
        toolResults.push({
          args,
          classification: executeBody.classification ?? 'unknown',
          error: executeBody.error,
          name: toolInfo.name,
          safety: toolInfo.safety,
        });
      }

      report.servers[serverName] = {
        before,
        reinitialize,
        toolResults,
      };
    }

    const outputPath = testInfo.outputPath('django-mcp-tool-report.json');
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    await testInfo.attach('django-mcp-tool-report', {
      contentType: 'application/json',
      path: outputPath,
    });

    const exercisedTools = Object.values(report.servers).flatMap((server) =>
      server.toolResults.filter((result) => result.classification !== 'skipped_mutation'),
    );
    expect(
      exercisedTools.length,
      'No Django/JuristAI MCP tools were exercised. Check your server filter and runtime configuration.',
    ).toBeGreaterThan(0);

    if (failOnExecutionFailure) {
      const failures = exercisedTools.filter((result) => result.classification !== 'executed');
      expect(
        failures,
        `One or more MCP tool calls failed:\n${JSON.stringify(failures, null, 2)}`,
      ).toEqual([]);
    }
  });
});
