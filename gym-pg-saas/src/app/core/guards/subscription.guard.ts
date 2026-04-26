import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const subscriptionGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for profile to load
  await new Promise((resolve) => {
    if (!auth.loading()) {
      resolve(true);
      return;
    }
    const interval = setInterval(() => {
      if (!auth.loading()) {
        clearInterval(interval);
        resolve(true);
      }
    }, 100);
  });

  // Check if subscription is valid for owners (and supervisors inherit the
  // parent owner's subscription via the projected planEndDate).
  if ((auth.isApprovedOwner() || auth.isSupervisor()) && !auth.isSubscriptionValid()) {
    await router.navigateByUrl('/subscription-expired');
    return false;
  }

  return true;
};
