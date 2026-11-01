"""
main.py  -  titik masuk TariCap

Contoh pemakaian (jalankan dari folder utama proyek):
    python capture/main.py                          # webcam 0
    python capture/main.py --source 1               # webcam lain
    python capture/main.py --source data/raw_videos/agem.mp4 --record
    python capture/main.py --ws --mirror            # live ke viewer browser

Tombol saat jendela video aktif:
    R  = mulai / berhenti merekam ke JSON
    Q  atau ESC = keluar

Alur per frame (sama dengan diagram di PRD):
    baca frame -> deteksi pose -> smoothing -> (rekam JSON) -> (kirim ke viewer) -> gambar overlay
"""

import argparse
import time
from pathlib import Path

import cv2

from drawing import draw_hud, draw_skeleton
from pose_detector import PoseDetector
from recorder import Recorder
from smoothing import PoseSmoother

ROOT = Path(__file__).resolve().parent.parent  # folder utama proyek
DEFAULT_MODEL = ROOT / "models" / "pose_landmarker_full.task"
DEFAULT_OUT = ROOT / "data" / "recordings"


def parse_args():
    p = argparse.ArgumentParser(description="TariCap: motion capture tari dengan computer vision")
    p.add_argument("--source", default="0",
                   help="angka = indeks webcam (0, 1, ...), atau path file video .mp4")
    p.add_argument("--model", default=str(DEFAULT_MODEL), help="path file model .task")
    p.add_argument("--record", action="store_true",
                   help="langsung merekam sejak awal (cocok untuk file video)")
    p.add_argument("--out", default=str(DEFAULT_OUT), help="folder hasil rekaman JSON")
    p.add_argument("--ws", action="store_true", help="aktifkan server WebSocket untuk viewer live")
    p.add_argument("--port", type=int, default=8765, help="port WebSocket")
    p.add_argument("--mirror", action="store_true",
                   help="balik gambar seperti cermin (enak untuk webcam)")
    p.add_argument("--no-smooth", action="store_true", help="matikan filter smoothing")
    p.add_argument("--no-window", action="store_true",
                   help="tanpa jendela video (proses file lebih cepat)")
    p.add_argument("--max-width", type=int, default=960,
                   help="perkecil frame yang lebih lebar dari ini supaya lebih cepat")
    return p.parse_args()


def open_source(source):
    # "0", "1", ... dianggap webcam; selain itu dianggap path file.
    if source.isdigit():
        cap = cv2.VideoCapture(int(source))
        is_file = False
    else:
        if not Path(source).exists():
            raise FileNotFoundError(f"File video tidak ditemukan: {source}")
        cap = cv2.VideoCapture(source)
        is_file = True
    if not cap.isOpened():
        raise RuntimeError(f"Sumber tidak bisa dibuka: {source}")
    return cap, is_file


def resize_if_needed(frame, max_width):
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (int(w * scale), int(h * scale)))


def main():
    args = parse_args()

    cap, is_file = open_source(args.source)
    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if source_fps <= 1:  # beberapa webcam melaporkan 0
        source_fps = 30.0

    detector = PoseDetector(args.model)
    smoother = None if args.no_smooth else PoseSmoother(min_cutoff=1.0, beta=0.3)
    recorder = Recorder()

    broadcaster = None
    if args.ws:
        from ws_server import PoseBroadcaster  # diimpor hanya jika dipakai
        broadcaster = PoseBroadcaster(port=args.port)
        broadcaster.start()

    frame_index = 0
    wall_start = time.perf_counter()
    fps_display = 0.0
    last_fps_time = wall_start
    frames_since_fps = 0

    print("Tekan R untuk merekam, Q untuk keluar.")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                if is_file:
                    print("Video selesai.")
                break

            frame = resize_if_needed(frame, args.max_width)
            if args.mirror:
                frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]

            # Waktu frame (detik). File video: dari nomor frame. Webcam: dari jam.
            if is_file:
                t = frame_index / source_fps
            else:
                t = time.perf_counter() - wall_start

            # Rekam otomatis sejak frame pertama jika --record dipakai.
            if args.record and frame_index == 0:
                recorder.start(args.source, source_fps, w, h)

            # 1) Deteksi pose
            image_lm, world_lm = detector.detect(frame, t * 1000)

            # 2) Smoothing
            if smoother is not None:
                image_lm, world_lm = smoother(image_lm, world_lm, t)

            # 3) Rekam
            recorder.add(t, image_lm, world_lm)

            # 4) Kirim ke viewer live
            if broadcaster is not None and image_lm is not None:
                broadcaster.send({
                    "t": round(t, 4),
                    "width": w,
                    "height": h,
                    "image": image_lm.round(4).tolist(),
                    "world": world_lm.round(4).tolist(),
                })

            # Hitung FPS tiap 0,5 detik
            frames_since_fps += 1
            now = time.perf_counter()
            if now - last_fps_time >= 0.5:
                fps_display = frames_since_fps / (now - last_fps_time)
                frames_since_fps = 0
                last_fps_time = now

            # 5) Tampilkan
            if not args.no_window:
                draw_skeleton(frame, image_lm)
                clients = len(broadcaster.clients) if broadcaster else None
                draw_hud(frame, fps_display, recorder.is_recording, image_lm is not None, clients)
                cv2.imshow("TariCap - tekan Q untuk keluar", frame)

                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key == ord("r"):
                    if recorder.is_recording:
                        recorder.stop(args.out)
                    else:
                        recorder.start(args.source, source_fps, w, h)

            frame_index += 1
    finally:
        if recorder.is_recording:
            recorder.stop(args.out)
        cap.release()
        detector.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
