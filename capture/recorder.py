"""
recorder.py
Menyimpan satu sesi gerak menjadi file JSON. Inilah wujud "tari sebagai data":
setiap frame berisi waktu dan 33 titik tubuh.

Struktur file:
{
  "meta": {"source": ..., "fps": ..., "width": ..., "height": ..., ...},
  "frames": [
    {"t": 0.0, "image": [[x, y, z, vis], ... 33 baris], "world": [[x, y, z, vis], ...]},
    {"t": 0.033, "image": null, "world": null},   <- frame tanpa deteksi
    ...
  ]
}
"""

import json
from datetime import datetime
from pathlib import Path

DECIMALS = 4  # 4 angka di belakang koma sudah cukup teliti dan membuat file lebih kecil


def _round_array(arr):
    if arr is None:
        return None
    return [[round(float(v), DECIMALS) for v in row] for row in arr]


class Recorder:
    def __init__(self):
        self.is_recording = False
        self.meta = {}
        self.frames = []
        self.start_t = 0.0

    def start(self, source, fps, width, height):
        self.is_recording = True
        self.frames = []
        self.start_t = None
        self.meta = {
            "source": str(source),
            "fps": round(float(fps), 2),
            "width": int(width),
            "height": int(height),
            "recorded_at": datetime.now().isoformat(timespec="seconds"),
            "landmark_model": "mediapipe_pose_33",
            "coordinate_note": "image: x,y dinormalisasi 0-1; world: meter, titik nol di pinggul, y ke bawah",
        }
        print("[rekam] mulai merekam")

    def add(self, t, image_lm, world_lm):
        if not self.is_recording:
            return
        # Waktu dihitung dari awal rekaman, jadi file selalu mulai dari t = 0.
        if self.start_t is None:
            self.start_t = t
        self.frames.append({
            "t": round(t - self.start_t, DECIMALS),
            "image": _round_array(image_lm),
            "world": _round_array(world_lm),
        })

    def stop(self, out_dir="data/recordings", name=None):
        self.is_recording = False
        if not self.frames:
            print("[rekam] tidak ada frame, file tidak dibuat")
            return None

        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        if name is None:
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name = f"rekaman_{stamp}.json"
        path = out_dir / name

        detected = sum(1 for f in self.frames if f["image"] is not None)
        self.meta["frame_count"] = len(self.frames)
        self.meta["detected_frames"] = detected

        with open(path, "w", encoding="utf-8") as f:
            json.dump({"meta": self.meta, "frames": self.frames}, f)

        ratio = 100 * detected / len(self.frames)
        print(f"[rekam] tersimpan: {path} ({len(self.frames)} frame, pose terdeteksi {ratio:.1f}%)")
        return path
