import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const subscriptionGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for auth state and profile to load (max 30 seconds)
  let maxAttempts = 300; // 300 * 100ms = 30 seconds
  while (auth.loading() && maxAttempts > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    maxAttempts--;
  }

  if (maxAttempts === 0) {
    console.error('[SubscriptionGuard] Auth state load timeout');
    return router.createUrlTree(['/login']);
  }

  // Allow workers to proceed (their owner's subscription is checked separately)
  if (auth.isWorker()) {
    return true;
  }

  // Check if subscription is valid for owners
  if (auth.isApprovedOwner() && !auth.isSubscriptionValid()) {
    await router.navigateByUrl('/subscription-expired');
    return false;
  }

  return true;
};
