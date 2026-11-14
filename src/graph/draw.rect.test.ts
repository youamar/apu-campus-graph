import { describe, expect, it } from 'vitest';
import { rectInBounds } from './draw';

describe('rectInBounds', () => {
  const b = { x: 8, y: 8, w: 374, h: 800 };
  it('accepts inside and rejects overflow (narrow phone bounds)', () => {
    expect(rectInBounds({ x: 10, y: 10, w: 100, h: 20 }, b)).toBe(true);
    expect(rectInBounds({ x: 300, y: 10, w: 100, h: 20 }, b)).toBe(false);
    expect(rectInBounds({ x: 2, y: 10, w: 50, h: 20 }, b)).toBe(false);
  });
});
