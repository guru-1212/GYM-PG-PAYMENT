import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';

@Component({
  selector: 'app-owner-notifications-page',
  standalone: true,
  imports: [NotificationBellComponent],
  templateUrl: './owner-notifications-page.component.html',
  styleUrl: './owner-notifications-page.component.scss',
})
export class OwnerNotificationsPageComponent {
  private readonly auth = inject(AuthService);
  readonly profile = this.auth.profile;
}
