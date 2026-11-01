// app.js - TariCap Viewer: wires the sources, the two panels and the recorder together.
//
//   source ──► light smoothing ──► panel 1 (capture: video + skeleton + trail)
//   (camera,       (One Euro,       │
//    video file,    as Python)      ├──► recorder (JSON, same format as capture/recorder.py)
//    JSON,                          │
//    WebSocket)                     └──► refinement ──► panel 2 (VRM avatar + 3D trail)
//
// Only one source drives the panels at a time: starting the camera or a video stops playback
// and the WebSocket, and so on.

import * as THREE from "three";
import { PoseFrame, TRAIL_JOINTS, trailLandmark, STRIDE } from "./js/pose.js";
import { PoseSmoother } from "./js/one-euro.js";
import { PoseDetector } from "./js/detector.js";
import { startCamera, stopStream, listCameras, describeCameraError } from "./js/camera.js";
import { Trail, TRAIL_CAPACITY, trailWindowSeconds } from "./js/trail.js";
import { CaptureView } from "./js/capture-view.js";
import { Refiner, REFINE_PRESETS } from "./js/refine.js";
import { AvatarStage } from "./js/avatar-stage.js";
import { MotionRecorder, CompositeVideoRecorder, downloadText, downloadBlob, timestamp } from "./js/recorder.js";
import { Composite } from "./js/composite.js";
import { Player } from "./js/player.js";
import { LiveSocket } from "./js/live-socket.js";
import { ui, setStatus, buildTrailJointControls, VIEW_MODES, setViewMode, bindKeys, formatClock } from "./js/ui.js";

const DEFAULT_AVATAR = {
  url: "avatars/avatar.vrm",
  name: "AvatarSample_D",
  author: "VRoid Project",
  license: "CC0",
};
const LABELS = ["1 · Tangkapan", "2 · Animasi halus"];
const TRAIL_MIN_VIS = 0.5;

// ---------- Core objects ----------
const detector = new PoseDetector();
const smoother = new PoseSmoother({ minCutoff: 1.0, beta: 0.3 }); // same as capture/main.py
const refiner = new Refiner();
const player = new Player();
const recorder = new MotionRecorder();
const videoRecorder = new CompositeVideoRecorder();
const composite = new Composite(); // WebM
const snapshot = new Composite(); // PNG
const captureView = new CaptureView(ui.captureCanvas);
const stage = new AvatarStage(ui.avatarMount);
const live = new LiveSocket({
  onFrame: onLiveMessage,
  onStatus: (t) => setStatus(t),
  onClose: () => {
    ui.btnLive.textContent = "Sambung live";
    if (app.mode === "live") setMode("idle");
  },
});

const app = {
  mode: "idle", // idle | camera | video | playback | live
  srcW: 1280,
  srcH: 720,
  mirrored: false, // the pose data is mirrored (camera with "Cermin")
  stream: null,
  cameraLabel: "",
  videoName: "",
  lastVideoTime: -1,
  now: 0, // trail clock in seconds (source time)
  avatar: { ...DEFAULT_AVATAR, loaded: false },
  recording: false,
  recordStart: 0,
  pendingSeek: -1,
  stats: { detFrames: 0, renderFrames: 0, since: performance.now(), detFps: 0, renderFps: 0, detected: false },
};

const rawFrame = new PoseFrame(); // detector output
const shownFrame = new PoseFrame(); // lightly smoothed: panel 1 and the recorder
const tmpFrame = new PoseFrame();

// 2D trails, one per selected joint (image coordinates).
const getSelectedJoints = buildTrailJointControls(updateTrailJoints);
let trails2d = []; // { joint, trail, color, landmark }
const captureState = {
  video: null,
  mirrorVideo: false,
  srcW: 1280,
  srcH: 720,
  frame: null,
  trails: trails2d,
  now: 0,
  windowSec: 15,
  emptyMessage: "Klik «Mulai kamera», atau «Muat contoh sintetis»\nuntuk mencoba tanpa kamera.",
};

function updateTrailJoints() {
  const ids = new Set(getSelectedJoints());
  const old = new Map(trails2d.map((t) => [t.joint.id, t]));
  trails2d = TRAIL_JOINTS.filter((j) => ids.has(j.id)).map((j) => {
    const landmark = trailLandmark(j, app.mirrored);
    const prev = old.get(j.id);
    const trail = prev && prev.landmark === landmark ? prev.trail : new Trail();
    return { joint: j, trail, color: j.color, landmark };
  });
  captureState.trails = trails2d;
  stage.setTrailJoints(trails2d.map((t) => ({ landmark: t.landmark, color: t.color })));
}

function clearTrails() {
  for (const t of trails2d) t.trail.clear();
  stage.clearTrails();
}

function windowSec() {
  return trailWindowSeconds(ui.trailLength.value);
}

// ---------- Pipeline ----------
/** One pose sample (already lightly smoothed) at source time t. */
function ingest(frame, t, { record = true } = {}) {
  shownFrame.copyFrom(frame);
  app.stats.detected = frame.detected;
  if (record && recorder.isRecording) recorder.add(t, frame);

  if (frame.detected) {
    const img = frame.image;
    for (const tr of trails2d) {
      const o = tr.landmark * STRIDE;
      if (img[o + 3] >= TRAIL_MIN_VIS) tr.trail.push(t, img[o], img[o + 1]);
    }
  }
  const refined = refiner.process(frame, t);
  if (refined) {
    stage.setPose(refined, app.srcW, app.srcH);
    stage.updateSkeleton(refined);
  }
}

function sourceLabel() {
  switch (app.mode) {
    case "camera":
      return `kamera-browser: ${app.cameraLabel}${app.mirrored ? " (cermin)" : ""}`;
    case "video":
      return app.videoName;
    case "live":
      return `websocket ${ui.wsUrl.value}`;
    default:
      return "viewer";
  }
}

// ---------- Mode switching ----------
function setMode(mode) {
  app.mode = mode;
  ui.btnCamera.textContent = mode === "camera" ? "Hentikan kamera" : "Mulai kamera";
  ui.btnCamera.classList.toggle("active", mode === "camera");
  ui.btnLive.textContent = mode === "live" ? "Putus live" : "Sambung live";
  captureState.video = mode === "camera" || mode === "video" ? ui.video : null;
  captureState.mirrorVideo = mode === "camera" && ui.mirror.checked;
  app.mirrored = mode === "camera" ? ui.mirror.checked : mode === "playback" ? player.mirrored : false;
  resetPipeline();
  updateTrailJoints();
  updatePlayButton();
}

function resetPipeline() {
  smoother.reset();
  refiner.reset();
  shownFrame.detected = false;
  app.lastVideoTime = -1;
  clearTrails();
}

/** Stop whatever source is active (before another one starts). */
async function stopSources() {
  if (app.recording) await stopRecording({ loadIntoPlayer: false });
  stopCamera();
  stopVideoFile();
  live.disconnect();
  player.playing = false;
  updatePlayButton();
}

function stopCamera() {
  if (app.stream) {
    stopStream(app.stream);
    app.stream = null;
    ui.video.srcObject = null;
  }
}

function stopVideoFile() {
  const v = ui.video;
  v.onended = null;
  if (v.src) {
    v.pause();
    URL.revokeObjectURL(v.src);
    v.removeAttribute("src");
    v.load();
  }
}

// ---------- Detector ----------
async function ensureDetector() {
  if (detector.ready) return true;
  try {
    if (detector.loading) await detector.loading.catch(() => {});
    if (!detector.ready) await loadDetector();
    return detector.ready;
  } catch (err) {
    setStatus(err.message, true);
    return false;
  }
}

async function loadDetector() {
  const info = await detector.load(ui.modelVariant.value, (t) => setStatus(t));
  setStatus(`Model pose siap: ${info.variant} (${info.from}, ${info.delegate}).`);
  return info;
}

ui.modelVariant.addEventListener("change", async () => {
  try {
    await loadDetector();
  } catch (err) {
    if (!/dibatalkan/.test(err.message)) setStatus(err.message, true);
  }
});

// ---------- Camera ----------
async function toggleCamera() {
  if (app.mode === "camera") {
    await stopSources();
    setMode("idle");
    setStatus("Kamera dihentikan.");
    return;
  }
  await stopSources();
  ui.btnCamera.disabled = true;
  setStatus("Meminta izin kamera ... (izinkan di jendela browser)");
  try {
    const cam = await startCamera(ui.video, ui.cameraSelect.value);
    app.stream = cam.stream;
    app.cameraLabel = cam.label;
    app.srcW = captureState.srcW = cam.width;
    app.srcH = captureState.srcH = cam.height;
    setMode("camera");
    await refreshCameraList(cam.deviceId);
    setStatus(`Kamera aktif: ${cam.label} (${cam.width}×${cam.height}).`);
    if (await ensureDetector()) setStatus(`Kamera aktif. Berdirilah 2 sampai 3 meter dari kamera, seluruh badan terlihat.`);
  } catch (err) {
    stopCamera();
    setMode("idle");
    setStatus(describeCameraError(err), true);
  } finally {
    ui.btnCamera.disabled = false;
  }
}

async function refreshCameraList(activeId) {
  const cams = await listCameras().catch(() => []);
  ui.cameraSelect.hidden = cams.length <= 1;
  ui.cameraSelect.replaceChildren(
    ...cams.map((c, i) => {
      const o = document.createElement("option");
      o.value = c.deviceId;
      o.textContent = c.label || `Kamera ${i + 1}`;
      o.selected = c.deviceId === activeId;
      return o;
    }),
  );
}

ui.btnCamera.addEventListener("click", toggleCamera);
ui.cameraSelect.addEventListener("change", async () => {
  if (app.mode !== "camera") return;
  await stopSources();
  app.mode = "idle";
  toggleCamera();
});
navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  if (app.stream) refreshCameraList(ui.cameraSelect.value);
});
ui.mirror.addEventListener("change", () => {
  if (app.mode === "camera") setMode("camera"); // mirrored data changes meaning: restart trails and filters
});

// ---------- Video file ----------
async function processVideo(file) {
  await stopSources();
  const v = ui.video;
  v.srcObject = null;
  v.src = URL.createObjectURL(file);
  v.loop = false;
  v.muted = true;
  app.videoName = file.name;
  setStatus(`Membuka video ${file.name} ...`);
  try {
    await new Promise((resolve, reject) => {
      v.addEventListener("loadedmetadata", resolve, { once: true });
      v.addEventListener("error", () => reject(new Error("format video tidak didukung browser")), { once: true });
    });
  } catch (err) {
    stopVideoFile();
    setStatus(`Video gagal dibuka: ${err.message}. Coba MP4 (H.264) atau WebM.`, true);
    return;
  }
  app.srcW = captureState.srcW = v.videoWidth;
  app.srcH = captureState.srcH = v.videoHeight;
  setMode("video");
  if (!(await ensureDetector())) {
    stopVideoFile();
    setMode("idle");
    return;
  }
  // Frame-stepped processing: every frame is analysed even if detection is slower than the
  // video, and t is the frame's own time (like capture/main.py: frame_index / fps).
  v.pause();
  vstep.next = 0;
  vstep.busy = false;
  vstep.wallStart = performance.now();
  startRecording({ webm: ui.recordWebm.checked });
  setStatus(`Memproses ${file.name} (${v.duration.toFixed(1)} s) frame demi frame. Rekaman otomatis; JSON terunduh saat video selesai.`);
}

const VIDEO_STEP = 1 / 30; // seconds between analysed frames
const vstep = { next: 0, busy: false, wallStart: 0 };

/** Seek to the next frame time (not faster than real time), detect when the frame is ready. */
function stepVideoFile() {
  const v = ui.video;
  if (vstep.busy || !detector.ready) return;
  const duration = v.duration || 0;
  if (vstep.next > duration) {
    vstep.busy = true; // stays set: the run is over
    finishVideo();
    return;
  }
  if (vstep.next > (performance.now() - vstep.wallStart) / 1000) return; // pace to real time
  vstep.busy = true;
  const target = Math.min(vstep.next, Math.max(0, duration - 0.001));
  const done = () => {
    clearTimeout(timer);
    v.removeEventListener("seeked", done);
    if (app.mode !== "video") return;
    detector.detect(v, rawFrame, false);
    smoother.apply(rawFrame, rawFrame, target);
    app.stats.detFrames++;
    ingest(rawFrame, target);
    vstep.next += VIDEO_STEP;
    vstep.busy = false;
  };
  const timer = setTimeout(done, 1000); // a seek that never reports back must not stall the run
  v.addEventListener("seeked", done);
  v.currentTime = target;
}

async function finishVideo() {
  if (app.mode !== "video") return;
  setStatus("Video selesai. Menyimpan rekaman ...");
  await stopRecording({ loadIntoPlayer: true });
}

ui.fileVideo.addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) processVideo(file);
});

/** Detection on the newest camera frame. */
function detectCameraFrame() {
  const v = ui.video;
  if (!detector.ready || v.readyState < 2 || v.currentTime === app.lastVideoTime) return;
  app.lastVideoTime = v.currentTime;
  const t = performance.now() / 1000;
  detector.detect(v, rawFrame, ui.mirror.checked);
  smoother.apply(rawFrame, rawFrame, t);
  app.stats.detFrames++;
  ingest(rawFrame, t);
}

// ---------- Playback ----------
function loadRecording(data, label) {
  player.load(data, label);
  const m = player.meta;
  app.srcW = captureState.srcW = m.width || 1280;
  app.srcH = captureState.srcH = m.height || 720;
  ui.seek.max = player.frames.length - 1;
  ui.seek.disabled = false;
  setMode("playback");
  player.playing = true;
  updatePlayButton();
  ingest(player.frame, 0, { record: false });
  updateTimeLabel();
  setStatus(`Rekaman: ${label}\n${player.frames.length} frame, ${m.fps ?? "?"} fps, sumber: ${m.source ?? "?"}`);
}

async function startPlayback() {
  if (!player.loaded) return;
  if (app.mode !== "playback") {
    await stopSources();
    setMode("playback");
  }
  if (player.time >= player.duration) player.seek(0);
  player.playing = true;
  updatePlayButton();
}

function updatePlayButton() {
  ui.btnPlay.disabled = !player.loaded;
  ui.btnPlay.textContent = player.playing && app.mode === "playback" ? "Jeda" : "Putar";
}

function updateTimeLabel() {
  ui.seek.value = player.index;
  ui.timeLabel.textContent = `${player.time.toFixed(2)} / ${player.duration.toFixed(2)} s`;
}

function togglePlay() {
  if (!player.loaded) return;
  if (player.playing && app.mode === "playback") {
    player.playing = false;
    updatePlayButton();
  } else {
    startPlayback();
  }
}

/** Advance playback; feeds every frame passed (so trails stay complete at 2x speed). */
function stepPlayback(dt) {
  const before = player.index;
  const res = player.step(dt);
  if (!res) return;
  if (res === "wrapped") {
    refiner.reset();
    clearTrails();
    ingest(player.frame, player.time, { record: false });
  } else {
    const end = player.index;
    for (let k = Math.max(before + 1, end - 12); k <= end; k++) {
      ingestPlayerFrame(k);
    }
  }
  if (res === "ended") updatePlayButton();
  updateTimeLabel();
}

function ingestPlayerFrame(k) {
  player.frameAt(k, tmpFrame);
  // Keep showing the last detected pose in panel 1 when a frame has no detection.
  if (!tmpFrame.detected) {
    refiner.process(tmpFrame, player.frames[k].t);
    return;
  }
  ingest(tmpFrame, player.frames[k].t, { record: false });
}

/**
 * Seeking: rebuild trails and the refined avatar pose by replaying the frames up to the new
 * position. Points older than the trail window (or beyond the 2000-point cap) would be dropped
 * anyway, so the replay starts there instead of at frame 0; the result is identical.
 */
function rebuildTo(index) {
  const frames = player.frames;
  player.seek(index);
  const tEnd = frames[index].t;
  const win = windowSec();
  let start = index;
  while (start > 0 && index - start < TRAIL_CAPACITY - 1 && frames[start - 1].t >= tEnd - win) start--;

  clearTrails();
  refiner.reset();
  let prevT = null;
  for (let k = start; k <= index; k++) {
    const t = frames[k].t;
    player.frameAt(k, tmpFrame);
    if (tmpFrame.detected) {
      const img = tmpFrame.image;
      for (const tr of trails2d) {
        const o = tr.landmark * STRIDE;
        if (img[o + 3] >= TRAIL_MIN_VIS) tr.trail.push(t, img[o], img[o + 1]);
      }
    }
    const refined = refiner.process(tmpFrame, t);
    if (refined) stage.setPose(refined, app.srcW, app.srcH);
    stage.stepBones(prevT === null ? 1 : refiner.slerpAlpha(t - prevT));
    stage.sampleTrails(t, true);
    prevT = t;
  }
  shownFrame.copyFrom(player.frame);
  const refinedNow = refiner.out.detected ? refiner.out : player.frame;
  stage.updateSkeleton(refinedNow);
  stage.vrm?.springBoneManager?.reset();
  app.now = tEnd;
  updateTimeLabel();
}

ui.btnPlay.addEventListener("click", togglePlay);
ui.speed.addEventListener("change", () => (player.speed = parseFloat(ui.speed.value)));
ui.loop.addEventListener("change", () => (player.loop = ui.loop.checked));
ui.seek.addEventListener("input", async () => {
  if (!player.loaded) return;
  if (app.mode !== "playback") {
    await stopSources();
    setMode("playback");
  }
  app.pendingSeek = parseInt(ui.seek.value, 10); // handled once per animation frame
});

ui.btnSample.addEventListener("click", async () => {
  try {
    const res = await fetch("../data/recordings/contoh_gerak_sintetis.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await stopSources();
    loadRecording(data, "contoh sintetis");
  } catch (err) {
    setStatus(`Contoh tidak bisa dimuat (${err.message}). Jalankan server dari folder utama proyek (lihat README).`, true);
  }
});

ui.fileJson.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    await stopSources();
    loadRecording(data, file.name);
  } catch (err) {
    setStatus(`File JSON tidak valid: ${err.message}`, true);
  }
});

// ---------- Live WebSocket ----------
function onLiveMessage(msg) {
  if (app.mode !== "live" || !msg.image || !msg.world) return;
  app.srcW = captureState.srcW = msg.width || app.srcW;
  app.srcH = captureState.srcH = msg.height || app.srcH;
  tmpFrame.setFromNested(msg.image, msg.world);
  app.stats.detFrames++;
  ingest(tmpFrame, performance.now() / 1000);
}

ui.btnLive.addEventListener("click", async () => {
  if (app.mode === "live") {
    await stopSources();
    setMode("idle");
    setStatus("Live diputus.");
    return;
  }
  await stopSources();
  setMode("live");
  live.connect(ui.wsUrl.value);
});

// ---------- Recording ----------
function startRecording({ webm = ui.recordWebm.checked } = {}) {
  const jsonSource = app.mode === "camera" || app.mode === "video" || app.mode === "live";
  if (!jsonSource && app.mode !== "playback") {
    setStatus("Mulai kamera, proses video, atau sambung live dulu, lalu tekan Rekam.", true);
    return;
  }
  if (jsonSource) recorder.start({ source: sourceLabel(), width: app.srcW, height: app.srcH });
  if (webm && CompositeVideoRecorder.supported()) {
    composite.setSize(960, 540);
    renderComposite(composite);
    try {
      videoRecorder.start(composite.canvas, 30);
    } catch (err) {
      setStatus(`Perekaman video .webm tidak didukung: ${err.message}`, true);
    }
  }
  if (!recorder.isRecording && !videoRecorder.isRecording) return;
  app.recording = true;
  app.recordStart = performance.now();
  ui.recBadge.hidden = false;
  ui.btnRecord.classList.add("active");
  ui.btnRecordLabel.textContent = "Berhenti";
  if (app.mode === "playback") setStatus("Merekam video .webm dari pemutaran (JSON tidak direkam ulang).");
  else setStatus("Merekam ... tekan R untuk berhenti.");
}

async function stopRecording({ loadIntoPlayer = true } = {}) {
  if (!app.recording) return;
  app.recording = false;
  ui.recBadge.hidden = true;
  ui.btnRecord.classList.remove("active");
  ui.btnRecordLabel.textContent = "Rekam";

  const result = recorder.isRecording ? recorder.stop() : null;
  const blob = await videoRecorder.stop();
  const saved = [];
  if (result) {
    downloadText(result.text, result.filename);
    saved.push(`${result.filename} (${result.data.meta.frame_count} frame, pose ${result.data.meta.detected_frames})`);
  }
  if (blob) {
    const name = `taricap_${timestamp()}.webm`;
    downloadBlob(blob, name);
    saved.push(name);
  }
  setStatus(saved.length ? `Tersimpan ke folder Unduhan:\n${saved.join("\n")}` : "Tidak ada frame yang terekam.");
  if (result && loadIntoPlayer) {
    stopCamera();
    stopVideoFile();
    live.disconnect();
    loadRecording(result.data, result.filename);
    setStatus(`Tersimpan dan diputar ulang:\n${saved.join("\n")}`);
  }
}

function toggleRecord() {
  if (app.recording) stopRecording();
  else startRecording();
}
ui.btnRecord.addEventListener("click", toggleRecord);

// ---------- Composite (PNG / WebM) ----------
function captions() {
  return [ui.captionCapture.textContent, ui.captionAvatar.textContent];
}

function renderComposite(target) {
  target.render(captureState, stage, LABELS, captions());
}

function saveImage() {
  snapshot.setSize(1280, 720);
  renderComposite(snapshot);
  snapshot.canvas.toBlob((blob) => {
    if (!blob) return setStatus("Gambar gagal dibuat.", true);
    const name = `taricap_${timestamp()}.png`;
    downloadBlob(blob, name);
    setStatus(`Gambar tersimpan: ${name}`);
  }, "image/png");
}
ui.btnSaveImage.addEventListener("click", saveImage);

// ---------- Trails, avatar and view controls ----------
ui.btnClearTrail.addEventListener("click", clearTrails);
ui.trailLength.addEventListener("change", () => {
  if (app.mode === "playback") app.pendingSeek = player.index; // rebuild with the new window
});

function applyRefinePreset() {
  const preset = REFINE_PRESETS[parseInt(ui.refine.value, 10)];
  refiner.setPreset(preset.id);
  stage.clampEnabled = refiner.clampEnabled;
  ui.refineLabel.textContent = preset.label;
}
ui.refine.addEventListener("input", applyRefinePreset);

ui.showSkeleton.addEventListener("change", () => {
  stage.setSkeletonVisible(ui.showSkeleton.checked);
  stage.updateSkeleton(refiner.out.detected ? refiner.out : shownFrame);
});
ui.flipAxes.addEventListener("change", () => (stage.flipAxes = ui.flipAxes.checked));

async function loadAvatar(url, info) {
  try {
    const meta = await stage.loadVrm(url);
    app.avatar = { ...meta, ...info, loaded: true };
    setStatus(`Avatar dimuat: ${app.avatar.name}${app.avatar.author ? " oleh " + app.avatar.author : ""} (lisensi ${app.avatar.license}).`);
    updateTrailJoints();
  } catch (err) {
    app.avatar.loaded = false;
    if (url === DEFAULT_AVATAR.url) {
      setStatus("avatars/avatar.vrm tidak ditemukan. Panel 2 kosong; muat avatar lewat «Muat avatar .vrm» (lihat avatars/README.md).", true);
    } else {
      setStatus(`Gagal memuat avatar: ${err.message}`, true);
    }
  }
}

ui.fileVrm.addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) loadAvatar(URL.createObjectURL(file), {});
});

ui.viewMode.addEventListener("change", () => setViewMode(ui.viewMode.value));
function cycleView() {
  const i = VIEW_MODES.indexOf(ui.stage.dataset.view);
  setViewMode(VIEW_MODES[(i + 1) % VIEW_MODES.length]);
}

bindKeys({
  r: toggleRecord,
  c: clearTrails,
  v: cycleView,
  s: saveImage,
  space: togglePlay,
});

// ---------- Layout ----------
const ro = new ResizeObserver(() => {
  captureView.resize();
  stage.resize();
});
ro.observe(ui.panelCapture);
ro.observe(ui.panelAvatar);

// ---------- Captions (twice per second) ----------
function updateCaptions() {
  const s = app.stats;
  const det = detector.info;
  const model = det ? `model ${det.variant} (${det.delegate})` : "model belum dimuat";
  let left;
  switch (app.mode) {
    case "camera":
      left = `33 titik · ${s.detFps.toFixed(1)} FPS · ${model} · ${app.srcW}×${app.srcH}${app.mirrored ? " · cermin" : ""}`;
      break;
    case "video": {
      const v = ui.video;
      left = `33 titik · ${s.detFps.toFixed(1)} FPS · ${model} · video ${v.currentTime.toFixed(1)} / ${(v.duration || 0).toFixed(1)} s`;
      break;
    }
    case "playback":
      left = `33 titik · rekaman ${player.meta.fps ?? "?"} fps · frame ${player.index + 1} / ${player.frames.length} · ${app.srcW}×${app.srcH}`;
      break;
    case "live":
      left = `33 titik · live WebSocket · ${s.detFps.toFixed(1)} pose/s`;
      break;
    default:
      left = "Belum ada sumber gerak";
  }
  if ((app.mode === "camera" || app.mode === "video") && !s.detected && detector.ready) left += " · pose tidak terdeteksi";
  ui.captionCapture.textContent = left;

  const a = app.avatar;
  const preset = refiner.preset;
  let right = a.loaded
    ? `${a.name}${a.author ? " (" + a.author + ")" : ""} · lisensi ${a.license} · penghalusan ${preset.label.toLowerCase()} · ${s.renderFps.toFixed(0)} FPS`
    : "Belum ada avatar";
  if (a.loaded && refiner.held > 3 && app.mode !== "idle") right += " · menahan pose terakhir";
  ui.captionAvatar.textContent = right;

  if (app.recording) ui.recTime.textContent = formatClock((performance.now() - app.recordStart) / 1000);
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let captionTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);

  switch (app.mode) {
    case "camera":
      detectCameraFrame();
      app.now = performance.now() / 1000;
      break;
    case "video":
      stepVideoFile();
      app.now = ui.video.currentTime;
      break;
    case "playback":
      if (app.pendingSeek >= 0) {
        rebuildTo(app.pendingSeek);
        app.pendingSeek = -1;
      } else {
        stepPlayback(dt);
      }
      app.now = player.time;
      break;
    case "live":
      app.now = performance.now() / 1000;
      break;
  }

  const win = windowSec();
  for (const tr of trails2d) if (Number.isFinite(win)) tr.trail.trimBefore(app.now - win);
  captureState.frame = shownFrame.detected ? shownFrame : null;
  captureState.now = app.now;
  captureState.windowSec = win;

  stage.update(dt, app.now, win, refiner.slerpAlpha(dt));
  const view = ui.stage.dataset.view;
  if (view !== "capture") stage.render();
  if (view !== "avatar") captureView.render(captureState);
  if (videoRecorder.isRecording) composite.render(captureState, stage, LABELS, captions());

  // Stats
  const st = app.stats;
  st.renderFrames++;
  const now = performance.now();
  if (now - st.since >= 500) {
    const k = 1000 / (now - st.since);
    st.detFps = st.detFrames * k;
    st.renderFps = st.renderFrames * k;
    st.detFrames = 0;
    st.renderFrames = 0;
    st.since = now;
  }
  captionTimer -= dt;
  if (captionTimer <= 0) {
    captionTimer = 0.5;
    updateCaptions();
  }
}

// ---------- Start ----------
applyRefinePreset();
updateTrailJoints();
setMode("idle");
captureView.resize();
frame();

await loadAvatar(DEFAULT_AVATAR.url, { name: DEFAULT_AVATAR.name, author: DEFAULT_AVATAR.author, license: DEFAULT_AVATAR.license });
// Preload the pose model in the background so «Mulai kamera» starts immediately.
loadDetector().catch((err) => {
  if (!/dibatalkan/.test(err.message)) setStatus(err.message, true);
});

// Handle for debugging from the browser console (also used by automated browser checks).
window.__taricap = { app, stage, player, refiner, detector, shownFrame };
