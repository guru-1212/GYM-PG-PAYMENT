import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { runCacheResetIfNeeded } from './app/core/cache-reset';

(async () => {
  // Run version-based cache reset BEFORE Angular boots so a stale client
  // (older service worker / cached bundles) hard-reloads to the latest UI.
  // If a reload was triggered we skip bootstrap — the page is unloading.
  const { reloading } = await runCacheResetIfNeeded();
  if (reloading) return;

  bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
})();
