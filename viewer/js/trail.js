// trail.js - fixed-size history of one joint's path (ring buffer, no allocation per point).
// Used for the 2D trail (image coordinates 0-1) and the 3D trail (world metres).
//
// Each record: [t, break, a, b, c]. `break` = 1 marks the first point after a gap (e.g. the
// joint was not detected for a while), so the renderer does not draw a jump across it.

export const TRAIL_CAPACITY = 2000; // points per joint; caps "Tanpa batas" mode
const REC = 5;
const GAP_SECONDS = 0.35;

export class Trail {
  constructor(capacity = TRAIL_CAPACITY) {
    this.capacity = capacity;
    this.data = new Float64Array(capacity * REC);
    this.start = 0; // index of the oldest record
    this.count = 0;
    this.version = 0; // bumps on every change, lets renderers skip unchanged trails
  }

  clear() {
    this.start = 0;
    this.count = 0;
    this.version++;
  }

  get lastT() {
    return this.count ? this.data[this._slot(this.count - 1) * REC] : -Infinity;
  }

  _slot(k) {
    const s = this.start + k;
    return s >= this.capacity ? s - this.capacity : s;
  }

  push(t, a, b, c = 0) {
    // Time went backwards (loop, seek): the old path no longer belongs to this timeline.
    if (this.count && t < this.lastT) this.clear();
    const brk = this.count && t - this.lastT > GAP_SECONDS ? 1 : 0;
    let slot;
    if (this.count < this.capacity) {
      slot = this._slot(this.count);
      this.count++;
    } else {
      slot = this.start;
      this.start = this._slot(1);
    }
    const o = slot * REC;
    this.data[o] = t;
    this.data[o + 1] = brk;
    this.data[o + 2] = a;
    this.data[o + 3] = b;
    this.data[o + 4] = c;
    this.version++;
  }

  /** Drop points older than `tMin`. */
  trimBefore(tMin) {
    let dropped = 0;
    while (this.count && this.data[this.start * REC] < tMin) {
      this.start = this._slot(1);
      this.count--;
      dropped++;
    }
    if (dropped) this.version++;
  }

  // Accessors for point k (0 = oldest).
  t(k) { return this.data[this._slot(k) * REC]; }
  isBreak(k) { return this.data[this._slot(k) * REC + 1] === 1; }
  a(k) { return this.data[this._slot(k) * REC + 2]; }
  b(k) { return this.data[this._slot(k) * REC + 3]; }
  c(k) { return this.data[this._slot(k) * REC + 4]; }
}

/** Trail length setting -> seconds (Infinity = unlimited, still capped by TRAIL_CAPACITY). */
export function trailWindowSeconds(value) {
  return value === "inf" ? Infinity : parseFloat(value);
}

/** Opacity of a point of age `age` seconds: bounded trails fade out toward the old end. */
export function trailAlpha(age, windowSec) {
  if (!Number.isFinite(windowSec)) return 1;
  const a = 1 - age / windowSec;
  return a <= 0 ? 0 : a;
}
