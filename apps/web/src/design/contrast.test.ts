import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/** Pull `--token: #hex;` declarations out of one CSS block. */
function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    out[m[1] as string] = m[2] as string;
  }
  return out;
}

function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unbalanced braces');
}

const light = tokens(blockAfter(':root {'));
const dark = tokens(blockAfter(':root[data-theme="dark"]'));
// The prefers-color-scheme block must define exactly the same dark palette as the manual toggle.
const darkAuto = tokens(blockAfter(':root:not([data-theme="light"])'));

const TEXT_AA = 4.5;
const UI_AA = 3;

const surfaces = ['canvas', 'surface', 'surface-2'] as const;
const pillars = ['employment', 'education', 'training', 'support'] as const;
const statuses = ['success', 'warning', 'danger'] as const;

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme passes WCAG 2.2 AA', (_name, t) => {
  it('body text is readable on every surface', () => {
    for (const s of surfaces) {
      expect(contrast(t.ink as string, t[s] as string), `ink on ${s}`).toBeGreaterThanOrEqual(7);
      expect(
        contrast(t['ink-2'] as string, t[s] as string),
        `ink-2 on ${s}`,
      ).toBeGreaterThanOrEqual(TEXT_AA);
    }
  });

  it('primary buttons and links are readable', () => {
    expect(contrast(t['primary-ink'] as string, t.primary as string)).toBeGreaterThanOrEqual(
      TEXT_AA,
    );
    expect(
      contrast(t['primary-ink'] as string, t['primary-hover'] as string),
    ).toBeGreaterThanOrEqual(TEXT_AA);
    for (const s of ['canvas', 'surface'] as const) {
      expect(
        contrast(t.primary as string, t[s] as string),
        `primary on ${s}`,
      ).toBeGreaterThanOrEqual(TEXT_AA);
    }
    expect(contrast(t.primary as string, t['primary-tint'] as string)).toBeGreaterThanOrEqual(
      TEXT_AA,
    );
  });

  it('every pillar colour is readable as text on its tint and on the page', () => {
    for (const p of pillars) {
      expect(
        contrast(t[p] as string, t[`${p}-tint`] as string),
        `${p} on tint`,
      ).toBeGreaterThanOrEqual(TEXT_AA);
      expect(
        contrast(t[p] as string, t.surface as string),
        `${p} on surface`,
      ).toBeGreaterThanOrEqual(TEXT_AA);
      expect(contrast(t[p] as string, t.canvas as string), `${p} on canvas`).toBeGreaterThanOrEqual(
        TEXT_AA,
      );
    }
  });

  it('status colours are readable on their tints and the page', () => {
    for (const s of statuses) {
      expect(
        contrast(t[s] as string, t[`${s}-tint`] as string),
        `${s} on tint`,
      ).toBeGreaterThanOrEqual(TEXT_AA);
      expect(
        contrast(t[s] as string, t.surface as string),
        `${s} on surface`,
      ).toBeGreaterThanOrEqual(TEXT_AA);
    }
    expect(contrast(t['accent-ink'] as string, t.canvas as string)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it('input borders and focus rings meet the 3:1 non-text contrast rule', () => {
    for (const s of ['canvas', 'surface'] as const) {
      expect(contrast(t.field as string, t[s] as string), `field on ${s}`).toBeGreaterThanOrEqual(
        UI_AA,
      );
      expect(contrast(t.focus as string, t[s] as string), `focus on ${s}`).toBeGreaterThanOrEqual(
        UI_AA,
      );
    }
  });

  it('the logo strike is visible against the page', () => {
    expect(contrast(t.accent as string, t.canvas as string)).toBeGreaterThanOrEqual(UI_AA);
  });
});

describe('dark theme definitions agree', () => {
  it('the automatic (OS) dark palette equals the manual dark palette', () => {
    for (const [key, value] of Object.entries(dark)) {
      expect(darkAuto[key], key).toBe(value);
    }
  });
});
