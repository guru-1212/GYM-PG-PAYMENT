import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { getAuth } from 'firebase/auth';
import { FirebaseAppService } from '../services/firebase-app.service';

/** Allows `/member-app/home` only for users signed in via `verifyMemberForApp` custom token. */
export const memberAppHomeGuard: CanActivateFn = async () => {
  const fb = inject(FirebaseAppService);
  const router = inject(Router);
  const auth = getAuth(fb.app);
  const user = auth.currentUser;
  if (!user) {
    return router.parseUrl('/member-app/login');
  }
  try {
    const token = await user.getIdTokenResult();
    if (token.claims['role'] !== 'member_app') {
      return router.parseUrl('/member-app/login');
    }
  } catch {
    return router.parseUrl('/member-app/login');
  }
  return true;
};
