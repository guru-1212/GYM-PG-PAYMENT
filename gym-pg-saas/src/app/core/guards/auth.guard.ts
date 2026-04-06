import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FirebaseAppService } from '../services/firebase-app.service';

export const authGuard: CanActivateFn = async () => {
  const fb = inject(FirebaseAppService);
  const router = inject(Router);
  await fb.auth.authStateReady();
  if (!fb.auth.currentUser) {
    return router.createUrlTree(['/login']);
  }
  return true;
};
