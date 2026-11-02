// refine.js - the "refinement step" applied only to the avatar (panel 2).
//
//   1. hold the last good pose: frames without a reliable torso are ignored, and joints whose
//      visibility drops (e.g. a hand leaves the frame) keep their last good position;
//   2. a second, stronger One Euro pass on the landmarks (lower min_cutoff than capture);
//   3. after Kalidokit: bone rotations are clamped to joint limits (swing and twist per bone),
//   4. bones slerp toward the target rotation instead of jumping (see avatar-stage.js).
//
// Strength "off" disables all of it, so the raw retargeting can be shown side by side.

import * as THREE from "three";
import { OneEuroVec } from "./one-euro.js";
import { PoseFrame, NUM_LANDMARKS, STRIDE } from "./pose.js";

export const REFINE_PRESETS = [
  { id: "off", label: "Mati", filter: null, slerpRate: Infinity, clamp: false, hold: false },
  { id: "light", label: "Ringan", filter: { minCutoff: 0.5, beta: 1.2 }, slerpRate: 20, clamp: true, hold: true },
  { id: "strong", label: "Kuat", filter: { minCutoff: 0.15, beta: 1.6 }, slerpRate: 9, clamp: true, hold: true },
];

const TORSO = [11, 12, 23, 24];
const TORSO_MIN_VIS = 0.5;
const JOINT_MIN_VIS = 0.35;

export class Refiner {
  constructor() {
    this.preset = REFINE_PRESETS[2];
    this.imageFilter = new OneEuroVec(NUM_LANDMARKS * STRIDE, this.preset.filter);
    this.worldFilter = new OneEuroVec(NUM_LANDMARKS * STRIDE, this.preset.filter);
    this.out = new PoseFrame();
    this.hasGood = false;
    this.lastT = null;
    this.held = 0; // frames held in a row (for the caption)
    this.isXyz = (i) => (i & 3) !== 3;
  }

  setPreset(id) {
    this.preset = REFINE_PRESETS.find((p) => p.id === id) ?? REFINE_PRESETS[2];
    if (this.preset.filter) {
      this.imageFilter.setParams(this.preset.filter);
      this.worldFilter.setParams(this.preset.filter);
    }
    this.reset();
  }

  reset() {
    this.imageFilter.reset();
    this.worldFilter.reset();
    this.hasGood = false;
    this.lastT = null;
    this.held = 0;
  }

  /** 1 - exp(-rate * dt): frame-rate independent slerp factor. 1 = snap to target. */
  slerpAlpha(dt) {
    const r = this.preset.slerpRate;
    return Number.isFinite(r) ? 1 - Math.exp(-r * Math.max(dt, 0)) : 1;
  }

  get clampEnabled() {
    return this.preset.clamp;
  }

  /**
   * Feed one frame (PoseFrame, possibly not detected) at time t (s).
   * Returns the refined PoseFrame to drive the avatar, or null to keep the current pose.
   */
  process(frame, t) {
    const p = this.preset;
    if (!frame.detected) {
      this.held++;
      return null;
    }
    if (!p.hold) {
      this.held = 0;
      return this.out.copyFrom(frame);
    }

    // 1) Reject frames where the torso is not reliable: keep the last good pose.
    for (const i of TORSO) {
      if (frame.world[i * STRIDE + 3] < TORSO_MIN_VIS) {
        this.held++;
        return null;
      }
    }
    // A long gap means the filter state is stale.
    if (this.lastT !== null && t - this.lastT > 1.0) {
      this.imageFilter.reset();
      this.worldFilter.reset();
    }
    this.lastT = t;

    // Per joint hold: a joint that became unreliable keeps its last good value (and its old
    // visibility, so Kalidokit does not snap the arm to its resting pose).
    const out = this.out;
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const o = i * STRIDE;
      const good = frame.world[o + 3] >= JOINT_MIN_VIS || !this.hasGood;
      if (good) {
        for (let k = 0; k < 4; k++) {
          out.image[o + k] = frame.image[o + k];
          out.world[o + k] = frame.world[o + k];
        }
      }
      // else: out keeps the previous refined value for this joint
    }

    // 2) Stronger One Euro pass (in place, visibility columns skipped).
    this.imageFilter.filter(out.image, t, out.image, this.isXyz);
    this.worldFilter.filter(out.world, t, out.world, this.isXyz);
    out.detected = true;
    this.hasGood = true;
    this.held = 0;
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Joint limits, in the normalized VRM bone frames (rest pose = identity, avatar faces +Z).
// `axis` = direction from the bone to its child at rest. Each rotation is split into a twist
// about that axis and a swing of the axis itself; both are limited (degrees). Hinge direction
// (elbow/knee) is already enforced by Kalidokit's own solver; a measured check showed that an
// extra hinge rule here fights Kalidokit's twist convention and bends legit poses, so it is not
// used. These limits remove impossible spins and over-rotations from noisy frames.

const D = THREE.MathUtils.DEG2RAD;
const LIMITS = {
  hips: { axis: [0, 1, 0], swing: 55, twist: 80 },
  spine: { axis: [0, 1, 0], swing: 35, twist: 40 },
  chest: { axis: [0, 1, 0], swing: 25, twist: 30 },
  leftUpperArm: { axis: [1, 0, 0], swing: 170, twist: 100 },
  rightUpperArm: { axis: [-1, 0, 0], swing: 170, twist: 100 },
  leftLowerArm: { axis: [1, 0, 0], swing: 150, twist: 100 },
  rightLowerArm: { axis: [-1, 0, 0], swing: 150, twist: 100 },
  leftUpperLeg: { axis: [0, -1, 0], swing: 120, twist: 60 },
  rightUpperLeg: { axis: [0, -1, 0], swing: 120, twist: 60 },
  leftLowerLeg: { axis: [0, -1, 0], swing: 150, twist: 40 },
  rightLowerLeg: { axis: [0, -1, 0], swing: 150, twist: 40 },
};
for (const l of Object.values(LIMITS)) {
  l.axisV = new THREE.Vector3(...l.axis);
  l.swingRad = l.swing * D;
  l.twistRad = l.twist * D;
}

const _twist = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _axis = new THREE.Vector3();

/** Clamp quaternion `q` (in place) to the limits of `boneName`. Returns q. */
export function clampBoneRotation(boneName, q) {
  const lim = LIMITS[boneName];
  if (!lim) return q;
  const a = lim.axisV;

  // Swing-twist decomposition: q = swing * twist, twist = rotation about the bone axis.
  const proj = q.x * a.x + q.y * a.y + q.z * a.z;
  _twist.set(a.x * proj, a.y * proj, a.z * proj, q.w);
  if (_twist.lengthSq() < 1e-10) _twist.identity();
  else _twist.normalize();
  _swing.copy(q).multiply(_inv.copy(_twist).invert());

  // Clamp twist angle.
  let twistAngle = 2 * Math.atan2(_twist.x * a.x + _twist.y * a.y + _twist.z * a.z, _twist.w);
  if (twistAngle > Math.PI) twistAngle -= 2 * Math.PI;
  if (twistAngle < -Math.PI) twistAngle += 2 * Math.PI;
  if (Math.abs(twistAngle) > lim.twistRad) {
    _twist.setFromAxisAngle(a, Math.sign(twistAngle) * lim.twistRad);
  }

  // Clamp swing magnitude.
  _d.copy(a).applyQuaternion(_swing);
  const swingAngle = a.angleTo(_d);
  if (swingAngle > lim.swingRad) {
    _axis.crossVectors(a, _d);
    if (_axis.lengthSq() < 1e-10) _axis.set(0, 0, 1);
    _axis.normalize();
    _d.copy(a).applyAxisAngle(_axis, lim.swingRad);
    _swing.setFromUnitVectors(a, _d);
  }

  return q.copy(_swing).multiply(_twist);
}

export const CLAMPED_BONES = Object.keys(LIMITS);
