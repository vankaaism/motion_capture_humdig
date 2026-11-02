// recorder.js - save a motion session as JSON (same format as capture/recorder.py) and the
// composite view as WebM.
//
// JSON layout, identical to the Python recorder:
// { "meta": { source, fps, width, height, recorded_at, landmark_model, coordinate_note,
//             frame_count, detected_frames },
//   "frames": [ { "t": 0.0, "image": [[x, y, z, vis] x 33], "world": [...] },
//               { "t": 0.033, "image": null, "world": null }, ... ] }
// Values are rounded to 4 decimals and t starts at 0. The text is serialised the way Python's
// json.dump writes it (", " / ": " separators, floats like 1.0, non-ASCII escaped).

import { NUM_LANDMARKS, STRIDE } from "./pose.js";

const DECIMALS = 1e4;
const COORDINATE_NOTE = "image: x,y dinormalisasi 0-1; world: meter, titik nol di pinggul, y ke bawah";

const round4 = (v) => Math.round(v * DECIMALS) / DECIMALS;

function roundArray(flat) {
  const rows = new Array(NUM_LANDMARKS);
  for (let i = 0; i < NUM_LANDMARKS; i++) {
    const o = i * STRIDE;
    rows[i] = [round4(flat[o]), round4(flat[o + 1]), round4(flat[o + 2]), round4(flat[o + 3])];
  }
  return rows;
}

/** "YYYYMMDD_HHMMSS" in local time, like datetime.now().strftime("%Y%m%d_%H%M%S"). */
export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Local time "YYYY-MM-DDTHH:MM:SS", like datetime.now().isoformat(timespec="seconds"). */
function isoLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export class MotionRecorder {
  constructor() {
    this.isRecording = false;
    this.meta = null;
    this.frames = [];
    this.startT = null;
  }

  start({ source, width, height }) {
    this.isRecording = true;
    this.frames = [];
    this.startT = null;
    this.meta = {
      source: String(source),
      fps: 0, // filled in on stop from the measured frame rate
      width: Math.round(width) || 0,
      height: Math.round(height) || 0,
      recorded_at: isoLocal(),
      landmark_model: "mediapipe_pose_33",
      coordinate_note: COORDINATE_NOTE,
    };
  }

  /** Add one frame at time t (seconds, any origin). `frame` is a PoseFrame. */
  add(t, frame) {
    if (!this.isRecording) return;
    if (this.startT === null) this.startT = t;
    const detected = frame?.detected;
    this.frames.push({
      t: round4(t - this.startT),
      image: detected ? roundArray(frame.image) : null,
      world: detected ? roundArray(frame.world) : null,
    });
  }

  get duration() {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  /** Stop and return { data, text, filename }, or null when nothing was recorded. */
  stop() {
    this.isRecording = false;
    if (!this.frames.length) return null;
    const n = this.frames.length;
    const dur = this.duration;
    this.meta.fps = Math.round((dur > 0 ? (n - 1) / dur : 30) * 100) / 100;
    this.meta.frame_count = n;
    this.meta.detected_frames = this.frames.filter((f) => f.image !== null).length;
    const data = { meta: this.meta, frames: this.frames };
    return { data, text: toPythonJson(data), filename: `rekaman_${timestamp()}.json` };
  }
}

// ---------- json.dump-compatible serialisation ----------
function pyNumber(v, isFloat) {
  if (!Number.isFinite(v)) return "NaN";
  if (!isFloat) return String(v);
  if (Object.is(v, -0)) return "-0.0";
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

function pyString(s) {
  return JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

const INT_KEYS = new Set(["width", "height", "frame_count", "detected_frames"]);

function pyValue(v, key) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return pyNumber(v, !INT_KEYS.has(key));
  if (typeof v === "string") return pyString(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "[" + v.map((x) => pyValue(x, key)).join(", ") + "]";
  return "{" + Object.keys(v).map((k) => `${pyString(k)}: ${pyValue(v[k], k)}`).join(", ") + "}";
}

export function toPythonJson(data) {
  // Frames are written one by one to keep peak memory low for long sessions.
  const parts = [`{"meta": ${pyValue(data.meta)}, "frames": [`];
  data.frames.forEach((f, i) => parts.push((i ? ", " : "") + pyValue(f)));
  parts.push("]}");
  return parts.join("");
}

// ---------- downloads ----------
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadText(text, filename, type = "application/json") {
  downloadBlob(new Blob([text], { type }), filename);
}

// ---------- composite video (WebM) ----------
export class CompositeVideoRecorder {
  constructor() {
    this.recorder = null;
    this.chunks = [];
  }

  static supported() {
    return typeof MediaRecorder !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;
  }

  get isRecording() {
    return this.recorder?.state === "recording";
  }

  start(canvas, fps = 30) {
    const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const stream = canvas.captureStream(fps);
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(1000);
  }

  /** Resolves to a Blob (or null). */
  stop() {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || "video/webm" }) : null);
        this.recorder = null;
      };
      rec.stop();
    });
  }
}
