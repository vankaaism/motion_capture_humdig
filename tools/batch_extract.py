"""
batch_extract.py  (fitur F8)
Mengubah satu folder video menjadi satu folder file JSON gerak.
Cocok untuk dataset video tari Bali: setiap video gerak dasar menjadi satu rekaman.

    python tools/batch_extract.py data/raw_videos data/recordings/bali
    python tools/batch_extract.py data/raw_videos data/recordings/bali --limit 5
"""

import argparse
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "capture"))  # supaya bisa memakai modul di folder capture/

from pose_detector import PoseDetector  # noqa: E402
from recorder import Recorder  # noqa: E402
from smoothing import PoseSmoother  # noqa: E402

VIDEO_EXT = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def extract_video(video_path, out_dir, model_path, max_width=960):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"  lewati, tidak bisa dibuka: {video_path.name}")
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    # Detektor dan filter dibuat baru untuk tiap video, karena timestamp mulai lagi dari nol.
    detector = PoseDetector(model_path)
    smoother = PoseSmoother()
    recorder = Recorder()

    index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        if w > max_width:
            scale = max_width / w
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
            h, w = frame.shape[:2]
        if index == 0:
            recorder.start(video_path.name, fps, w, h)

        t = index / fps
        image_lm, world_lm = detector.detect(frame, t * 1000)
        image_lm, world_lm = smoother(image_lm, world_lm, t)
        recorder.add(t, image_lm, world_lm)
        index += 1

    cap.release()
    detector.close()
    return recorder.stop(out_dir, name=video_path.stem + ".json")


def main():
    p = argparse.ArgumentParser(description="Ekstrak pose dari banyak video sekaligus")
    p.add_argument("input_dir", help="folder berisi video")
    p.add_argument("output_dir", help="folder tujuan file JSON")
    p.add_argument("--model", default=str(ROOT / "models" / "pose_landmarker_full.task"))
    p.add_argument("--limit", type=int, default=None, help="proses hanya N video pertama")
    args = p.parse_args()

    videos = sorted(f for f in Path(args.input_dir).rglob("*") if f.suffix.lower() in VIDEO_EXT)
    if args.limit:
        videos = videos[: args.limit]
    if not videos:
        print("Tidak ada video ditemukan.")
        return

    print(f"{len(videos)} video akan diproses.")
    for i, video in enumerate(videos, start=1):
        print(f"[{i}/{len(videos)}] {video.name}")
        extract_video(video, args.output_dir, args.model)


if __name__ == "__main__":
    main()
