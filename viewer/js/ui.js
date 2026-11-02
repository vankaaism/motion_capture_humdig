// ui.js - DOM references, status line, captions and keyboard shortcuts.

import { TRAIL_JOINTS } from "./pose.js";

const $ = (id) => document.getElementById(id);

export const ui = {
  stage: $("stage"),
  panelCapture: $("panelCapture"),
  panelAvatar: $("panelAvatar"),
  captureCanvas: $("captureCanvas"),
  avatarMount: $("avatarMount"),
  video: $("video"),
  captionCapture: $("captionCapture"),
  captionAvatar: $("captionAvatar"),
  recBadge: $("recBadge"),
  recTime: $("recTime"),
  status: $("status"),

  btnCamera: $("btnCamera"),
  cameraSelect: $("cameraSelect"),
  mirror: $("mirror"),
  modelVariant: $("modelVariant"),

  fileVideo: $("fileVideo"),
  btnSample: $("btnSample"),
  fileJson: $("fileJson"),
  btnLive: $("btnLive"),
  wsUrl: $("wsUrl"),

  btnRecord: $("btnRecord"),
  btnRecordLabel: $("btnRecordLabel"),
  recordWebm: $("recordWebm"),

  btnPlay: $("btnPlay"),
  speed: $("speed"),
  loop: $("loop"),
  seek: $("seek"),
  timeLabel: $("timeLabel"),

  trailJoints: $("trailJoints"),
  trailLength: $("trailLength"),
  btnClearTrail: $("btnClearTrail"),
  btnSaveImage: $("btnSaveImage"),

  refine: $("refine"),
  refineLabel: $("refineLabel"),
  showSkeleton: $("showSkeleton"),
  flipAxes: $("flipAxes"),
  fileVrm: $("fileVrm"),

  viewMode: $("viewMode"),
};

export function setStatus(text, isError = false) {
  ui.status.textContent = text;
  ui.status.classList.toggle("error", isError);
  (isError ? console.warn : console.log)("[TariCap]", text);
}

/** Checkbox per trail joint, with its colour. Returns a function giving the selected ids. */
export function buildTrailJointControls(onChange) {
  for (const j of TRAIL_JOINTS) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = j.id;
    input.checked = j.defaultOn;
    input.addEventListener("change", onChange);
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = j.color;
    label.append(input, sw, document.createTextNode(j.label));
    ui.trailJoints.appendChild(label);
  }
  return () => [...ui.trailJoints.querySelectorAll("input:checked")].map((i) => i.value);
}

export const VIEW_MODES = ["split", "capture", "avatar"];

export function setViewMode(mode) {
  ui.stage.dataset.view = mode;
  ui.viewMode.value = mode;
}

/** Global shortcuts; ignored while typing in a text field. */
export function bindKeys(handlers) {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target;
    const typing = t instanceof HTMLInputElement && (t.type === "text" || t.type === "url") || t instanceof HTMLTextAreaElement;
    if (typing) return;
    const key = e.key.toLowerCase();
    const fn = key === " " ? handlers.space : handlers[key];
    if (!fn) return;
    // Space on a focused button would also click it; let the shortcut win.
    e.preventDefault();
    fn();
  });
}

export function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
