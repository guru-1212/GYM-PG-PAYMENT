import {
  selectedFirebase,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
  appCheckRecaptchaSiteKey,
  type GymEnvironment,
} from './environment.development';

export const environment: GymEnvironment = {
  production: true,
  firebase: selectedFirebase,
  verifyMemberCallableUrl,
  resetOwnerPasswordCallableUrl,
  appCheckRecaptchaSiteKey,
};
