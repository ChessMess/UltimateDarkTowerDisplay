import * as THREE from 'three';
import type { SealBacklightRef } from './SealManager';

/**
 * §4.5 (lighting bake-off): replaces the 12 seal-accent PointLights with one
 * scene-level THREE.LightProbe whose 9 RGB SH3 coefficients are recomputed
 * each frame from the live seal-LED positions × colors × intensities.
 *
 * Math reference: irradiance from a directional source at world direction `d`
 * with per-channel radiance `L_c`, evaluated against a surface normal `n`,
 * equals `L_c · max(0, n·d)`. This clamped-cosine response has a closed-form
 * 9-term SH expansion (Ramamoorthi-Hanrahan 2001, "An Efficient Representation
 * for Irradiance Environment Maps"):
 *
 *     E_lm = L_c · A_l · Y_lm(d)
 *
 * where the cosine-lobe convolution weights are A_0 = π, A_1 = 2π/3, A_2 = π/4
 * and Y_lm are the real spherical harmonic basis functions. We sum over the
 * 12 emitters; three.js's renderer evaluates the resulting SH at every
 * MeshStandardMaterial fragment via the stock `getLightProbeIrradiance` helper
 * (cost = 9-term dot product per fragment, independent of emitter count).
 *
 * Limitations:
 *  - No spatial falloff. The probe represents a single point in space, so the
 *    drum interior receives a smooth global tint — no per-seal hot spots.
 *  - LED color is assumed shared across all 12 emitters (see SealManager
 *    `sealBacklights.color`); the per-emitter intensity is `driver.v · scale`.
 *
 * Citations:
 *  - https://threejs.org/docs/#api/en/lights/LightProbe
 *  - https://cseweb.ucsd.edu/~ravir/papers/envmap/envmap.pdf
 *  - https://threejs.org/docs/#api/en/math/SphericalHarmonics3
 */

// SH3 basis evaluated at direction (x,y,z), unit-length. Matches three.js's
// `SphericalHarmonics3.getBasisAt` exactly so the irradiance terms we write
// into LightProbe.sh.coefficients are interpreted correctly by the shader.
//
// Index ordering (per three.js convention):
//   0:  Y(0, 0) = 1/(2√π)
//   1:  Y(1,-1) = √(3/(4π)) · y
//   2:  Y(1, 0) = √(3/(4π)) · z
//   3:  Y(1, 1) = √(3/(4π)) · x
//   4:  Y(2,-2) = √(15/π)/2 · xy
//   5:  Y(2,-1) = √(15/π)/2 · yz
//   6:  Y(2, 0) = √(5/(16π)) · (3z² − 1)
//   7:  Y(2, 1) = √(15/π)/2 · xz
//   8:  Y(2, 2) = √(15/π)/4 · (x² − y²)
const Y0 = 0.282094791773878;
const Y1 = 0.488602511902919;
const Y2_AB = 1.092548430592079;
const Y2_0 = 0.315391565252520;
const Y2_2 = 0.546274215296040;

// Cosine-lobe (clamped-cosine) convolution weights for irradiance SH.
const A0 = Math.PI;
const A1 = (2 * Math.PI) / 3;
const A2 = Math.PI / 4;

const A0_Y0 = A0 * Y0;
const A1_Y1 = A1 * Y1;
const A2_AB = A2 * Y2_AB;
const A2_Y2_0 = A2 * Y2_0;
const A2_Y2_2 = A2 * Y2_2;

/**
 * Accumulate the SH3 irradiance contribution of a single directional emitter
 * (radiance per channel, direction `d` already unit length) into a flat 27-float
 * RGB coefficient buffer. Channel layout per SH index: [R, G, B] interleaved
 * (i.e. coeff[ idx*3 + 0..2 ]).
 *
 * Pure function — exported for the unit test.
 */
export function accumulateSH3FromDirectional(
  coeffs: Float32Array,
  dx: number, dy: number, dz: number,
  r: number, g: number, b: number,
): void {
  // l=0 (constant ambient term)
  const c0 = A0_Y0;
  coeffs[0]  += r * c0; coeffs[1]  += g * c0; coeffs[2]  += b * c0;
  // l=1 (linear gradient)
  const c1y = A1_Y1 * dy;
  const c1z = A1_Y1 * dz;
  const c1x = A1_Y1 * dx;
  coeffs[3]  += r * c1y; coeffs[4]  += g * c1y; coeffs[5]  += b * c1y;
  coeffs[6]  += r * c1z; coeffs[7]  += g * c1z; coeffs[8]  += b * c1z;
  coeffs[9]  += r * c1x; coeffs[10] += g * c1x; coeffs[11] += b * c1x;
  // l=2 (quadratic)
  const c2xy = A2_AB * dx * dy;
  const c2yz = A2_AB * dy * dz;
  const c2_0 = A2_Y2_0 * (3 * dz * dz - 1);
  const c2xz = A2_AB * dx * dz;
  const c2_2 = A2_Y2_2 * (dx * dx - dy * dy);
  coeffs[12] += r * c2xy; coeffs[13] += g * c2xy; coeffs[14] += b * c2xy;
  coeffs[15] += r * c2yz; coeffs[16] += g * c2yz; coeffs[17] += b * c2yz;
  coeffs[18] += r * c2_0; coeffs[19] += g * c2_0; coeffs[20] += b * c2_0;
  coeffs[21] += r * c2xz; coeffs[22] += g * c2xz; coeffs[23] += b * c2xz;
  coeffs[24] += r * c2_2; coeffs[25] += g * c2_2; coeffs[26] += b * c2_2;
}

export class LightProbeManager {
  readonly probe: THREE.LightProbe;
  private readonly coeffs = new Float32Array(27);
  private readonly worldPos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // `intensity: 1` — the per-channel SH magnitude already encodes the
    // emitter's brightness; the LightProbe.intensity multiplier stays at 1.
    this.probe = new THREE.LightProbe(undefined, 1);
    scene.add(this.probe);
  }

  /**
   * Recompute the 9 SH3 coefficients from the live seal-backlight state and
   * write them into the probe. Called from the render-loop tick.
   *
   * Cost: O(N) where N is the count of lit emitters (≤12). Per-fragment cost
   * in the shader is O(1) — a 9-term dot product, independent of N.
   *
   * @param refs        the 12 SealBacklightRef objects (any unlit ones skipped)
   * @param color       shared LED color (per-channel linear-RGB)
   * @param intensityScale magnitude multiplier on driver.v (matches the old
   *                    `cfg.intensity` so the visual scale stays comparable)
   */
  update(
    refs: Iterable<SealBacklightRef>,
    color: THREE.Color,
    intensityScale: number,
  ): void {
    this.coeffs.fill(0);
    const r = color.r, g = color.g, b = color.b;

    for (const ref of refs) {
      const v = ref.driver.v;
      if (v <= 0.001) continue;
      // World position of the seal LED; the probe sits at scene origin, so
      // the direction-from-probe-to-emitter is the world position normalized.
      ref.proxyMesh.getWorldPosition(this.worldPos);
      const px = this.worldPos.x, py = this.worldPos.y, pz = this.worldPos.z;
      const lenSq = px * px + py * py + pz * pz;
      if (lenSq < 1e-12) continue;
      const inv = 1 / Math.sqrt(lenSq);
      const dx = px * inv, dy = py * inv, dz = pz * inv;
      const k = v * intensityScale;
      accumulateSH3FromDirectional(this.coeffs, dx, dy, dz, r * k, g * k, b * k);
    }

    // Write into the three.js SphericalHarmonics3 (9× Vector3, RGB-per-term).
    const sh = this.probe.sh.coefficients;
    for (let i = 0; i < 9; i++) {
      const o = i * 3;
      sh[i].set(this.coeffs[o], this.coeffs[o + 1], this.coeffs[o + 2]);
    }
  }

  dispose(): void {
    this.probe.removeFromParent();
  }
}
