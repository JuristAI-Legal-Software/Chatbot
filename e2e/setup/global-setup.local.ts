import { FullConfig } from '@playwright/test';
import authenticate from './authenticate';
import { runJuristAIPreflight } from './preflight';
import { getE2EUser } from './user';

async function globalSetup(config: FullConfig) {
  await runJuristAIPreflight();
  await authenticate(config, getE2EUser());
}

export default globalSetup;
