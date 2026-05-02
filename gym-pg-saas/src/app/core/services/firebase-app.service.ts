import { Injectable } from '@angular/core';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseAppService {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
  readonly storage: FirebaseStorage;

  constructor() {
    // Reuse the default app if already initialized (HMR/tests/multiple bootstraps).
    this.app = getApps().length ? getApp() : initializeApp(environment.firebase);
    const siteKey = environment.appCheckRecaptchaSiteKey?.trim();
    if (typeof window !== 'undefined' && environment.production && siteKey) {
      try {
        initializeAppCheck(this.app, {
          provider: new ReCaptchaV3Provider(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (e) {
        console.warn('[AppCheck] init failed (register key + secret in Firebase Console → App Check)', e);
      }
    }
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.storage = getStorage(this.app);
  }
}
