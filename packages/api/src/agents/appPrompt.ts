import { resolveResponseAppInstructions } from './generatedResponsePrompts';

const responsePromptRequests = new WeakMap<object, Map<string, Promise<string>>>();

/** Fetch one current app prompt per request and share it between agent loading
 *  and the OpenAI request boundary. A new request always reads the current S3
 *  object again. */
export function resolveResponseAppInstructionsForRequest(
  request: object,
  appId: string | number | undefined,
): Promise<string> {
  const key = String(appId ?? '').trim();
  let prompts = responsePromptRequests.get(request);
  if (!prompts) {
    prompts = new Map<string, Promise<string>>();
    responsePromptRequests.set(request, prompts);
  }

  const existing = prompts.get(key);
  if (existing) return existing;

  const pending = resolveResponseAppInstructions(appId);
  prompts.set(key, pending);
  return pending;
}

export interface AgentPromptTarget {
  instructions?: string;
  additional_instructions?: string;
}

/** Apply the repository-owned app prompt and retain per-run context separately. */
export function applyResponseAppPrompt<T extends AgentPromptTarget>(
  agent: T,
  appInstructions: string,
  requestInstructions?: string,
): T & AgentPromptTarget {
  const result: T & AgentPromptTarget = { ...agent };
  const requestText = requestInstructions?.trim() ?? '';
  const taskInstructions =
    appInstructions &&
    (requestText === appInstructions || requestText.startsWith(`${appInstructions}\n\n`))
      ? requestText.slice(appInstructions.length).replace(/^\s+/, '')
      : requestText;

  if (appInstructions) {
    result.instructions = appInstructions;
    result.additional_instructions = [
      result.additional_instructions,
      agent.instructions === appInstructions ? '' : agent.instructions,
      taskInstructions,
    ]
      .filter(Boolean)
      .join('\n\n');
  } else if (taskInstructions) {
    result.additional_instructions = [result.additional_instructions, taskInstructions]
      .filter(Boolean)
      .join('\n\n');
  }
  return result;
}
