import type { FirebaseOptions } from 'firebase/app';

/** Used by `ng serve` (development build + file replacement). Must include `firebase` — same shape as `environment.ts`. */
export const environment = {
  production: false,
  /** Dev/staging Firebase (`ng serve`). Auth host URL: https://test-gym-pg-sass.firebaseapp.com */
  firebase: {
    apiKey: 'AIzaSyCGNjCt4L_O8I1c0r_s_ds3LF-FmU9wQr0',
    authDomain: 'test-gym-pg-sass.firebaseapp.com',
    projectId: 'test-gym-pg-sass',
    storageBucket: 'test-gym-pg-sass.firebasestorage.app',
    messagingSenderId: '445355373149',
    appId: '1:445355373149:web:19b106c0513cae0c21d3b4',
    measurementId: 'G-EQJGVFD2LK',
  } satisfies FirebaseOptions,
};

// PROD (gym-pg-saas) — commented backup:
// firebase: {
//   apiKey: 'AIzaSyApIcrqq8LCL77oIV8emI4Yr0JSGNn5yg8',
//   authDomain: 'gym-pg-saas.firebaseapp.com',
//   projectId: 'gym-pg-saas',
//   storageBucket: 'gym-pg-saas.firebasestorage.app',
//   messagingSenderId: '695170150391',
//   appId: '1:695170150391:web:4875fb5a643516ab2e08f2',
// },

// TEST (test-gym-pg-sass) — commented backup:
// firebase: {
//   apiKey: 'AIzaSyCGNjCt4L_O8I1c0r_s_ds3LF-FmU9wQr0',
//   authDomain: 'test-gym-pg-sass.firebaseapp.com',
//   projectId: 'test-gym-pg-sass',
//   storageBucket: 'test-gym-pg-sass.firebasestorage.app',
//   messagingSenderId: '445355373149',
//   appId: '1:445355373149:web:19b106c0513cae0c21d3b4',
//   measurementId: 'G-EQJGVFD2LK',
// },
