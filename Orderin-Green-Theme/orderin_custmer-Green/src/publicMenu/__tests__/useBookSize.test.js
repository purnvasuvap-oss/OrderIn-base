import { describe, it, expect } from 'vitest';
import { computeBookSize, PAGE_RATIO } from '../useBookSize';

// CSS viewport sizes of real devices (portrait and landscape) plus desktops.
const VIEWPORTS = {
  'Galaxy Z Fold cover': [280, 653],
  'iPhone SE (1st gen)': [320, 568],
  'Galaxy S8': [360, 740],
  'iPhone SE (3rd gen)': [375, 667],
  'iPhone 13': [390, 844],
  'Pixel 7': [412, 915],
  'iPhone 15 Pro Max': [430, 932],
  'iPad Mini': [768, 1024],
  'Galaxy Tab S9': [800, 1280],
  'iPad Pro 11': [834, 1194],
  'iPhone SE landscape': [667, 375],
  'iPhone 15 Pro Max landscape': [932, 430],
  'Galaxy S8 landscape': [740, 360],
  'iPad Mini landscape': [1024, 768],
  'Netbook': [1024, 600],
  'Laptop 1366': [1366, 768],
  'Desktop 1920': [1920, 1080],
  'Desktop 2560': [2560, 1440],
};

const OUTER_PAD = 16;
const CONTROLS_H = 56;
const SIDE_CONTROLS_W = 112;

describe('computeBookSize', () => {
  it.each(Object.entries(VIEWPORTS))('%s: page and controls fit, single page, cards fit', (_, [vw, vh]) => {
    const s = computeBookSize(vw, vh);

    // Ratio is kept for the chosen layout.
    expect(Math.abs(s.width / s.height - PAGE_RATIO[s.mode])).toBeLessThan(0.02);

    // Page + controls fit inside the viewport (tiny 280px screens may hit the 200px floor).
    if (s.mode === 'tall') {
      expect(s.height + CONTROLS_H + OUTER_PAD * 2).toBeLessThanOrEqual(vh);
      if (vw >= 240) expect(s.width + OUTER_PAD * 2).toBeLessThanOrEqual(vw);
    } else {
      expect(s.height + OUTER_PAD * 2).toBeLessThanOrEqual(vh);
      expect(s.width + SIDE_CONTROLS_W + OUTER_PAD * 2).toBeLessThanOrEqual(vw);
    }

    // Always a single page: the engine shows a spread only if width >= 2 * 260.
    expect(s.width).toBeLessThan(520);

    // The cards on one page fit without scrolling (88px chrome, 118px per card, last gap 12px).
    expect(s.cardsPerPage).toBeGreaterThanOrEqual(1);
    expect(88 + s.cardsPerPage * 118 - 12).toBeLessThanOrEqual(s.height);
  });

  it('uses the side-controls layout only on short landscape screens', () => {
    expect(computeBookSize(844, 390).mode).toBe('wide');
    expect(computeBookSize(390, 844).mode).toBe('tall');
    expect(computeBookSize(1366, 768).mode).toBe('tall');
  });
});
