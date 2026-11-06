import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI = join(process.cwd(), 'src', 'ui');
const tokensCss = readFileSync(join(UI, 'tokens.css'), 'utf8');
const baseCss = readFileSync(join(UI, 'base.css'), 'utf8');
const componentsCss = readFileSync(join(UI, 'components.css'), 'utf8');
const fontsCss = readFileSync(join(UI, 'fonts.css'), 'utf8');
const indexCss = readFileSync(join(UI, 'index.css'), 'utf8');

type Palette = Readonly<Record<string, string>>;

/** Reads the `--name: value;` declarations inside one CSS block. */
function readBlock(css: string, opener: string): Palette {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`missing block ${opener} in tokens.css`);
  const end = css.indexOf('\n}', start);
  if (end === -1) throw new Error(`unterminated block ${opener}`);
  const body = css.slice(start + opener.length, end);

  const entries: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    entries[name] = value.trim();
  }
  return entries;
}

const light = readBlock(tokensCss, ':root {');
const darkOverrides = readBlock(tokensCss, "html[data-theme='dark'] {");
const dark: Palette = { ...light, ...darkOverrides };

/** Resolves `var(--x)` chains against one palette. */
function resolver(palette: Palette): (name: string) => string {
  const get = (name: string, depth = 0): string => {
    if (depth > 10) throw new Error(`var() cycle at --${name}`);
    const value = palette[name];
    if (value === undefined) throw new Error(`unknown token --${name}`);
    const reference = /^var\(\s*--([a-z0-9-]+)\s*\)$/.exec(value);
    return reference?.[1] === undefined ? value : get(reference[1], depth + 1);
  };
  return get;
}

function channels(hex: string): { r: number; g: number; b: number } {
  const digits = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(digits)) throw new Error(`not a 6-digit hex colour: ${hex}`);
  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
  };
}

function luminance(hex: string): number {
  const { r, g, b } = channels(hex);
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function rem(value: string | undefined): number {
  if (value === undefined) return Number.NaN;
  const match = /^([\d.]+)rem$/.exec(value.trim());
  return match?.[1] === undefined ? Number.NaN : Number(match[1]) * 16;
}

interface Pair {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
}

/**
 * Text pairs must reach 4.5:1 (WCAG 1.4.3, normal text). The strong border is a
 * non-text boundary and must reach 3:1 (WCAG 1.4.11).
 */
const PAIRS: readonly Pair[] = [
  { foreground: 'color-text', background: 'color-bg', minimum: 4.5 },
  { foreground: 'color-text', background: 'color-surface', minimum: 4.5 },
  { foreground: 'color-text', background: 'color-surface-2', minimum: 4.5 },
  { foreground: 'color-text', background: 'color-surface-3', minimum: 4.5 },
  { foreground: 'color-text-muted', background: 'color-bg', minimum: 4.5 },
  { foreground: 'color-text-muted', background: 'color-surface', minimum: 4.5 },
  { foreground: 'color-text-subtle', background: 'color-surface', minimum: 4.5 },
  { foreground: 'color-accent', background: 'color-bg', minimum: 4.5 },
  { foreground: 'color-accent', background: 'color-surface', minimum: 4.5 },
  { foreground: 'color-accent', background: 'color-accent-subtle', minimum: 4.5 },
  { foreground: 'color-on-accent', background: 'color-accent', minimum: 4.5 },
  { foreground: 'color-on-danger', background: 'color-danger', minimum: 4.5 },
  { foreground: 'color-success', background: 'color-success-bg', minimum: 4.5 },
  { foreground: 'color-danger', background: 'color-danger-bg', minimum: 4.5 },
  { foreground: 'color-warning', background: 'color-warning-bg', minimum: 4.5 },
  { foreground: 'color-info', background: 'color-info-bg', minimum: 4.5 },
  { foreground: 'color-border-strong', background: 'color-surface', minimum: 3 },
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s palette contrast (D-053)', (_theme, palette) => {
  const get = resolver(palette);

  it.each(PAIRS)('$foreground on $background ≥ $minimum', ({ foreground, background, minimum }) => {
    const ratio = contrast(get(foreground), get(background));
    expect(
      ratio,
      `${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`,
    ).toBeGreaterThanOrEqual(minimum);
  });
});

describe('token discipline (D-051)', () => {
  it('overrides every colour in both themes', () => {
    const missing = Object.keys(light)
      .filter((name) => name.startsWith('color-'))
      .filter((name) => darkOverrides[name] === undefined);
    expect(missing).toEqual([]);
  });

  it('defines every var() used by base and component CSS', () => {
    const known = new Set(Object.keys(light));
    for (const [file, css] of [
      ['base.css', baseCss],
      ['components.css', componentsCss],
    ] as const) {
      for (const match of css.matchAll(/var\(\s*--([a-z0-9-]+)/g)) {
        expect(known.has(match[1] ?? ''), `${file} uses undefined --${match[1]}`).toBe(true);
      }
    }
  });

  it('hard-codes no colours outside tokens.css', () => {
    for (const [file, css] of [
      ['base.css', baseCss],
      ['components.css', componentsCss],
    ] as const) {
      expect(css, `${file} contains a hex colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css, `${file} contains a colour function`).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    }
  });
});

describe('size and density targets (D-054)', () => {
  it('keeps body text at 16px or larger', () => {
    expect(rem(light['font-size-base'])).toBeGreaterThanOrEqual(16);
  });

  it('keeps the body line-height at 1.5 or more', () => {
    expect(Number(light['line-height-base'])).toBeGreaterThanOrEqual(1.5);
  });

  it('keeps every tap target at 48px or larger', () => {
    expect(rem(light['tap-min'])).toBeGreaterThanOrEqual(48);
    expect(rem(light['bottom-nav-height'])).toBeGreaterThanOrEqual(48);
    expect(componentsCss).toContain('min-height: var(--tap-min)');
  });

  it('reserves extra line-height for Devanagari', () => {
    expect(Number(light['line-height-relaxed'])).toBeGreaterThan(Number(light['line-height-base']));
    expect(baseCss).toMatch(/:lang\(hi\)\s*\{[^}]*line-height:\s*var\(--line-height-relaxed\)/);
  });

  it('imports the layers in dependency order', () => {
    const order = ['./fonts.css', './tokens.css', './base.css', './components.css'].map((name) =>
      indexCss.indexOf(name),
    );
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('self-hosted Mukta (D-052)', () => {
  const faces = [...fontsCss.matchAll(/@font-face\s*\{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .filter((face): face is string => face !== undefined);

  it('declares a Devanagari and a Latin face for 400, 600 and 700', () => {
    expect(faces).toHaveLength(6);
    for (const weight of ['400', '600', '700']) {
      expect(fontsCss).toContain(`font-weight: ${weight};`);
    }
    expect(faces.filter((face) => face.includes('mukta-400-'))).toHaveLength(2);
  });

  it('ships every referenced file as a real woff2', () => {
    const files = faces
      .map((face) => /url\('\.\/fonts\/([^']+\.woff2)'\)/.exec(face)?.[1])
      .filter((name): name is string => name !== undefined);
    expect(files).toHaveLength(6);

    for (const file of files) {
      const path = join(UI, 'fonts', file);
      expect(statSync(path).size).toBeGreaterThan(1000);
      expect(readFileSync(path).subarray(0, 4).toString('ascii')).toBe('wOF2');
    }
  });

  it('declares a unicode-range on every face', () => {
    for (const face of faces) {
      expect(face).toContain('font-display: swap;');
      expect(face).toMatch(/unicode-range:\s*U\+/);
      expect(face).toContain("font-family: 'Mukta';");
    }
  });

  it('keeps the six faces under 250 KB uncompressed', () => {
    const total = readdirSync(join(UI, 'fonts'))
      .filter((file) => file.endsWith('.woff2'))
      .reduce((sum, file) => sum + statSync(join(UI, 'fonts', file)).size, 0);
    expect(total).toBeLessThanOrEqual(250 * 1024);
  });

  it('ships the OFL licence', () => {
    const licence = readFileSync(join(UI, 'fonts', 'OFL.txt'), 'utf8');
    expect(licence).toContain('SIL OPEN FONT LICENSE');
    expect(licence).toContain('Ek Type');
  });
});
