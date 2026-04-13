import type { FirebaseOptions } from 'firebase/app';

/**
 * Used for the default `ng build` (e.g. CI / hosted **dev** environment).
 * Firebase uses the **test** project; uncomment the prod fields below when you ship to real production.
 */
export const environment = {
  production: false,
  firebase: {
    // PROD (gym-pg-saas) — enable when deploying to production hosting:
    // apiKey: 'AIzaSyApIcrqq8LCL77oIV8emI4Yr0JSGNn5yg8',
    // authDomain: 'gym-pg-saas.firebaseapp.com',
    // projectId: 'gym-pg-saas',
    // storageBucket: 'gym-pg-saas.firebasestorage.app',
    // messagingSenderId: '695170150391',
    // appId: '1:695170150391:web:4875fb5a643516ab2e08f2',

    // DEV / staging (test-gym-pg-sass)
    apiKey: 'AIzaSyCGNjCt4L_O8I1c0r_s_ds3LF-FmU9wQr0',
    authDomain: 'test-gym-pg-sass.firebaseapp.com',
    projectId: 'test-gym-pg-sass',
    storageBucket: 'test-gym-pg-sass.firebasestorage.app',
    messagingSenderId: '445355373149',
    appId: '1:445355373149:web:19b106c0513cae0c21d3b4',
    measurementId: 'G-EQJGVFD2LK',
  } satisfies FirebaseOptions,
};
