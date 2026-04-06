import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div class="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <span class="material-icons-outlined mb-4 text-4xl text-amber-700">hourglass_top</span>
        <h1 class="text-xl font-bold text-slate-900">Waiting for admin approval</h1>
        <p class="mt-3 text-slate-700">
          Your account is waiting for admin approval. You will be able to sign in once approved.
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
export class PendingApprovalComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
