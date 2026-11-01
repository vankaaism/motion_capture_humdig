"""
plot_angles.py  (fitur F11)
Menggambar grafik sudut sendi terhadap waktu dari satu file rekaman JSON.
Berguna untuk slide "tari sebagai data": gerak tubuh menjadi kurva yang bisa dianalisis.

    python tools/plot_angles.py data/recordings/contoh_tari.json
    python tools/plot_angles.py data/recordings/contoh_tari.json --joints siku_kiri lutut_kanan --save grafik.png

Sudut dihitung dari koordinat dunia (world) supaya tidak terpengaruh jarak ke kamera.
"""

import argparse
import json

import matplotlib.pyplot as plt
import numpy as np

# Tiap sudut didefinisikan oleh tiga titik: (ujung A, titik sudut, ujung B).
JOINTS = {
    "siku_kiri": (11, 13, 15),
    "siku_kanan": (12, 14, 16),
    "bahu_kiri": (23, 11, 13),
    "bahu_kanan": (24, 12, 14),
    "lutut_kiri": (23, 25, 27),
    "lutut_kanan": (24, 26, 28),
    "pinggul_kiri": (11, 23, 25),
    "pinggul_kanan": (12, 24, 26),
}


def angle_deg(a, b, c):
    """Sudut ABC dalam derajat. a, b, c adalah titik 3D."""
    ba = a - b
    bc = c - b
    cos_val = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-9)
    return float(np.degrees(np.arccos(np.clip(cos_val, -1.0, 1.0))))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("recording", help="file JSON hasil rekaman")
    p.add_argument("--joints", nargs="+", default=["siku_kiri", "siku_kanan"],
                   choices=list(JOINTS.keys()))
    p.add_argument("--save", default=None, help="simpan ke file PNG alih-alih menampilkan")
    args = p.parse_args()

    with open(args.recording, encoding="utf-8") as f:
        data = json.load(f)

    plt.figure(figsize=(10, 4))
    for name in args.joints:
        ia, ib, ic = JOINTS[name]
        times, angles = [], []
        for frame in data["frames"]:
            if frame["world"] is None:
                continue  # frame tanpa deteksi dilewati
            pts = np.array(frame["world"])[:, :3]
            times.append(frame["t"])
            angles.append(angle_deg(pts[ia], pts[ib], pts[ic]))
        plt.plot(times, angles, label=name.replace("_", " "))

    plt.xlabel("Waktu (detik)")
    plt.ylabel("Sudut (derajat)")
    plt.title(f"Sudut sendi: {data['meta'].get('source', '')}")
    plt.legend()
    plt.grid(alpha=0.3)
    plt.tight_layout()

    if args.save:
        plt.savefig(args.save, dpi=150)
        print(f"Grafik tersimpan: {args.save}")
    else:
        plt.show()


if __name__ == "__main__":
    main()
