import type { Language, ThemePreference } from '../../shared/contract';

/**
 * Theme and language application (D-053, D-058).
 *
 * The smallest possible DOM surface is a function argument, which keeps the
 * rules testable in Node without a browser or jsdom.
 */

export const THEME_HINT_KEY = 'cgl.theme';

export interface ThemeTarget {
  setAttribute(name: string, value: string): void;
  readonly style: { colorScheme: string };
}

export type AttributeTarget = Pick<ThemeTarget, 'setAttribute'>;

/** First launch follows the phone; after that the stored choice wins. */
export function resolveSystemTheme(prefersDark: boolean): ThemePreference {
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: ThemePreference, target: ThemeTarget): void {
  target.setAttribute('data-theme', theme);
  target.style.colorScheme = theme;
}

export function applyLanguage(language: Language, target: AttributeTarget): void {
  target.setAttribute('lang', language);
}

/**
 * Synchronous mirror read by `index.html` before the first paint. IndexedDB is
 * the source of truth; this only prevents a light flash for dark-mode students.
 */
export function readThemeHint(): ThemePreference | null {
  try {
    const value = globalThis.localStorage?.getItem(THEME_HINT_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function writeThemeHint(theme: ThemePreference): void {
  try {
    globalThis.localStorage?.setItem(THEME_HINT_KEY, theme);
  } catch {
    /* storage can be unavailable; the next boot simply uses the default */
  }
}
