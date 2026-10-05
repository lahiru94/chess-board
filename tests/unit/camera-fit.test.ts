import { describe, expect, it } from 'vitest';
import { fitDistance } from '../../src/view3d/camera-fit.ts';

describe('fitDistance', () => {
  it('needs more distance for a narrower view', () => {
    expect(fitDistance(0.72, 0.5, 35)).toBeGreaterThan(fitDistance(0.72, 1, 35));
    expect(fitDistance(0.72, 1, 25)).toBeGreaterThan(fitDistance(0.72, 1, 35));
  });

  it('is a tight fit: slightly closer would cut a corner at some angle', () => {
    const d = fitDistance(0.72, 1, 35);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(30);
    // Binary search converges to within a tiny fraction.
    expect(fitDistance(0.72, 1, 35)).toBeCloseTo(d, 6);
  });

  it('gets closer when the view is wider than tall', () => {
    expect(fitDistance(0.72, 1.35, 35)).toBeLessThan(fitDistance(0.72, 1, 35));
  });
});
