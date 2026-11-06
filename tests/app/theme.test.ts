import { describe, expect, it } from 'vitest';
import { applyLanguage, applyTheme, resolveSystemTheme, type ThemeTarget } from '../../src/ui/theme';

function fakeTarget(): ThemeTarget & { attributes: Map<string, string> } {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    style: { colorScheme: '' },
  };
}

describe('theme application (D-053)', () => {
  it('follows the phone on first launch', () => {
    expect(resolveSystemTheme(true)).toBe('dark');
    expect(resolveSystemTheme(false)).toBe('light');
  });

  it('sets data-theme and color-scheme together', () => {
    const target = fakeTarget();
    applyTheme('dark', target);
    expect(target.attributes.get('data-theme')).toBe('dark');
    expect(target.style.colorScheme).toBe('dark');
  });

  it('switches back to light without leaving the dark hint behind', () => {
    const target = fakeTarget();
    applyTheme('dark', target);
    applyTheme('light', target);
    expect(target.attributes.get('data-theme')).toBe('light');
    expect(target.style.colorScheme).toBe('light');
  });

  it('marks the document language so :lang(hi) line-height applies', () => {
    const target = fakeTarget();
    applyLanguage('hi', target);
    expect(target.attributes.get('lang')).toBe('hi');
    applyLanguage('en', target);
    expect(target.attributes.get('lang')).toBe('en');
  });
});
