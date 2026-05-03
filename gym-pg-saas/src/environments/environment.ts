import {
  firebaseProd,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
  appCheckRecaptchaSiteKey,
  type GymEnvironment,
} from './environment.development';

/** Live hosting builds always use production Firebase, independent of `useProdFirebase` in the dev file. */
export const environment: GymEnvironment = {
  production: true,
  firebase: firebaseProd,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
  appCheckRecaptchaSiteKey,
};
