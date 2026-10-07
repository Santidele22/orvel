import 'zone.js';
// Must precede `./app/app.config`: core modules read the env fallback at module scope.
import './app/runtime/configure-dashboard-environment';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// No @vercel/analytics here on purpose: the web target is a separate artifact with its own deploy
// (Fase 4 of #1098) and will get its own analytics decision then.
bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
