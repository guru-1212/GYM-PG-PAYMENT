import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

/**
 * Admin's WhatsApp number that receives renewal requests.
 * Kept as a constant so it can be swapped in one place.
 */
const ADMIN_WHATSAPP_NUMBER = '916300675014';

@Component({
  selector: 'app-subscription-expired',
  standalone: true,
  imports: [CommonModule, TranslatePipe, BrandLogoComponent],
  templateUrl: './subscription-expired.component.html',
})
export class SubscriptionExpiredComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * Pre-filled WhatsApp message that includes the owner's identifiers
   * (Owner ID, name, business, mobile, email). Admin can paste any of
   * these into the dashboard search/filter to reactivate the right
   * account in seconds — no back-and-forth needed.
   */
  readonly whatsappUrl = computed(() => {
    const p = this.auth.profile();
    const ownerId = p?.ownerId ?? '—';
    const name = (p?.name || '').trim() || '—';
    const businessName = (p?.businessName || '').trim() || '—';
    const phoneRaw = (p?.phone || '').replace(/\D/g, '');
    const phone = phoneRaw ? this.formatPhoneDisplay(phoneRaw) : '—';
    const email = (p?.email || '').trim() || '—';

    const lines = [
      'Hi Admin, my subscription has expired and I would like to renew it.',
      '',
      'Please find my account details below for quick reactivation:',
      `• Owner ID: ${ownerId}`,
      `• Name: ${name}`,
      `• PG / Business: ${businessName}`,
      `• Mobile: ${phone}`,
      `• Email: ${email}`,
      '',
      'Kindly let me know the available plans. Thank you!',
    ];

    const text = encodeURIComponent(lines.join('\n'));
    return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${text}`;
  });

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  /**
   * Format the digits-only stored phone (e.g. `919876543210`) into a
   * `+91 98765 43210` shape so the message reads cleanly. Falls back
   * gracefully for non-Indian / unexpected lengths.
   */
  private formatPhoneDisplay(digits: string): string {
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    return `+${digits}`;
  }
}
