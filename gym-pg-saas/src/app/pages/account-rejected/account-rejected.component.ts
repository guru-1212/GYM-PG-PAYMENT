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
          <app-brand-logo [logoSize]="'48px'" [showText]="true" brandName="OurPgTracker"></app-brand-logo>
        </div>
      <div class="saas-card border-red-200 bg-red-50/60 p-8 text-center">
        <span class="material-icons-outlined mb-4 text-4xl text-red-700">block</span>
        <h1 class="text-xl font-bold text-slate-900">Account not approved</h1>
        <p class="mt-3 text-slate-700">
          Your registration was not approved. Please contact support if you believe this is a mistake.
        </p>
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

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
