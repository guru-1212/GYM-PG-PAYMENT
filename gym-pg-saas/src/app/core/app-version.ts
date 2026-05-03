/**
 * Bumping this constant triggers a one-time client-side cache reset on next load:
 * - Service workers are unregistered.
 * - Cache Storage entries are deleted.
 * - localStorage / sessionStorage are cleared (theme preference is preserved).
 * - The app does a hard reload from the server.
 *
 * Bump it whenever a deployment ships UI/logic that older cached clients
 * must not keep running. Use semver-style strings (e.g. "1.0.2", "1.1.0").
 supervisor chagnes done in this branch 
 */
export const APP_VERSION = '1.0.8';
