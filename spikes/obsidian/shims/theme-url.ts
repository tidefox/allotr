// The SSRF-guarded theme fetch needs node:dns and node:https.
export const THEME_URL_TIMEOUT_MS = 5000;
export const THEME_URL_MAX_BYTES = 64 * 1024;
export class ThemeUrlError extends Error {
  readonly reason = 'unavailable';
}
export const fetchThemeText = async (): Promise<never> => {
  throw new ThemeUrlError('Importing a theme from a URL is not available here.');
};
