import type { FirebaseOptions } from 'firebase/app';

const firebaseProd: FirebaseOptions = {
  apiKey: 'AIzaSyApIcrqq8LCL77oIV8emI4Yr0JSGNn5yg8',
  authDomain: 'gym-pg-saas.firebaseapp.com',
  projectId: 'gym-pg-saas',
  storageBucket: 'gym-pg-saas.firebasestorage.app',
  messagingSenderId: '695170150391',
  appId: '1:695170150391:web:4875fb5a643516ab2e08f2',
};

const firebaseTest: FirebaseOptions = {
  apiKey: 'AIzaSyCGNjCt4L_O8I1c0r_s_ds3LF-FmU9wQr0',
  authDomain: 'test-gym-pg-sass.firebaseapp.com',
  projectId: 'test-gym-pg-sass',
  storageBucket: 'test-gym-pg-sass.firebasestorage.app',
  messagingSenderId: '445355373149',
  appId: '1:445355373149:web:19b106c0513cae0c21d3b4',
  measurementId: 'G-EQJGVFD2LK',
};

/**
 * One-place switch:
 * true  => use production Firebase
 * false => use test Firebase
 */
export const useProdFirebase = true;
export const selectedFirebase: FirebaseOptions = useProdFirebase ? firebaseProd : firebaseTest;

/**
 * Direct Firebase Cloud Functions URL - works on any hosting platform.
 * Set to null to use direct Firebase callable (like localhost).
 */
export const verifyMemberCallableUrl: string | null = 'https://us-central1-gym-pg-saas.cloudfunctions.net/verifyMemberForApp';

/**
 * Use null to always use direct Firebase callable (same as localhost).
 */
export const resetOwnerPasswordCallableUrl: string | null = null;

/**
 * reCAPTCHA **v3** site key (public) for Firebase App Check — e.g. key named `gym-pg-sass-production` in Google reCAPTCHA.
 * Register the matching **secret** in Firebase Console → App Check. Phone Auth still uses its own verifier; this helps
 * attested requests when App Check enforcement is enabled.
 */
export const appCheckRecaptchaSiteKey: string | null = useProdFirebase
  ? '6LdbFNYsAAAAAGkVPtOkXfd4OmRPeSmfMYIKMkZl'
  : null;

export type GymEnvironment = {
  production: boolean;
  firebase: FirebaseOptions;
  verifyMemberCallableUrl: string | null;
  resetOwnerPasswordCallableUrl: string | null;
  appCheckRecaptchaSiteKey: string | null;
};

export const environment: GymEnvironment = {
  production: false,
  firebase: selectedFirebase,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
  appCheckRecaptchaSiteKey,
};
