import { describe, expect, it } from 'vitest';
import { hintText } from './hint';
import { rectInBounds } from './draw';

describe('hintText', () => {
  it('credits Gemini only for ai focus', () => {
    expect(hintText(5, 137, 'ai')).toBe('Gemini zoomed in to 5 of 137 communities');
    expect(hintText(5, 137, 'user')).toBe('Showing 5 of 137 communities');
    expect(hintText(5, 137)).toBe('Showing 5 of 137 communities');
  });
});

describe('rectInBounds', () => {
  const b = { x: 8, y: 8, w: 374, h: 800 };
  it('accepts inside and rejects overflow', () => {
    expect(rectInBounds({ x: 10, y: 10, w: 100, h: 20 }, b)).toBe(true);
    expect(rectInBounds({ x: 300, y: 10, w: 100, h: 20 }, b)).toBe(false);
    expect(rectInBounds({ x: 2, y: 10, w: 50, h: 20 }, b)).toBe(false);
  });
});
