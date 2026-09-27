import { applyResponseAppPrompt, resolveResponseAppInstructionsForRequest } from '../appPrompt';
import * as GeneratedPrompts from '../generatedResponsePrompts';

const APP_PROMPT = 'Current prompt fetched from S3.';

describe('applyResponseAppPrompt', () => {
  test('keeps the fetched app prompt exact and retains stored/run context separately', () => {
    const agent = {
      id: 'agent-in-house',
      provider: 'openai',
      instructions: 'Stored agent instructions.',
      additional_instructions: 'Existing run context.',
    };

    const result = applyResponseAppPrompt(agent, APP_PROMPT, 'Case context: matter-42.');

    expect(result.instructions).toBe(APP_PROMPT);
    expect(result.additional_instructions).toBe(
      'Existing run context.\n\nStored agent instructions.\n\nCase context: matter-42.',
    );
    expect(agent.instructions).toBe('Stored agent instructions.');
  });

  test('does not let caller instructions replace the mapped prompt', () => {
    const result = applyResponseAppPrompt(
      { id: 'agent-civil', provider: 'openai', instructions: 'Stored agent instructions.' },
      APP_PROMPT,
      'Caller replacement instructions.',
    );

    expect(result.instructions).toBe(APP_PROMPT);
    expect(result.additional_instructions).toBe(
      'Stored agent instructions.\n\nCaller replacement instructions.',
    );
  });
});

describe('resolveResponseAppInstructionsForRequest', () => {
  test('shares one S3 prompt read within a request and fetches again for the next request', async () => {
    const resolvePrompt = jest
      .spyOn(GeneratedPrompts, 'resolveResponseAppInstructions')
      .mockResolvedValueOnce('Prompt version A.')
      .mockResolvedValueOnce('Prompt version B.');
    const firstRequest = {};
    const nextRequest = {};

    await expect(resolveResponseAppInstructionsForRequest(firstRequest, 5)).resolves.toBe(
      'Prompt version A.',
    );
    await expect(resolveResponseAppInstructionsForRequest(firstRequest, '5')).resolves.toBe(
      'Prompt version A.',
    );
    await expect(resolveResponseAppInstructionsForRequest(nextRequest, 5)).resolves.toBe(
      'Prompt version B.',
    );

    expect(resolvePrompt).toHaveBeenCalledTimes(2);
    expect(resolvePrompt).toHaveBeenNthCalledWith(1, 5);
    expect(resolvePrompt).toHaveBeenNthCalledWith(2, 5);
    resolvePrompt.mockRestore();
  });
});
