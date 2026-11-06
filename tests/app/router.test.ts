import { describe, expect, it } from 'vitest';
import { buildHref, matchPath, parseHash } from '../../src/app/router';

describe('parseHash', () => {
  it.each([
    ['#/practice/polity', 'practice/polity'],
    ['#practice', 'practice'],
    ['#/progress/', 'progress'],
    ['#', ''],
    ['', ''],
  ])('%s → %s', (hash, expected) => {
    expect(parseHash(hash)).toBe(expected);
  });
});

describe('buildHref', () => {
  it.each([
    ['/home', '#/home'],
    ['home', '#/home'],
    ['practice/polity', '#/practice/polity'],
    ['/', '#/'],
    ['', '#/'],
  ])('%s → %s', (path, expected) => {
    expect(buildHref(path)).toBe(expected);
  });
});

describe('matchPath (D-056)', () => {
  it.each(['', '/', 'home', '/home/'])('treats %s as Home', (path) => {
    expect(matchPath(path)).toEqual({ name: 'home' });
  });

  it('matches Practice with and without a subtopic', () => {
    expect(matchPath('practice')).toEqual({ name: 'practice', subtopic: null });
    expect(matchPath('/practice/polity-fr')).toEqual({
      name: 'practice',
      subtopic: 'polity-fr',
    });
  });

  it('decodes URL-encoded subtopics', () => {
    expect(matchPath('practice/current%20affairs')).toEqual({
      name: 'practice',
      subtopic: 'current affairs',
    });
  });

  it('matches a mock id, Progress and Settings', () => {
    expect(matchPath('mock/mock-2026-11')).toEqual({ name: 'mock', id: 'mock-2026-11' });
    expect(matchPath('progress')).toEqual({ name: 'progress' });
    expect(matchPath('settings')).toEqual({ name: 'settings' });
  });

  it('falls back to a renderable 404 for anything else', () => {
    expect(matchPath('nope')).toEqual({ name: 'not-found', path: 'nope' });
    expect(matchPath('practice/a/b')).toEqual({ name: 'not-found', path: 'practice/a/b' });
    expect(matchPath('mock')).toEqual({ name: 'not-found', path: 'mock' });
  });
});
