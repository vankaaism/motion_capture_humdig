"""
download_model.py
Mengunduh model MediaPipe Pose Landmarker ke folder models/.

    python tools/download_model.py            # varian full (seimbang, default)
    python tools/download_model.py lite       # paling ringan, untuk laptop lambat
    python tools/download_model.py heavy      # paling akurat, paling berat
"""

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL_TEMPLATE = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_{v}/float16/latest/pose_landmarker_{v}.task"
)


def main():
    variant = sys.argv[1] if len(sys.argv) > 1 else "full"
    if variant not in ("lite", "full", "heavy"):
        print("Pilih salah satu: lite, full, heavy")
        sys.exit(1)

    out_dir = ROOT / "models"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"pose_landmarker_{variant}.task"
    url = URL_TEMPLATE.format(v=variant)

    print(f"Mengunduh {url}")
    urllib.request.urlretrieve(url, out_path)
    size_mb = out_path.stat().st_size / 1e6
    print(f"Selesai: {out_path} ({size_mb:.1f} MB)")
    if variant != "full":
        print(f"Pakai dengan: python capture/main.py --model {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
