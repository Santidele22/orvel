import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

type RuntimeEnvironment = 'development' | 'staging' | 'production' | 'test';

function resolveRuntimeEnvironment(): RuntimeEnvironment {
  const globalEnv = (globalThis as { __APP_ENV__?: string }).__APP_ENV__;
  const viteEnv = (import.meta as { env?: { MODE?: string; PROD?: boolean } }).env;
  const mode = globalEnv ?? viteEnv?.MODE;

  if (mode === 'production' || viteEnv?.PROD) {
    return 'production';
  }

  if (mode === 'staging') {
    return 'staging';
  }

  if (mode === 'test') {
    return 'test';
  }

  return 'development';
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
