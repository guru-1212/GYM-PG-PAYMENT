import {
  firebaseTest,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
  appCheckRecaptchaSiteKey,
  type GymEnvironment,
} from './environment.development';

/**
 * `ng build --configuration=production` (hosted dev/www).
 * **Test Firebase only** (`test-gym-pg-sass`). To ship live again: import `firebaseProd` from
 * `./environment.development` and set `firebase: firebaseProd`.
 */
export const environment: GymEnvironment = {
  production: true,
  firebase: firebaseTest,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
  appCheckRecaptchaSiteKey,
};
