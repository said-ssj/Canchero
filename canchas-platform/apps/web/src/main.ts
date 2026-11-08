import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeMonitoring } from './app/core/monitoring/monitoring';

initializeMonitoring()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
