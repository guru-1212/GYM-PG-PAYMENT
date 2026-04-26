import {
  selectedFirebase,
  verifyMemberCallableUrl,
  type GymEnvironment,
} from './environment.development';

export const environment: GymEnvironment = {
  production: true,
  firebase: selectedFirebase,
  verifyMemberCallableUrl,
};
