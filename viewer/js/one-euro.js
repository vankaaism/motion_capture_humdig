// one-euro.js - One Euro Filter (Casiez, Roussel & Vogel, CHI 2012), ported from
// capture/smoothing.py. Works element-wise on a flat Float64Array so a whole pose (33 x, y, z
// values) is filtered in one call without allocating.

const TWO_PI = 2 * Math.PI;

function alpha(cutoff, dt) {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroVec {
  constructor(size, { minCutoff = 1.0, beta = 0.3, dCutoff = 1.0 } = {}) {
    this.size = size;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = new Float64Array(size);
    this.dxPrev = new Float64Array(size);
    this.tPrev = null;
  }

  setParams({ minCutoff, beta }) {
    if (minCutoff !== undefined) this.minCutoff = minCutoff;
    if (beta !== undefined) this.beta = beta;
  }

  reset() {
    this.tPrev = null;
  }

  /**
   * Filter `x` at time `t` (seconds) into `out` (may be the same array as `x`).
   * `mask(i)` optional: when it returns false, element i is not filtered and `out[i]` is left
   * untouched (used to pass the visibility columns through).
   */
  filter(x, t, out, mask = null) {
    const n = this.size;
    if (this.tPrev === null) {
      for (let i = 0; i < n; i++) {
        this.xPrev[i] = x[i];
        this.dxPrev[i] = 0;
        if (!mask || mask(i)) out[i] = x[i];
      }
      this.tPrev = t;
      return out;
    }
    let dt = t - this.tPrev;
    if (dt <= 0) dt = 1e-3;
    this.tPrev = t;

    const aD = alpha(this.dCutoff, dt);
    for (let i = 0; i < n; i++) {
      if (mask && !mask(i)) continue;
      // 1) Estimate and smooth the speed.
      const dx = (x[i] - this.xPrev[i]) / dt;
      const dxHat = aD * dx + (1 - aD) * this.dxPrev[i];
      // 2) The cutoff rises with speed: smooth when still, responsive when moving.
      const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
      const a = alpha(cutoff, dt);
      // 3) Blend the new value with the previous one.
      const xHat = a * x[i] + (1 - a) * this.xPrev[i];
      this.xPrev[i] = xHat;
      this.dxPrev[i] = dxHat;
      out[i] = xHat;
    }
    return out;
  }
}

/**
 * Filters x, y, z of image and world landmarks (visibility passes through), like
 * PoseSmoother in capture/smoothing.py. Works on PoseFrame objects (see pose.js).
 */
export class PoseSmoother {
  constructor(params) {
    // 33 landmarks x 4 values; visibility columns are skipped by the mask.
    this.imageFilter = new OneEuroVec(33 * 4, params);
    this.worldFilter = new OneEuroVec(33 * 4, params);
    this.lastT = null;
    this.skipVisibility = (i) => (i & 3) !== 3;
  }

  setParams(params) {
    this.imageFilter.setParams(params);
    this.worldFilter.setParams(params);
  }

  reset() {
    this.imageFilter.reset();
    this.worldFilter.reset();
    this.lastT = null;
  }

  /** Smooth `src` into `dst` (PoseFrames; may be the same object). */
  apply(src, dst, t) {
    if (!src.detected) {
      dst.detected = false;
      return dst;
    }
    // After a long gap the old state is meaningless; start over instead of easing in from it.
    if (this.lastT !== null && t - this.lastT > 0.5) this.reset();
    this.lastT = t;
    if (dst !== src) {
      dst.image.set(src.image);
      dst.world.set(src.world);
    }
    // Visibility columns are skipped by the mask, so they keep the incoming values.
    this.imageFilter.filter(src.image, t, dst.image, this.skipVisibility);
    this.worldFilter.filter(src.world, t, dst.world, this.skipVisibility);
    dst.detected = true;
    return dst;
  }
}
