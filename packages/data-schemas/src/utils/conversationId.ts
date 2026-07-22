/**
 * Conversation identifier validation.
 *
 * Two identifier shapes are durable in this deployment:
 *
 * 1. Upstream LibreChat UUIDs, minted by `api/server/controllers/agents/request.js`
 *    when a client sends no id (or `"new"`).
 * 2. JuristAI structured ids, minted by the product front-ends. These encode the
 *    business chat identity and are what the app's URLs, django-hub run contract
 *    and `GET /api/messages/:conversationId` all key on, e.g.
 *    `userId:<id>|caseId:<id>|threadId:conv_<hex>|tag:research|customId:crsh0js0x7h`
 *
 * `saveMessage` historically accepted only shape 1 and silently discarded writes
 * for shape 2, while `saveConvo` had no guard at all. That asymmetry produced
 * conversation documents with permanently empty message histories. Both call
 * sites must use this shared predicate so they cannot diverge again.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STRUCTURED_ID_MAX_LENGTH = 512;
const STRUCTURED_SEGMENT_KEYS = new Set(['userId', 'caseId', 'threadId', 'tag', 'customId']);
const STRUCTURED_REQUIRED_KEYS = ['userId', 'threadId', 'tag', 'customId'] as const;
const STRUCTURED_VALUE_REGEX = /^[A-Za-z0-9._~-]+$/;

export function isUuidConversationId(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * A JuristAI structured conversation id: pipe-delimited `key:value` segments
 * drawn from a fixed key allowlist, with every required key present exactly once
 * and every value a non-empty token free of delimiters or whitespace.
 */
export function isStructuredConversationId(value: string): boolean {
  if (value.length > STRUCTURED_ID_MAX_LENGTH || !value.includes('|')) {
    return false;
  }

  const seen = new Map<string, string>();
  for (const segment of value.split('|')) {
    const separatorIndex = segment.indexOf(':');
    if (separatorIndex === -1) {
      return false;
    }

    const key = segment.slice(0, separatorIndex);
    const segmentValue = segment.slice(separatorIndex + 1);

    if (!STRUCTURED_SEGMENT_KEYS.has(key) || seen.has(key)) {
      return false;
    }

    if (!STRUCTURED_VALUE_REGEX.test(segmentValue)) {
      return false;
    }

    seen.set(key, segmentValue);
  }

  return STRUCTURED_REQUIRED_KEYS.every((key) => seen.has(key));
}

/** Whether `value` is an identifier this deployment persists messages against. */
export function isValidConversationId(value: unknown): value is string {
  if (typeof value !== 'string' || !value) {
    return false;
  }

  return isUuidConversationId(value) || isStructuredConversationId(value);
}
