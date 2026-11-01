// detector.js - MediaPipe Pose Landmarker (Tasks Vision 1.2.0, vendored in vendor/mediapipe/).
//
// Model lookup order for the chosen variant ("full" or "lite"):
//   1. ../models/pose_landmarker_<variant>.task   (local, works offline)
//   2. the official Google Storage URL for that variant
//   3. the other variant, local then remote      (so the demo still runs if one file is missing)
// GPU delegate first, CPU if the GPU delegate cannot be created or fails at runtime.

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_PATH = "./vendor/mediapipe/wasm";
const LOCAL = (v) => `../models/pose_landmarker_${v}.task`;
const REMOTE = (v) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/latest/pose_landmarker_${v}.task`;

let filesetPromise = null;

async function fetchModel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // A missing file behind some dev servers returns an HTML page with status 200.
  if (buf.length < 100000) throw new Error("berkas terlalu kecil, bukan model");
  return buf;
}

export class PoseDetector {
  constructor() {
    this.landmarker = null;
    this.info = null; // { variant, from: "lokal" | "internet", delegate: "GPU" | "CPU" }
    this.lastTimestamp = -1;
    this.loading = null;
    this.modelBuffer = null;
    this.generation = 0;
    this.recovering = false;
  }

  get ready() {
    return this.landmarker !== null;
  }

  /** Load (or reload) the model. Returns this.info; throws an Error with an Indonesian message. */
  load(variant = "full", onStatus = () => {}) {
    const job = this._load(variant, onStatus, ++this.generation);
    this.loading = job;
    job.catch(() => {}).finally(() => {
      if (this.loading === job) this.loading = null;
    });
    return job;
  }

  async _load(variant, onStatus, generation) {
    this.close();
    onStatus("Memuat runtime MediaPipe ...");
    let fileset;
    try {
      filesetPromise ??= FilesetResolver.forVisionTasks(WASM_PATH);
      fileset = await filesetPromise;
    } catch (err) {
      filesetPromise = null;
      throw new Error(`Runtime MediaPipe (WASM) gagal dimuat dari ${WASM_PATH}: ${err.message}`);
    }

    const other = variant === "full" ? "lite" : "full";
    const candidates = [
      { url: LOCAL(variant), variant, from: "lokal" },
      { url: REMOTE(variant), variant, from: "internet" },
      { url: LOCAL(other), variant: other, from: "lokal" },
      { url: REMOTE(other), variant: other, from: "internet" },
    ];
    const failures = [];
    let model = null;
    for (const c of candidates) {
      onStatus(`Memuat model pose ${c.variant} (${c.from}) ...`);
      try {
        model = { ...c, buffer: await fetchModel(c.url) };
        break;
      } catch (err) {
        failures.push(`${c.url}: ${err.message}`);
      }
    }
    if (!model) {
      throw new Error(
        "Model pose gagal dimuat. Jalankan `python tools/download_model.py` atau sambungkan internet.\n" +
          failures.join("\n"),
      );
    }

    if (generation !== this.generation) throw new Error("dibatalkan (model lain sedang dimuat)");
    this.modelBuffer = model.buffer;
    const delegate = await this._create(fileset, model.buffer);
    if (generation !== this.generation) {
      // A newer load() started while this one was creating the landmarker.
      this.close();
      throw new Error("dibatalkan (model lain sedang dimuat)");
    }
    this.info = { variant: model.variant, from: model.from, delegate };
    return this.info;
  }

  async _create(fileset, buffer, forceCpu = false) {
    const options = (delegate) => ({
      baseOptions: { modelAssetBuffer: buffer, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
    if (!forceCpu) {
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, options("GPU"));
        this.lastTimestamp = -1;
        return "GPU";
      } catch (err) {
        console.warn("[TariCap] GPU delegate gagal, beralih ke CPU:", err);
      }
    }
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, options("CPU"));
      this.lastTimestamp = -1;
      return "CPU";
    } catch (err) {
      throw new Error(`Pose Landmarker gagal dibuat: ${err.message}`);
    }
  }

  /**
   * Run detection on the current video frame and write the result into `frame` (PoseFrame).
   * Returns true when a pose was found. Timestamps passed to MediaPipe are strictly increasing.
   */
  detect(video, frame, mirror) {
    if (!this.landmarker) return false;
    let ts = performance.now();
    if (ts <= this.lastTimestamp) ts = this.lastTimestamp + 1;
    this.lastTimestamp = ts;

    let result;
    try {
      result = this.landmarker.detectForVideo(video, ts);
    } catch (err) {
      this._recoverOnCpu(err);
      frame.detected = false;
      return false;
    }
    const image = result.landmarks?.[0];
    const world = result.worldLandmarks?.[0];
    if (!image || !world || image.length < 33 || world.length < 33) {
      frame.detected = false;
      return false;
    }
    frame.setFromLandmarks(image, world, mirror);
    return true;
  }

  _recoverOnCpu(err) {
    if (this.recovering || this.info?.delegate === "CPU") {
      console.error("[TariCap] deteksi gagal:", err);
      return;
    }
    console.warn("[TariCap] deteksi GPU gagal, membuat ulang dengan CPU:", err);
    this.recovering = true;
    const buffer = this.modelBuffer;
    try {
      this.landmarker?.close();
    } catch {}
    this.landmarker = null;
    filesetPromise
      .then((fs) => this._create(fs, buffer, true))
      .then((delegate) => {
        this.info = { ...this.info, delegate };
      })
      .catch((e) => console.error("[TariCap]", e))
      .finally(() => {
        this.recovering = false;
      });
  }

  close() {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {}
    }
    this.landmarker = null;
  }
}
