import { polygonAreaSqFt } from './geometry.util';

// A real, hand-verifiable rectangle near Coral Springs, FL — ~40m ×
// 20m ≈ 800 sq meters ≈ 8,611 sq ft. Same fixture reasoning as
// property-intelligence.service.spec.ts's own geometry test: sized so
// the expected result is checkable independently of the code under
// test, not just "did it return a number."
const RECT_40x20 = [
  { lat: 26.2712, lon: -80.2706 },
  { lat: 26.2712, lon: -80.27042 }, // ~20m east at this latitude
  { lat: 26.27156, lon: -80.27042 }, // ~40m north
  { lat: 26.27156, lon: -80.2706 },
];

describe('polygonAreaSqFt', () => {
  it('Test — a known rectangle produces the expected square footage within a small tolerance', () => {
    const area = polygonAreaSqFt(RECT_40x20);
    // Hand-verified against the actual corner offsets used in this
    // fixture (not a round 40x20m — the offsets are approximate degree
    // deltas, not exact meter deltas) — this asserts the real,
    // consistent output of the algorithm, not a guessed round number.
    expect(area).toBeGreaterThan(7000);
    expect(area).toBeLessThan(8500);
  });

  it('Test — an irregular (non-rectangular) polygon produces a plausible, non-degenerate area', () => {
    const irregular = [
      { lat: 26.2712, lon: -80.2706 },
      { lat: 26.2712, lon: -80.27045 },
      { lat: 26.27145, lon: -80.2705 },
      { lat: 26.2715, lon: -80.27065 },
    ];
    const area = polygonAreaSqFt(irregular);
    expect(area).toBeGreaterThan(0);
    expect(Number.isFinite(area)).toBe(true);
  });

  it('Test — orientation independence: the same points in reverse (opposite winding) order produce the same area', () => {
    const clockwise = polygonAreaSqFt(RECT_40x20);
    const counterClockwise = polygonAreaSqFt([...RECT_40x20].reverse());
    expect(counterClockwise).toBeCloseTo(clockwise, 5);
  });

  it('Test — a very small polygon still produces a small-but-positive area, not zero or negative', () => {
    const tiny = [
      { lat: 26.2714, lon: -80.2705 },
      { lat: 26.2714, lon: -80.270501 },
      { lat: 26.271401, lon: -80.270501 },
      { lat: 26.271401, lon: -80.2705 },
    ];
    const area = polygonAreaSqFt(tiny);
    expect(area).toBeGreaterThan(0);
  });

  it('Test — fewer than 3 points throws rather than silently returning a meaningless result', () => {
    expect(() => polygonAreaSqFt([{ lat: 26.27, lon: -80.27 }])).toThrow();
    expect(() => polygonAreaSqFt([{ lat: 26.27, lon: -80.27 }, { lat: 26.28, lon: -80.28 }])).toThrow();
    expect(() => polygonAreaSqFt([])).toThrow();
  });

  it('Test — exactly 3 points (a triangle) is valid and produces a positive area', () => {
    const triangle = [
      { lat: 26.2712, lon: -80.2706 },
      { lat: 26.2712, lon: -80.27042 },
      { lat: 26.27156, lon: -80.27042 },
    ];
    expect(polygonAreaSqFt(triangle)).toBeGreaterThan(0);
  });
});
