/**
 * Matches a whole-string env-var placeholder `${VAR}` and captures `VAR`.
 * Uses `[^}]+` instead of `.+` so the inner quantifier cannot backtrack
 * against the closing `}` — fixes CodeQL `js/polynomial-redos`.
 */
export const envVarRegex = /^\${([^}]+)}$/;

function parseWholePlaceholder(value: string): string | null {
  if (!value.startsWith('${') || !value.endsWith('}')) {
    return null;
  }

  const varName = value.slice(2, -1);
  if (!varName || varName.includes('}')) {
    return null;
  }

  return varName;
}

function isPlaceholderToken(value: string): boolean {
  return parseWholePlaceholder(value) != null;
}

function replaceInlinePlaceholders(value: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < value.length) {
    const openIndex = value.indexOf('${', cursor);
    if (openIndex === -1) {
      result += value.slice(cursor);
      break;
    }

    result += value.slice(cursor, openIndex);
    const closeIndex = value.indexOf('}', openIndex + 2);
    if (closeIndex === -1) {
      result += value.slice(openIndex);
      break;
    }

    const fullMatch = value.slice(openIndex, closeIndex + 1);
    const varName = parseWholePlaceholder(fullMatch);
    if (!varName || isSensitiveEnvVar(varName)) {
      result += fullMatch;
    } else {
      result += process.env[varName] || fullMatch;
    }

    cursor = closeIndex + 1;
  }

  return result;
}

/**
 * Infrastructure env vars that must never be resolved via placeholder expansion.
 * These are internal secrets whose exposure would compromise the system —
 * they have no legitimate reason to appear in outbound headers, MCP env/args, or OAuth config.
 *
 * Intentionally excludes API keys (operators reference them in config) and
 * OAuth/session secrets (referenced in MCP OAuth config via processMCPEnv).
 */
const SENSITIVE_ENV_VARS = new Set([
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CREDS_KEY',
  'CREDS_IV',
  'MEILI_MASTER_KEY',
  'MONGO_URI',
  'REDIS_URI',
  'REDIS_PASSWORD',
]);

/** Returns true when `varName` refers to an infrastructure secret that must not leak. */
export function isSensitiveEnvVar(varName: string): boolean {
  return SENSITIVE_ENV_VARS.has(varName);
}

/** Extracts the environment variable name from a template literal string */
export function extractVariableName(value: string): string | null {
  if (!value) {
    return null;
  }

  return parseWholePlaceholder(value.trim());
}

/** Extracts the value of an environment variable from a string. */
export function extractEnvVariable(value: string) {
  if (!value) {
    return value;
  }

  const trimmed = value.trim();
  const whitespaceSeparatedTokens = trimmed.split(/\s+/);
  const isPlaceholderList =
    whitespaceSeparatedTokens.length > 1 && whitespaceSeparatedTokens.every(isPlaceholderToken);

  if (isPlaceholderList) {
    return trimmed;
  }

  const varName = parseWholePlaceholder(trimmed);
  if (varName) {
    if (isSensitiveEnvVar(varName)) {
      return trimmed;
    }
    return process.env[varName] || trimmed;
  }

  return replaceInlinePlaceholders(trimmed);
}

/**
 * Normalize the endpoint name to system-expected value.
 * @param name
 */
export function normalizeEndpointName(name = ''): string {
  return name.toLowerCase() === 'ollama' ? 'ollama' : name;
}
