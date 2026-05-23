import { accumulateSH3FromDirectional } from '../../src/3d/LightProbeManager';

// Analytical SH3 irradiance constants used in the helper (Ramamoorthi-Hanrahan
// 2001). These mirror the helper exactly — the test asserts the closed-form
// values match a hand-derivation so future shader/three.js drift would be
// caught here before silently changing the look of the drum interior.
const A0_Y0 = Math.PI * (1 / (2 * Math.sqrt(Math.PI)));            // l=0
const A1_Y1 = (2 * Math.PI / 3) * Math.sqrt(3 / (4 * Math.PI));    // l=1 (linear)
const A2_AB = (Math.PI / 4) * (Math.sqrt(15 / Math.PI) / 2);       // l=2 (xy/yz/xz)
const A2_Y2_0 = (Math.PI / 4) * Math.sqrt(5 / (16 * Math.PI));     // l=2 (3z²−1)
const A2_Y2_2 = (Math.PI / 4) * (Math.sqrt(15 / Math.PI) / 4);     // l=2 (x²−y²)

// Float32Array roundoff floor; ~5–6 decimals of precision.
const TOL = 1e-6;

describe('accumulateSH3FromDirectional', () => {
  it('produces the closed-form coefficients for a single +Z, white emitter', () => {
    const c = new Float32Array(27);
    accumulateSH3FromDirectional(c, 0, 0, 1, 1, 1, 1);

    // l=0 constant — equal across channels.
    expect(c[0]).toBeCloseTo(A0_Y0, 5);
    expect(c[1]).toBeCloseTo(A0_Y0, 5);
    expect(c[2]).toBeCloseTo(A0_Y0, 5);

    // l=1: only Y(1,0)·z is nonzero for d=(0,0,1).
    expect(c[3]).toBeCloseTo(0, 5);  expect(c[4]).toBeCloseTo(0, 5); expect(c[5]).toBeCloseTo(0, 5);
    expect(c[6]).toBeCloseTo(A1_Y1, 5);
    expect(c[7]).toBeCloseTo(A1_Y1, 5);
    expect(c[8]).toBeCloseTo(A1_Y1, 5);
    expect(c[9]).toBeCloseTo(0, 5);  expect(c[10]).toBeCloseTo(0, 5); expect(c[11]).toBeCloseTo(0, 5);

    // l=2: xy, yz, xz all zero. Y(2,0)=A2·c·(3·1−1)=2·A2_Y2_0. Y(2,2)=0.
    expect(c[12]).toBeCloseTo(0, 5); expect(c[15]).toBeCloseTo(0, 5); expect(c[21]).toBeCloseTo(0, 5);
    expect(c[18]).toBeCloseTo(2 * A2_Y2_0, 5);
    expect(c[19]).toBeCloseTo(2 * A2_Y2_0, 5);
    expect(c[20]).toBeCloseTo(2 * A2_Y2_0, 5);
    expect(c[24]).toBeCloseTo(0, 5);
  });

  it('produces the closed-form coefficients for a +X red emitter (l=1 / l=2 asymmetry)', () => {
    const c = new Float32Array(27);
    accumulateSH3FromDirectional(c, 1, 0, 0, 1, 0, 0); // pure red, +X

    // l=0: R only.
    expect(c[0]).toBeCloseTo(A0_Y0, 5);
    expect(c[1]).toBeCloseTo(0, 5);
    expect(c[2]).toBeCloseTo(0, 5);

    // l=1: only Y(1,1)·x — channel R only.
    expect(c[3]).toBeCloseTo(0, 5);  expect(c[6]).toBeCloseTo(0, 5);
    expect(c[9]).toBeCloseTo(A1_Y1, 5);
    expect(c[10]).toBeCloseTo(0, 5);
    expect(c[11]).toBeCloseTo(0, 5);

    // l=2: Y(2,0)·(3·0−1) = −A2_Y2_0; Y(2,2)·(1−0) = A2_Y2_2; others zero.
    expect(c[12]).toBeCloseTo(0, 5);
    expect(c[15]).toBeCloseTo(0, 5);
    expect(c[18]).toBeCloseTo(-A2_Y2_0, 5);
    expect(c[19]).toBeCloseTo(0, 5);
    expect(c[20]).toBeCloseTo(0, 5);
    expect(c[21]).toBeCloseTo(0, 5);
    expect(c[24]).toBeCloseTo(A2_Y2_2, 5);
  });

  it('symmetry: two opposite emitters cancel l=1 (linear) terms', () => {
    const c = new Float32Array(27);
    // Same color, equal magnitude, opposite directions
    accumulateSH3FromDirectional(c, 1, 0, 0, 0.7, 0.7, 0.7);
    accumulateSH3FromDirectional(c, -1, 0, 0, 0.7, 0.7, 0.7);

    // l=0 doubles (no direction dependence).
    expect(c[0]).toBeCloseTo(2 * 0.7 * A0_Y0, 5);
    // l=1 (indices 3–11) all cancel to zero.
    for (let i = 3; i <= 11; i++) expect(Math.abs(c[i])).toBeLessThan(TOL);
    // l=2 (3z²−1) and (x²−y²) survive — both depend on squared coords.
    expect(c[18]).toBeCloseTo(2 * 0.7 * -A2_Y2_0, 5);
    expect(c[24]).toBeCloseTo(2 * 0.7 *  A2_Y2_2, 5);
  });

  it('linearity: scaling radiance scales coefficients proportionally', () => {
    const c1 = new Float32Array(27);
    const c2 = new Float32Array(27);
    accumulateSH3FromDirectional(c1, 0.3, 0.6, Math.sqrt(1 - 0.09 - 0.36), 1, 0.5, 0.25);
    accumulateSH3FromDirectional(c2, 0.3, 0.6, Math.sqrt(1 - 0.09 - 0.36), 2, 1.0, 0.5);
    for (let i = 0; i < 27; i++) {
      expect(c2[i]).toBeCloseTo(c1[i] * 2, 5);
    }
  });

  it('channel independence: per-channel radiance does not bleed between R/G/B', () => {
    const cR = new Float32Array(27);
    const cG = new Float32Array(27);
    const cB = new Float32Array(27);
    const cAll = new Float32Array(27);

    accumulateSH3FromDirectional(cR, 0.5, 0.5, Math.sqrt(0.5), 1, 0, 0);
    accumulateSH3FromDirectional(cG, 0.5, 0.5, Math.sqrt(0.5), 0, 1, 0);
    accumulateSH3FromDirectional(cB, 0.5, 0.5, Math.sqrt(0.5), 0, 0, 1);
    accumulateSH3FromDirectional(cAll, 0.5, 0.5, Math.sqrt(0.5), 1, 1, 1);

    // For each SH coefficient index, channel R should come only from cR, etc.
    for (let i = 0; i < 9; i++) {
      const o = i * 3;
      expect(cAll[o + 0]).toBeCloseTo(cR[o + 0], 5);
      expect(cAll[o + 1]).toBeCloseTo(cG[o + 1], 5);
      expect(cAll[o + 2]).toBeCloseTo(cB[o + 2], 5);
      // The other-channel offsets in cR/G/B are zero.
      expect(cR[o + 1]).toBe(0); expect(cR[o + 2]).toBe(0);
      expect(cG[o + 0]).toBe(0); expect(cG[o + 2]).toBe(0);
      expect(cB[o + 0]).toBe(0); expect(cB[o + 1]).toBe(0);
    }
  });

  it('zero radiance contributes nothing', () => {
    const c = new Float32Array(27);
    accumulateSH3FromDirectional(c, 1, 0, 0, 0, 0, 0);
    for (let i = 0; i < 27; i++) expect(c[i]).toBe(0);
  });

  it('multiple emitters accumulate (sum of two equals one-pass with summed radiances)', () => {
    const a = new Float32Array(27);
    const b = new Float32Array(27);
    const sum = new Float32Array(27);

    accumulateSH3FromDirectional(a, 1, 0, 0, 0.3, 0.4, 0.5);
    accumulateSH3FromDirectional(a, 0, 1, 0, 0.2, 0.1, 0.6);

    accumulateSH3FromDirectional(b, 1, 0, 0, 0.3, 0.4, 0.5);
    accumulateSH3FromDirectional(sum, 0, 1, 0, 0.2, 0.1, 0.6);
    for (let i = 0; i < 27; i++) sum[i] += b[i];

    for (let i = 0; i < 27; i++) expect(a[i]).toBeCloseTo(sum[i], 6);
  });
});
