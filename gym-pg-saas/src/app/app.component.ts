import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { ToastContainerComponent } from './shared/toast-container.component';
import { NotificationTestComponent } from './core/components/notification-test.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, NotificationTestComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  /** Eager inject so theme applies before routed shells (e.g. login). */
  private readonly theme = inject(ThemeService);
}
