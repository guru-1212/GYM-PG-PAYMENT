import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaInstallService } from './core/services/pwa-install.service';
import { ThemeService } from './core/services/theme.service';
import { ToastContainerComponent } from './shared/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  /** Eager inject so theme applies before routed shells (e.g. login). */
  private readonly theme = inject(ThemeService);
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
