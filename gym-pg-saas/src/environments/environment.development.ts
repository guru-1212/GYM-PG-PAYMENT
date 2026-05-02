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
 * Optional same-origin URL for the callable (Firebase Hosting rewrite in firebase.json).
 * Example after deploy: `https://dev.ourpgtracker.in/api-fn/verifyMemberForApp`
 * Leave null to use the default cloudfunctions.net endpoint (requires a successful deploy).
 */
export const verifyMemberCallableUrl: string | null = null;

/**
 * Optional full URL for the owner phone-OTP password reset callable (Hosting rewrite).
 * Live builds use same-origin `/api-fn/resetOwnerPasswordWithPhoneOtp` automatically.
 * On **localhost** with production Firebase, some networks block `*.cloudfunctions.net`;
 * set this to your deployed site (e.g. `https://ourpgtracker.in/api-fn/resetOwnerPasswordWithPhoneOtp`)
 * so the reset flow matches the behaviour you verified on the test/staging project.
 */
export const resetOwnerPasswordCallableUrl: string | null = null;

export type GymEnvironment = {
  production: boolean;
  firebase: FirebaseOptions;
  verifyMemberCallableUrl: string | null;
  resetOwnerPasswordCallableUrl: string | null;
};

export const environment: GymEnvironment = {
  production: false,
  firebase: selectedFirebase,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
};
