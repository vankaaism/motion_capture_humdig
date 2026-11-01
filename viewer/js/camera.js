// camera.js - webcam access (getUserMedia), camera list and readable error messages.

export class CameraError extends Error {}

export function checkCameraSupport() {
  if (!window.isSecureContext) {
    throw new CameraError(
      "Kamera hanya bisa dipakai dari http://localhost atau HTTPS. Buka halaman ini lewat " +
        "http://localhost:8000/viewer/ (jalankan `python3 -m http.server 8000` dari folder proyek).",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("Browser ini tidak mendukung akses kamera (getUserMedia). Pakai Chrome, Edge, atau Safari terbaru.");
  }
}

export function describeCameraError(err) {
  if (err instanceof CameraError) return err.message;
  switch (err?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return (
        "Izin kamera ditolak. Klik ikon kamera di bilah alamat lalu pilih Izinkan. " +
        "Di macOS, cek juga System Settings > Privacy & Security > Camera, dan aktifkan untuk browser yang dipakai."
      );
    case "SecurityError":
      return "Akses kamera diblokir oleh pengaturan keamanan browser. Buka lewat http://localhost atau HTTPS.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "Kamera sedang dipakai aplikasi lain (Zoom, Meet, FaceTime, Photo Booth, atau tab lain). Tutup aplikasi itu lalu coba lagi.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Tidak ada kamera yang terdeteksi. Sambungkan webcam lalu coba lagi.";
    case "OverconstrainedError":
      return "Kamera tidak mendukung resolusi yang diminta.";
    default:
      return `Kamera gagal dibuka: ${err?.message || err}`;
  }
}

/** Start the camera on `video`. Returns { stream, width, height, label, deviceId }. */
export async function startCamera(video, deviceId = "") {
  checkCameraSupport();
  const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  const constraints = { audio: false, video: deviceId ? { ...base, deviceId: { exact: deviceId } } : { ...base, facingMode: "user" } };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // A camera that cannot do 1280x720 (or a stale deviceId) should not stop the demo.
    if (err?.name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    else throw err;
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
  }
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings?.() ?? {};
  return {
    stream,
    width: video.videoWidth,
    height: video.videoHeight,
    label: track?.label || "kamera",
    deviceId: settings.deviceId || deviceId,
  };
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}
