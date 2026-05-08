import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { PwaInstallService } from './core/services/pwa-install.service';
import { ThemeService } from './core/services/theme.service';
import { ToastContainerComponent } from './shared/toast-container.component';
import { AskToGuruAssistantComponent } from './shared/ask-to-guru-assistant.component';
import { OfflineBannerComponent } from './shared/offline-banner.component';
import { PageLoaderComponent } from './shared/page-loader.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, AskToGuruAssistantComponent, OfflineBannerComponent, PageLoaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  /** Eager inject so theme applies before routed shells (e.g. login). */
  private readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Ask to Guru is for signed-in users only — keeps the public home FAB row uncluttered. */
  readonly showAskToGuru = computed(() => {
    if (this.auth.user() === null) return false;
    const url = this.router.url;
    // Hide on member page and home page
    return !url.startsWith('/members') && !url.startsWith('/home');
  });
  /**
   * Eager inject so the PWA install service captures `beforeinstallprompt`
   * as early as possible — that event only fires once and we'd miss it if
   * the listener was attached lazily by a routed component.
   */
  private readonly pwa = inject(PwaInstallService);

  /** Expose iOS instructions overlay so it's globally available regardless of route. */
  readonly showIosInstructions = this.pwa.showIosInstructions;
  closeIosInstructions(): void {
    this.pwa.closeIosInstructions();
  }
}
