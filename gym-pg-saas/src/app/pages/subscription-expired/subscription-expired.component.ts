import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

@Component({
  selector: 'app-subscription-expired',
  standalone: true,
  imports: [CommonModule, TranslatePipe, BrandLogoComponent],
  templateUrl: './subscription-expired.component.html',
})
export class SubscriptionExpiredComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
