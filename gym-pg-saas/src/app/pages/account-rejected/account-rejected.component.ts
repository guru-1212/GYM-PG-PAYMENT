import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

@Component({
  selector: 'app-account-rejected',
  standalone: true,
  imports: [BrandLogoComponent],
  template: `
    <div class="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        <div class="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl"></div>
        <div class="absolute -right-24 top-20 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl"></div>
        <div class="absolute left-1/2 top-[60%] h-80 w-[32rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl"></div>
      </div>
      <div class="relative w-full max-w-md">
        <div class="mb-6 flex justify-center">
          <app-brand-logo [logoSize]="'48px'" [showText]="true" brandName="OurPGTracker"></app-brand-logo>
        </div>
      <div class="saas-card border-red-200 bg-red-50/60 p-8 text-center">
        <span class="material-icons-outlined mb-4 text-4xl text-red-700">block</span>
        <h1 class="text-xl font-bold text-slate-900">{{ rejectionTitle() }}</h1>
        <p class="mt-3 text-slate-700">{{ rejectionMessage() }}</p>
        @if (profile()?.status === 'inactive') {
          <div class="mt-5 rounded-2xl border border-white/70 bg-white/55 p-4 text-left text-sm text-slate-700 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <p class="font-semibold text-slate-900">Need reactivation?</p>
            <p class="mt-1">
              Contact admin on
              <span class="font-semibold text-slate-900">+91 6300675014</span>.
            </p>
            <a
              class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-semibold text-emerald-800 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              [href]="adminWhatsAppUrl()"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp admin
            </a>
          </div>
        }
        <button
          type="button"
          class="saas-btn-secondary mt-6 w-full py-3 text-base"
          (click)="signOut()"
        >
          Sign out
        </button>
      </div>
      </div>
    </div>
  `,
})
export class AccountRejectedComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly profile = this.auth.profile;

  rejectionTitle(): string {
    if (this.profile()?.status === 'inactive') return 'Account is inactive';
    return 'Account not approved';
  }

  rejectionMessage(): string {
    if (this.profile()?.status === 'inactive') {
      return 'Your account is currently inactive. Please contact admin to reactivate it. It may be due to subscription or another verification reason. Do not worry, your data is safe.';
    }
    return 'Your registration was not approved. Please contact support if you believe this is a mistake.';
  }

  adminWhatsAppUrl(): string {
    const phone = '916300675014';
    const name = this.profile()?.name || '';
    const email = this.profile()?.email || this.auth.user()?.email || '';
    const msg = `Hi Admin, my account is inactive and I need reactivation support.\n\nName: ${name}\nEmail: ${email}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
