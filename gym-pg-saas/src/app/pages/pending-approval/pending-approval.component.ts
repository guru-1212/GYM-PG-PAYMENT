import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [BrandLogoComponent],
  template: `
    <div class="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        <div class="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl"></div>
        <div class="absolute -right-24 top-20 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl"></div>
        <div class="absolute left-1/2 top-[60%] h-80 w-[32rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl"></div>
      </div>

      <div class="relative w-full max-w-md space-y-4">
        <div class="flex justify-center mb-4">
          <app-brand-logo [logoSize]="'48px'" [showText]="true" brandName="OurPGTracker"></app-brand-logo>
        </div>
        <div class="saas-card border-amber-200 bg-amber-50/60 p-8 text-center">
          <span class="material-icons-outlined mb-4 text-4xl text-amber-700">hourglass_top</span>
          <h1 class="text-xl font-bold text-slate-900">Waiting for admin approval</h1>
          <p class="mt-3 text-slate-700">
            Your account is waiting for admin approval. You will be able to sign in once approved.
          </p>

          <div class="mt-5 rounded-2xl border border-white/70 bg-white/55 p-4 text-left text-sm text-slate-700 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <p class="font-semibold text-slate-900">Need faster approval?</p>
            <p class="mt-1">
              Contact admin immediately on
              <span class="font-semibold text-slate-900">+91 7522935014</span>.
            </p>
            <a
              class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-semibold text-emerald-800 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              [href]="adminWhatsAppUrl()"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 32 32" class="h-5 w-5" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.11 17.53c-.28-.14-1.64-.81-1.9-.9-.26-.1-.45-.14-.64.14-.19.28-.74.9-.9 1.09-.17.19-.33.21-.61.07-.28-.14-1.18-.44-2.25-1.4-.83-.74-1.4-1.66-1.56-1.94-.17-.28-.02-.43.12-.57.12-.12.28-.33.43-.5.14-.17.19-.28.28-.47.1-.19.05-.36-.02-.5-.07-.14-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.48h-.55c-.19 0-.5.07-.76.36-.26.28-1 1-1 2.44s1.02 2.83 1.16 3.03c.14.19 2.01 3.07 4.87 4.3.68.29 1.21.46 1.63.59.68.22 1.3.19 1.79.12.55-.08 1.64-.67 1.87-1.31.23-.64.23-1.19.16-1.31-.07-.12-.26-.19-.55-.33zM16 3.2c-7.06 0-12.8 5.64-12.8 12.58 0 2.21.59 4.37 1.71 6.27L3.2 28.8l6.98-1.83c1.85 1 3.93 1.53 6.06 1.53 7.06 0 12.8-5.64 12.8-12.58C28.8 8.84 23.06 3.2 16 3.2zm0 23.05c-2.01 0-3.97-.55-5.66-1.58l-.4-.24-4.14 1.08 1.11-3.98-.26-.4c-1.08-1.66-1.65-3.58-1.65-5.55 0-5.78 4.8-10.49 10.99-10.49 6.19 0 10.99 4.71 10.99 10.49 0 5.78-4.8 10.49-10.99 10.49z"
                />
              </svg>
              WhatsApp admin
            </a>
          </div>

          <button type="button" class="saas-btn-secondary mt-4 w-full py-3 text-base" (click)="signOut()">
            Sign out
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PendingApprovalComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly profile = this.auth.profile;
  readonly adminWhatsAppUrl = computed(() => {
    const phone = '917522935014';
    const name = this.profile()?.name || '';
    const email = this.profile()?.email || this.auth.user()?.email || '';
    const business = this.profile()?.businessName || '';
    const msg = `Hi Admin, I want to register the app / approve my account.\n\nName: ${name}\nEmail: ${email}\nBusiness: ${business}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  });

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
