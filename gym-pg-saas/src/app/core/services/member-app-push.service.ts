import { Injectable, inject } from '@angular/core';
import { doc, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { FirebaseAppService } from './firebase-app.service';

/** Web Push for members signed in via custom token (`memberapp_*` UID + claims). */
@Injectable({ providedIn: 'root' })
export class MemberAppPushService {
  private readonly fb = inject(FirebaseAppService);

  private readonly vapidKey =
    'BFkkFZ9oqkFC3vc9xySqcLMyftK6nXePgeBj0tXAMqPcJ2-3dv07aYsCuaqwwREKKNtZbyaDIXNbxDC9EMKQwhk';

  async registerDeviceToken(ownerId: string, memberId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    const ok = await isSupported().catch(() => false);
    if (!ok) return;

    try {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }
      const messaging = getMessaging(this.fb.app);
      const token = await getToken(messaging, { vapidKey: this.vapidKey });
      if (!token) return;
      const ref = doc(this.fb.db, 'owners', ownerId, 'memberDeviceTokens', memberId);
      await setDoc(
        ref,
        {
          token,
          updatedAt: new Date(),
          platform: 'web',
        },
        { merge: true },
      );
    } catch {
      /* permission denied or blocked */
    }
  }
}
