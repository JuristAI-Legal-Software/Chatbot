import { getDjangoHubBaseURL, getMCPJuristAIDjangoURL } from './env';

type ProbeMode = 'health' | 'reachability';

type ProbeTarget = {
  serviceName: string;
  envVar: string;
  url: string | undefined;
};

const DEFAULT_TIMEOUT_MS = 5000;

function joinPath(basePath: string, suffix: string) {
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  return `${normalizedBase}/${suffix}`.replace(/\/{2,}/g, '/');
}

function appendPath(url: URL, suffix: string) {
  const next = new URL(url.toString());
  next.pathname = joinPath(next.pathname || '/', suffix);
  return next.toString();
}

function uniqueProbeUrls(urls: Array<{ mode: ProbeMode; url: string }>) {
  const seen = new Set<string>();
  return urls.filter((entry) => {
    if (seen.has(entry.url)) {
      return false;
    }

    seen.add(entry.url);
    return true;
  });
}

function getTimeoutMs() {
  const value = Number(process.env.E2E_PREFLIGHT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function buildDjangoHubProbes(configuredUrl: URL) {
  const probes = ['health', 'livez', 'readyz'].map((suffix) => ({
    mode: 'health' as const,
    url: appendPath(configuredUrl, suffix),
  }));

  probes.push({
    mode: 'reachability',
    url: configuredUrl.toString(),
  });

  return uniqueProbeUrls(probes);
}

function buildMCPServerProbes(configuredUrl: URL) {
  const probes = [
    {
      mode: 'reachability' as const,
      url: configuredUrl.toString(),
    },
    {
      mode: 'health' as const,
      url: appendPath(configuredUrl, 'health'),
    },
  ];

  const originHealth = new URL(configuredUrl.origin);
  originHealth.pathname = '/health';
  probes.push({
    mode: 'health',
    url: originHealth.toString(),
  });

  return uniqueProbeUrls(probes);
}

function getProbeTargets(): ProbeTarget[] {
  const djangoHubUrl = getDjangoHubBaseURL();
  const mcpServerUrl = getMCPJuristAIDjangoURL();

  return [
    {
      envVar: 'DJANGO_API_BASE_URL',
      serviceName: 'JuristAI django-hub',
      url: djangoHubUrl,
    },
    {
      envVar: 'MCP_JURISTAI_DJANGO_URL',
      serviceName: 'JuristAI MCP server',
      url: mcpServerUrl,
    },
  ];
}

function describeProbeFailure(url: string, detail: string) {
  return `${url} (${detail})`;
}

async function probeUrl(url: string, mode: ProbeMode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
      },
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });

    const reachable = mode === 'health' ? response.ok : response.status < 500;
    return {
      detail: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      ok: reachable,
      url,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      detail,
      ok: false,
      url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assertConfiguredUrl(target: ProbeTarget) {
  if (!target.url) {
    throw new Error(
      `[e2e] Preflight failed: ${target.serviceName} URL is not configured. Set ${target.envVar} before starting local Playwright bootstrap.`,
    );
  }

  try {
    return new URL(target.url);
  } catch {
    throw new Error(
      `[e2e] Preflight failed: ${target.serviceName} URL in ${target.envVar} is invalid: ${target.url}`,
    );
  }
}

async function assertReachable(target: ProbeTarget) {
  const configuredUrl = assertConfiguredUrl(target);
  const probes =
    target.envVar === 'DJANGO_API_BASE_URL'
      ? buildDjangoHubProbes(configuredUrl)
      : buildMCPServerProbes(configuredUrl);

  const failures: string[] = [];
  for (const probe of probes) {
    const result = await probeUrl(probe.url, probe.mode);
    if (result.ok) {
      return;
    }

    failures.push(describeProbeFailure(result.url, result.detail));
  }

  throw new Error(
    `[e2e] Preflight failed: ${target.serviceName} is not reachable. Configured URL: ${target.url}. Probes: ${failures.join(
      '; ',
    )}`,
  );
}

export async function runJuristAIPreflight() {
  for (const target of getProbeTargets()) {
    await assertReachable(target);
  }
}
