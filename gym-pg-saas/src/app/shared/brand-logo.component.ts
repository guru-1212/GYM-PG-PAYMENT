import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  template: `
    <div
      class="flex items-center gap-2 brand-link"
      role="link"
      tabindex="0"
      (click)="navigateFromLogo()"
      (keydown.enter)="navigateFromLogo()"
      (keydown.space)="onSpaceNavigate($event)"
    >
     
      @if (showText) {
        <span class="brand-name">{{ brandName }}</span>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
    }
    .brand-logo {
      flex-shrink: 0;
    }
    .brand-name {
      font-weight: 600;
      background: linear-gradient(to right, #3b82f6, #4f46e5);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-size: 24px;
    }
    .brand-link {
      cursor: pointer;
      user-select: none;
    }
  `]
})
export class BrandLogoComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  @Input() logoSize = '32px';
  @Input() showText = false;
  @Input() brandName = 'OurPGTracker';

  navigateFromLogo(): void {
    const target = this.auth.user() ? '/dashboard' : '/';
    void this.router.navigateByUrl(target);
  }

  onSpaceNavigate(event: Event): void {
    event.preventDefault();
    this.navigateFromLogo();
  }
}
