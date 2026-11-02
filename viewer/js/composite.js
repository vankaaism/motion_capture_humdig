// composite.js - both panels side by side on one canvas, for "Simpan gambar" (PNG) and the
// WebM backup recording. Panel 1 is re-drawn vector-sharp with the capture renderer; panel 2 is
// rendered by an offscreen renderer at the slot size and copied in the same task.

import { draw as drawCapture } from "./capture-view.js";
import { STAGE_BG } from "./avatar-stage.js";

export class Composite {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
  }

  setSize(slotW, slotH) {
    if (this.canvas.width !== slotW * 2 || this.canvas.height !== slotH) {
      this.canvas.width = slotW * 2;
      this.canvas.height = slotH;
    }
  }

  /**
   * captureState: state object for capture-view draw(); stage: the AvatarStage (rendered
   * offscreen at the slot size); labels / captions: [left, right] strings.
   */
  render(captureState, stage, labels, captions) {
    const ctx = this.ctx;
    const H = this.canvas.height;
    const W = this.canvas.width / 2;
    const s = H / 540;

    // Panel 1
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    drawCapture(ctx, W, H, captureState, s);
    ctx.restore();

    // Panel 2: the stage rendered at exactly this slot size, copied in the same task.
    ctx.fillStyle = STAGE_BG;
    ctx.fillRect(W, 0, W, H);
    ctx.drawImage(stage.renderOffscreen(W, H), W, 0, W, H);

    // Divider, labels, captions
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(W - 1 * s, 0, 2 * s, H);
    for (let i = 0; i < 2; i++) {
      drawLabel(ctx, i * W + 14 * s, 14 * s, labels[i], s);
      drawCaption(ctx, i * W, H, W, captions[i], s);
    }
  }
}

function drawLabel(ctx, x, y, text, s) {
  ctx.font = `600 ${17 * s}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const w = ctx.measureText(text).width + 24 * s;
  const h = 32 * s;
  ctx.fillStyle = "rgba(10, 12, 16, 0.72)";
  roundRect(ctx, x, y, w, h, 8 * s);
  ctx.fill();
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(text, x + 12 * s, y + h / 2 + 1 * s);
}

function drawCaption(ctx, x, H, W, text, s) {
  if (!text) return;
  const h = 26 * s;
  ctx.fillStyle = "rgba(10, 12, 16, 0.72)";
  ctx.fillRect(x, H - h, W, h);
  ctx.font = `${12 * s}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, x + 14 * s, H - h / 2, W - 28 * s);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
