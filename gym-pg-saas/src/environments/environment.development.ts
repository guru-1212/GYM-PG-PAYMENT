import type { FirebaseOptions } from 'firebase/app';

/** Live project (`gym-pg-saas`) — used by `environment.ts` production builds only. */
export const firebaseProd: FirebaseOptions = {
  apiKey: 'AIzaSyApIcrqq8LCL77oIV8emI4Yr0JSGNn5yg8',
  authDomain: 'gym-pg-saas.firebaseapp.com',
  projectId: 'gym-pg-saas',
  storageBucket: 'gym-pg-saas.firebasestorage.app',
  messagingSenderId: '695170150391',
  appId: '1:695170150391:web:4875fb5a643516ab2e08f2',
};

/** Staging / local dev project (`test-gym-pg-sass`). */
export const firebaseTest: FirebaseOptions = {
  apiKey: 'AIzaSyCGNjCt4L_O8I1c0r_s_ds3LF-FmU9wQr0',
  authDomain: 'test-gym-pg-sass.firebaseapp.com',
  projectId: 'test-gym-pg-sass',
  storageBucket: 'test-gym-pg-sass.firebasestorage.app',
  messagingSenderId: '445355373149',
  appId: '1:445355373149:web:19b106c0513cae0c21d3b4',
  measurementId: 'G-EQJGVFD2LK',
};

/**
 * Local `ng serve` only (this file replaces `environment.ts` in Angular **development** config).
 * `true`  => gym-pg-saas (live)
 * `false` => test-gym-pg-sass (safe sandbox)
 *
 * Production `ng build --configuration=production` uses `environment.ts`, which always uses `firebaseProd`.
 */
export const useProdFirebase = false;
export const selectedFirebase: FirebaseOptions = useProdFirebase ? firebaseProd : firebaseTest;

/**
 * Optional same-origin URL for the callable (Firebase Hosting rewrite in firebase.json).
 * Example after deploy: `https://dev.ourpgtracker.in/api-fn/verifyMemberForApp`
 * Leave null to use the default cloudfunctions.net endpoint (requires a successful deploy).
 */
export const verifyMemberCallableUrl: string | null = null;

export type GymEnvironment = {
  production: boolean;
  firebase: FirebaseOptions;
  verifyMemberCallableUrl: string | null;
};

export const environment: GymEnvironment = {
  production: false,
  firebase: selectedFirebase,
  verifyMemberCallableUrl,
};
