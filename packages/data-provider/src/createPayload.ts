import type * as t from './types';
import { EndpointURLs } from './config';
import * as s from './schemas';

type PromptConfig = {
  id: string;
  version: string;
};

const promptConfigByAppId: Record<string, PromptConfig> = {
  '1': {
    id: 'pmpt_694030e601dc8196b472e5dcf8f2e3bd0aa422f8a026f796',
    version: '3',
  },
  '2': {
    id: 'pmpt_694030b0bc6c8194906e2aee647e640b0959472384122916',
    version: '2',
  },
};

const hasAppId = (
  value: t.TEndpointOption['additionalModelRequestFields'],
): value is { appId: string | number } => {
  if (value == null || typeof value !== 'object' || !('appId' in value)) {
    return false;
  }

  const appId = value.appId;
  return typeof appId === 'string' || typeof appId === 'number';
};

const getPromptConfig = (
  value: t.TEndpointOption['additionalModelRequestFields'],
): PromptConfig | undefined => {
  if (!hasAppId(value)) {
    return undefined;
  }

  return promptConfigByAppId[String(value.appId)];
};

const readTextValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export default function createPayload(submission: t.TSubmission) {
  const {
    isEdited,
    addedConvo,
    userMessage,
    isContinued,
    isTemporary,
    isRegenerate,
    conversation,
    editedContent,
    ephemeralAgent,
    endpointOption,
  } = submission;
  const { conversationId } = s.tConvoUpdateSchema.parse(conversation);
  const conversationThreadId =
    conversation != null && typeof conversation === 'object' && 'thread_id' in conversation
      ? conversation.thread_id
      : undefined;
  const { endpoint: _e } = endpointOption as {
    endpoint: s.EModelEndpoint;
  };
  const threadId =
    readTextValue(conversationThreadId) ??
    readTextValue(userMessage.thread_id) ??
    readTextValue(endpointOption.threadId) ??
    readTextValue(endpointOption.openai_conversation_id) ??
    readTextValue(endpointOption.openaiConversationId) ??
    readTextValue(endpointOption.thread_id);

  const promptConfig = getPromptConfig(endpointOption.additionalModelRequestFields);
  const isLegacyAssistantsEndpoint = s.isAssistantsEndpoint(_e);
  const endpoint = isLegacyAssistantsEndpoint ? s.EModelEndpoint.agents : (_e as s.EModelEndpoint);
  const server = `${EndpointURLs[s.EModelEndpoint.agents]}/${endpoint}`;

  const model_parameters = {
    ...(endpointOption.model_parameters ?? {}),
    ...(promptConfig
      ? {
          useResponsesApi: true,
          prompt: {
            id: promptConfig.id,
            version: promptConfig.version,
          },
        }
      : {}),
  };

  const endpointPayload = isLegacyAssistantsEndpoint
    ? {
        ...endpointOption,
        endpoint,
        endpointType: endpoint,
        assistant_id: undefined,
        thread_id: undefined,
        model_parameters,
      }
    : {
        ...endpointOption,
        model_parameters,
      };

  const payload: t.TPayload = {
    ...userMessage,
    ...endpointPayload,
    endpoint,
    addedConvo,
    isTemporary,
    isRegenerate,
    editedContent,
    conversationId,
    threadId,
    openaiConversationId: threadId,
    openai_conversation_id: threadId,
    isContinued: !!(isEdited && isContinued),
    ephemeralAgent: s.isAssistantsEndpoint(endpoint) ? undefined : ephemeralAgent,
  };

  return { server, payload };
}
