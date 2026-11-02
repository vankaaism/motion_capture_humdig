// capture-view.js - panel 1: "what the computer sees".
// Draws the video (or a dark data grid during JSON playback), the detected skeleton, joints and
// motion trails on a 2D canvas. The same draw() is reused for the PNG / WebM composite.

import { POSE_CONNECTIONS, FACE_POINTS, NUM_LANDMARKS, STRIDE } from "./pose.js";
import { trailAlpha } from "./trail.js";

export const COLORS = {
  bg: "#0b0d12",
  bone: "#22d3ee",
  joint: "#f43f5e",
  grid: "rgba(148, 163, 184, 0.07)",
  frame: "rgba(148, 163, 184, 0.22)",
  text: "rgba(226, 232, 240, 0.86)",
  muted: "rgba(148, 163, 184, 0.75)",
};
const MIN_VIS = 0.5;
const FADE_BANDS = 12;

const rect = { x: 0, y: 0, w: 0, h: 0 }; // reused, no per-frame allocation

function fitContain(srcW, srcH, w, h, out) {
  const s = Math.min(w / srcW, h / srcH);
  out.w = srcW * s;
  out.h = srcH * s;
  out.x = (w - out.w) / 2;
  out.y = (h - out.h) / 2;
  return out;
}

export class CaptureView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.dpr = 1;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * this.dpr));
    const h = Math.max(1, Math.round(r.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(state) {
    const { width, height } = this.canvas;
    if (width < 2 || height < 2) return;
    draw(this.ctx, width, height, state, this.dpr);
  }
}

/**
 * state = {
 *   video, mirrorVideo, srcW, srcH,      video element (or null) and its pixel size
 *   frame,                               PoseFrame to draw (or null)
 *   trails: [{ trail, color, landmark }], now, windowSec,
 *   emptyMessage,                        text shown when there is nothing to draw
 * }
 * `s` scales line widths and text (device pixel ratio on screen).
 */
export function draw(ctx, W, H, state, s = 1) {
  ctx.save();
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const srcW = state.srcW || 1280;
  const srcH = state.srcH || 720;
  fitContain(srcW, srcH, W, H, rect);

  const hasVideo = state.video && state.video.readyState >= 2;
  if (hasVideo) {
    ctx.save();
    if (state.mirrorVideo) {
      ctx.translate(rect.x + rect.w, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(state.video, 0, 0, rect.w, rect.h);
    } else {
      ctx.drawImage(state.video, rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
    // Darken the video slightly so cyan, magenta and yellow stand out.
    ctx.fillStyle = "rgba(4, 6, 10, 0.30)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else if (state.frame || state.trails?.some((t) => t.trail.count)) {
    drawGrid(ctx, s);
  }

  if (state.trails) {
    for (const t of state.trails) drawTrail(ctx, t.trail, t.color, state.now, state.windowSec, s);
  }

  if (state.frame?.detected) {
    drawSkeleton(ctx, state.frame.image, s);
    if (state.trails) drawJointLabels(ctx, state.frame.image, state.trails, s);
  } else if (!hasVideo && !state.frame && state.emptyMessage) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `${15 * s}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = state.emptyMessage.split("\n");
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 22 * s));
  }
  ctx.restore();
}

function drawGrid(ctx, s) {
  ctx.lineWidth = 1 * s;
  ctx.strokeStyle = COLORS.grid;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const x = rect.x + (rect.w * i) / 10;
    const y = rect.y + (rect.h * i) / 10;
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.h);
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
  }
  ctx.stroke();
  ctx.strokeStyle = COLORS.frame;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `${11 * s}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("tanpa video · hanya data landmark", rect.x + rect.w - 10 * s, rect.y + 8 * s);
}

const px = (img, i) => rect.x + img[i * STRIDE] * rect.w;
const py = (img, i) => rect.y + img[i * STRIDE + 1] * rect.h;
const visible = (img, i) => img[i * STRIDE + 3] >= MIN_VIS;

function drawSkeleton(ctx, img, s) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = COLORS.bone;
  ctx.beginPath();
  for (let k = 0; k < POSE_CONNECTIONS.length; k++) {
    const [a, b] = POSE_CONNECTIONS[k];
    if (!visible(img, a) || !visible(img, b)) continue;
    ctx.moveTo(px(img, a), py(img, a));
    ctx.lineTo(px(img, b), py(img, b));
  }
  ctx.stroke();

  ctx.fillStyle = COLORS.joint;
  ctx.beginPath();
  for (let i = 0; i < NUM_LANDMARKS; i++) {
    if (!visible(img, i)) continue;
    const r = (FACE_POINTS.has(i) ? 3.5 : 6) * s;
    const x = px(img, i);
    const y = py(img, i);
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

// Small coordinate readout next to tracked joints: reinforces "the dance is now numbers".
function drawJointLabels(ctx, img, trails, s) {
  ctx.font = `${11 * s}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const t of trails) {
    const i = t.landmark;
    if (!visible(img, i)) continue;
    const label = `x ${img[i * STRIDE].toFixed(2)}  y ${img[i * STRIDE + 1].toFixed(2)}`;
    const tw = ctx.measureText(label).width;
    // Labels on the left half go to the left of the joint, so left/right pairs never overlap.
    const onLeft = img[i * STRIDE] < 0.5;
    const x = onLeft ? px(img, i) - 12 * s - tw : px(img, i) + 12 * s;
    const y = py(img, i) - 12 * s;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 4 * s, y - 8 * s, tw + 8 * s, 16 * s);
    ctx.fillStyle = t.color;
    ctx.fillText(label, x, y);
  }
}

/**
 * Smooth polyline through the trail points: quadratic curves with the points as control
 * points and the midpoints between them as anchors. Bounded trails are split into a few alpha
 * bands (one stroke per band instead of one per segment) so they fade toward the old end.
 */
function drawTrail(ctx, trail, color, now, windowSec, s) {
  const n = trail.count;
  if (n < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;

  let runStart = 0;
  for (let k = 1; k <= n; k++) {
    if (k === n || trail.isBreak(k)) {
      if (k - runStart >= 2) strokeRun(ctx, trail, runStart, k, now, windowSec, s);
      runStart = k;
    }
  }
  ctx.globalAlpha = 1;
}

function strokeRun(ctx, trail, r0, r1, now, windowSec, s) {
  const X = (k) => rect.x + trail.a(k) * rect.w;
  const Y = (k) => rect.y + trail.b(k) * rect.h;
  let band = -1;
  let penX = X(r0);
  let penY = Y(r0);
  for (let j = r0; j < r1; j++) {
    const alpha = trailAlpha(now - trail.t(j), windowSec);
    const b = Math.max(1, Math.ceil(alpha * FADE_BANDS));
    if (b !== band) {
      if (band !== -1) finishBand(ctx, s);
      band = b;
      ctx.globalAlpha = b / FADE_BANDS;
      ctx.beginPath();
      ctx.moveTo(penX, penY);
    }
    if (j === r1 - 1) {
      penX = X(j);
      penY = Y(j);
      ctx.lineTo(penX, penY);
    } else {
      const mx = (X(j) + X(j + 1)) / 2;
      const my = (Y(j) + Y(j + 1)) / 2;
      if (j === r0) ctx.lineTo(mx, my);
      else ctx.quadraticCurveTo(X(j), Y(j), mx, my);
      penX = mx;
      penY = my;
    }
  }
  finishBand(ctx, s);
}

function finishBand(ctx, s) {
  // Soft glow underneath, then the 4 px core line.
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.22;
  ctx.lineWidth = 11 * s;
  ctx.stroke();
  ctx.globalAlpha = a;
  ctx.lineWidth = 4 * s;
  ctx.stroke();
}
