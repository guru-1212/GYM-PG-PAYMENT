import type { FirebaseOptions } from 'firebase/app';

/** `ng serve` — same Firebase as hosted dev build (`environment.ts`); prod keys stay commented there. */
export const environment = {
  production: false,
  firebase: {
    // PROD (gym-pg-saas) — see environment.ts when switching builds to production Firebase

    apiKey: 'AIzaSyCGNjCt4L_O8I1c0r_s_ds3LF-FmU9wQr0',
    authDomain: 'test-gym-pg-sass.firebaseapp.com',
    projectId: 'test-gym-pg-sass',
    storageBucket: 'test-gym-pg-sass.firebasestorage.app',
    messagingSenderId: '445355373149',
    appId: '1:445355373149:web:19b106c0513cae0c21d3b4',
    measurementId: 'G-EQJGVFD2LK',
  } satisfies FirebaseOptions,
};
