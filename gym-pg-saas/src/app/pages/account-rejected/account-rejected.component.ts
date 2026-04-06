import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-account-rejected',
  standalone: true,
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div class="max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
        <span class="material-icons-outlined mb-4 text-4xl text-red-700">block</span>
        <h1 class="text-xl font-bold text-slate-900">Account not approved</h1>
        <p class="mt-3 text-slate-700">
          Your registration was not approved. Please contact support if you believe this is a mistake.
        </p>
        <button
          type="button"
          class="mt-6 w-full rounded-xl bg-slate-900 py-4 text-base font-semibold text-white hover:bg-slate-800"
          (click)="signOut()"
        >
          Sign out
        </button>
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
