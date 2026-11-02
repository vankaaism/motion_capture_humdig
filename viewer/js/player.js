// player.js - playback of a recorded JSON session (frames with t, image, world).

import { PoseFrame } from "./pose.js";

export class Player {
  constructor() {
    this.data = null;
    this.label = "";
    this.playing = false;
    this.time = 0;
    this.index = 0;
    this.speed = 1;
    this.loop = true;
    this.frame = new PoseFrame(); // last frame with a detection at or before `index`
    this.mirrored = false;
  }

  get loaded() {
    return this.data !== null;
  }

  get frames() {
    return this.data?.frames ?? [];
  }

  get duration() {
    const f = this.frames;
    return f.length ? f[f.length - 1].t : 0;
  }

  get meta() {
    return this.data?.meta ?? {};
  }

  /** Validate and load. Throws an Error with an Indonesian message. */
  load(data, label) {
    if (!data || !Array.isArray(data.frames) || !data.frames.length) throw new Error("berkas tidak berisi frame");
    const bad = data.frames.find((f) => f.image && (!Array.isArray(f.image) || f.image.length < 33));
    if (bad) throw new Error("format frame tidak dikenali (harus 33 titik per frame)");
    this.data = data;
    this.label = label;
    // Recordings made in the browser with "Cermin" on say so in meta.source.
    this.mirrored = /cermin/i.test(String(data.meta?.source ?? ""));
    this.seek(0);
  }

  /** Jump to frame index i. */
  seek(i) {
    const f = this.frames;
    this.index = Math.max(0, Math.min(f.length - 1, i));
    this.time = f[this.index]?.t ?? 0;
    this._loadFrame(this.index);
  }

  /** The newest frame at or before i that has a detection (null frames hold the last pose). */
  _loadFrame(i) {
    const f = this.frames;
    this.frame.detected = false;
    for (let k = i; k >= 0; k--) {
      if (f[k].image && f[k].world) {
        this.frame.setFromNested(f[k].image, f[k].world);
        break;
      }
    }
  }

  /** Raw frame k as a PoseFrame written into `out` (detected=false for null frames). */
  frameAt(k, out) {
    const f = this.frames[k];
    if (f?.image && f?.world) out.setFromNested(f.image, f.world);
    else out.detected = false;
    return out;
  }

  /**
   * Advance by dt seconds. Returns "frame" when a new frame index was reached, "wrapped" when
   * the recording looped back to the start, "ended" when it stopped at the end, or null.
   */
  step(dt) {
    if (!this.data || !this.playing) return null;
    const f = this.frames;
    this.time += dt * this.speed;
    let result = null;
    if (this.time > this.duration) {
      if (this.loop) {
        this.time = 0;
        this.index = 0;
        this._loadFrame(0);
        return "wrapped";
      }
      this.time = this.duration;
      this.playing = false;
      result = "ended";
    }
    let i = this.index;
    while (i < f.length - 1 && f[i + 1].t <= this.time) i++;
    if (i !== this.index) {
      this.index = i;
      this._loadFrame(i);
      return result ?? "frame";
    }
    return result;
  }
}
