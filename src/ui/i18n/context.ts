import { getContext, setContext } from 'svelte';
import type { Language } from '../../../shared/contract';
import type { MessageKey, Translate } from './messages';

/** What every screen reads: the current language and a bound translator. */
export interface I18n {
  readonly language: Language;
  readonly t: Translate;
}

const KEY = Symbol('cgl-i18n');

/** Called once by App.svelte during component initialisation. */
export function provideI18n(value: I18n): void {
  setContext(KEY, value);
}

/** Reading `value.language` inside a template tracks the language state. */
export function useI18n(): I18n {
  const value = getContext<I18n | undefined>(KEY);
  if (value === undefined) {
    throw new Error('useI18n must be called inside a screen mounted by App.svelte');
  }
  return value;
}

export type { MessageKey };
