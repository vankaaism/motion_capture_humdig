// pose.js - landmark constants and the in-memory pose frame used by every module.
//
// A PoseFrame stores 33 MediaPipe landmarks as flat Float64Arrays (x, y, z, visibility per
// landmark) so the per-frame pipeline can run without allocating. The JSON files keep the
// nested [[x, y, z, vis], ...] layout from capture/recorder.py; converters live here.

export const NUM_LANDMARKS = 33;
export const STRIDE = 4;

// Same connection list as capture/drawing.py (face, torso, arms, legs).
export const POSE_CONNECTIONS = [
  [0, 2], [0, 5], [2, 7], [5, 8], [9, 10],
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

export const FACE_POINTS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

// Landmark index of the same body part on the other side (used to mirror a pose).
export const MIRROR_INDEX = (() => {
  const m = [0, 4, 5, 6, 1, 2, 3, 8, 7, 10, 9];
  for (let i = 11; i < NUM_LANDMARKS; i += 2) m.push(i + 1, i);
  return Int8Array.from(m);
})();

// Joints that can leave a motion trail. `landmark` is the MediaPipe index for the dancer's
// own side when the image is NOT mirrored; `bone` is the VRM bone for that landmark label.
export const TRAIL_JOINTS = [
  { id: "rightHand", label: "Tangan kanan", color: "#facc15", landmark: 16, defaultOn: true },
  { id: "leftHand", label: "Tangan kiri", color: "#fb923c", landmark: 15, defaultOn: false },
  { id: "rightFoot", label: "Kaki kanan", color: "#4ade80", landmark: 28, defaultOn: false },
  { id: "leftFoot", label: "Kaki kiri", color: "#a78bfa", landmark: 27, defaultOn: false },
  { id: "head", label: "Kepala", color: "#f1f5f9", landmark: 0, defaultOn: false },
];

// The avatar re-enacts the pose exactly as it is displayed in the capture panel, so a landmark
// label maps to the avatar bone with the same label (MediaPipe "left wrist" -> VRM leftHand).
export const LANDMARK_TO_BONE = { 15: "leftHand", 16: "rightHand", 27: "leftFoot", 28: "rightFoot", 0: "head" };

export class PoseFrame {
  constructor() {
    this.image = new Float64Array(NUM_LANDMARKS * STRIDE);
    this.world = new Float64Array(NUM_LANDMARKS * STRIDE);
    this.detected = false;
  }

  copyFrom(other) {
    this.image.set(other.image);
    this.world.set(other.world);
    this.detected = other.detected;
    return this;
  }

  /** Fill from the nested arrays used in the JSON files / WebSocket messages. */
  setFromNested(image, world) {
    if (!image || !world) {
      this.detected = false;
      return this;
    }
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const a = image[i];
      const b = world[i];
      const o = i * STRIDE;
      this.image[o] = a[0]; this.image[o + 1] = a[1]; this.image[o + 2] = a[2]; this.image[o + 3] = a[3] ?? 1;
      this.world[o] = b[0]; this.world[o + 1] = b[1]; this.world[o + 2] = b[2]; this.world[o + 3] = b[3] ?? 1;
    }
    this.detected = true;
    return this;
  }

  /**
   * Fill from MediaPipe Tasks landmark objects. When `mirror` is set the pose is flipped
   * horizontally and left/right labels are swapped, which is what MediaPipe would return for a
   * horizontally flipped frame (the same thing capture/main.py --mirror does with cv2.flip).
   */
  setFromLandmarks(imageLms, worldLms, mirror) {
    let maxVis = 0;
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const src = mirror ? MIRROR_INDEX[i] : i;
      const a = imageLms[src];
      const b = worldLms[src];
      const o = i * STRIDE;
      const vis = a.visibility ?? 0;
      if (vis > maxVis) maxVis = vis;
      this.image[o] = mirror ? 1 - a.x : a.x; this.image[o + 1] = a.y; this.image[o + 2] = a.z; this.image[o + 3] = vis;
      this.world[o] = mirror ? -b.x : b.x; this.world[o + 1] = b.y; this.world[o + 2] = b.z; this.world[o + 3] = b.visibility ?? vis;
    }
    // Some MediaPipe builds leave visibility at 0. Treat the pose as fully visible then,
    // otherwise every joint would be hidden.
    if (maxVis === 0) {
      for (let i = 0; i < NUM_LANDMARKS; i++) {
        this.image[i * STRIDE + 3] = 1;
        this.world[i * STRIDE + 3] = 1;
      }
    }
    this.detected = true;
    return this;
  }
}

/** Write a horizontally mirrored copy of `src` into `dst` (both PoseFrames). */
export function mirrorFrame(src, dst) {
  for (let i = 0; i < NUM_LANDMARKS; i++) {
    const s = MIRROR_INDEX[i] * STRIDE;
    const o = i * STRIDE;
    dst.image[o] = 1 - src.image[s]; dst.image[o + 1] = src.image[s + 1]; dst.image[o + 2] = src.image[s + 2]; dst.image[o + 3] = src.image[s + 3];
    dst.world[o] = -src.world[s]; dst.world[o + 1] = src.world[s + 1]; dst.world[o + 2] = src.world[s + 2]; dst.world[o + 3] = src.world[s + 3];
  }
  dst.detected = src.detected;
  return dst;
}

/** Landmark index of a trail joint, taking a mirrored source into account. */
export function trailLandmark(joint, mirrored) {
  return mirrored ? MIRROR_INDEX[joint.landmark] : joint.landmark;
}
