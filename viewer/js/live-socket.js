// live-socket.js - live poses from Python (capture/main.py --ws) over WebSocket.
// Messages: { t, width, height, image: [[x, y, z, vis] x 33], world: [...] }.

export class LiveSocket {
  constructor({ onFrame, onStatus, onClose }) {
    this.socket = null;
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.onClose = onClose;
  }

  get connected() {
    return this.socket !== null;
  }

  connect(url) {
    this.disconnect();
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.onStatus(`Alamat WebSocket tidak valid: ${err.message}`);
      this.onClose();
      return;
    }
    this.socket = ws;
    this.onStatus(`Menyambung ke ${url} ...`);
    ws.onopen = () => this.onStatus("Live tersambung. Bergeraklah di depan kamera Python.");
    ws.onerror = () => this.onStatus("Gagal tersambung. Sudahkah menjalankan: python capture/main.py --ws ?");
    ws.onclose = () => {
      if (this.socket === ws) {
        this.socket = null;
        this.onClose();
      }
    };
    ws.onmessage = (event) => {
      try {
        this.onFrame(JSON.parse(event.data));
      } catch (err) {
        console.warn("[TariCap] pesan live tidak valid", err);
      }
    };
  }

  disconnect() {
    const ws = this.socket;
    this.socket = null;
    if (ws) ws.close();
  }
}
