import { describe, expect, it } from 'vitest';
import type { Language } from '../../shared/contract';
import { LANGUAGES } from '../../shared/contract';
import { MESSAGES, translate, type MessageKey } from '../../src/ui/i18n/messages';

const englishKeys = Object.keys(MESSAGES.en).sort() as MessageKey[];

describe('bilingual UI copy (D-057)', () => {
  it('ships exactly the two launched languages', () => {
    expect([...LANGUAGES]).toEqual(['en', 'hi']);
    expect(Object.keys(MESSAGES).sort()).toEqual(['en', 'hi']);
  });

  it.each(LANGUAGES)('%s defines every key', (language: Language) => {
    expect(Object.keys(MESSAGES[language]).sort()).toEqual(englishKeys);
  });

  it.each(LANGUAGES)('%s has no blank strings', (language: Language) => {
    for (const key of englishKeys) {
      expect(MESSAGES[language][key].trim().length, `${language} ${key}`).toBeGreaterThan(0);
    }
  });

  it('writes real Hindi for the chrome, not English fallbacks', () => {
    for (const key of ['nav.home', 'home.start', 'settings.theme'] as const) {
      expect(MESSAGES.hi[key]).not.toBe(MESSAGES.en[key]);
    }
    expect(MESSAGES.hi['nav.home']).toMatch(/[\u0900-\u097F]/);
    expect(MESSAGES.hi['home.start']).toMatch(/[\u0900-\u097F]/);
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'home.goalProgress', { done: 3, goal: 10 })).toBe('3 of 10 questions today');
    expect(translate('hi', 'home.goalProgress', { done: 3, goal: 10 })).toContain('10');
    expect(translate('en', 'home.goalProgress', { done: 3 })).toBe('3 of {goal} questions today');
  });

  it('returns plain copy unchanged when no variables are passed', () => {
    expect(translate('en', 'nav.settings')).toBe('Settings');
    expect(translate('hi', 'nav.settings')).toBe('सेटिंग्स');
  });
});
