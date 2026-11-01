"""
make_sample.py
Membuat file rekaman SINTETIS (dibangkitkan dengan rumus, tanpa kamera) supaya viewer
bisa langsung dicoba sebelum model MediaPipe atau webcam siap.

Gerakannya sederhana: kedua lengan mengayun bergantian di samping badan, torso
bergoyang pelan, lutut sedikit menekuk. Ini bukan gerak tari asli; gunakan hanya
untuk menguji viewer.

    python tools/make_sample.py
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "recordings" / "contoh_gerak_sintetis.json"

FPS = 30
DURATION = 8.0       # detik
UPPER_ARM = 0.28     # panjang lengan atas (meter)
FOREARM = 0.25       # panjang lengan bawah (meter)


def arm_points(shoulder, side, angle, bend, forward):
    """side = +1 untuk sisi kiri penari, -1 untuk kanan.
    angle = sudut lengan atas dari posisi menggantung (0 = ke bawah, pi/2 = ke samping)."""
    sx, sy, sz = shoulder
    elbow = (sx + side * UPPER_ARM * math.sin(angle),
             sy + UPPER_ARM * math.cos(angle),
             sz - forward)
    a2 = angle + bend
    wrist = (elbow[0] + side * FOREARM * math.sin(a2),
             elbow[1] + FOREARM * math.cos(a2),
             elbow[2] - forward)
    # Titik jari kelingking, telunjuk, ibu jari: sedikit di luar pergelangan.
    dx, dy = side * math.sin(a2) * 0.07, math.cos(a2) * 0.07
    pinky = (wrist[0] + dx, wrist[1] + dy + 0.015, wrist[2])
    index = (wrist[0] + dx, wrist[1] + dy - 0.015, wrist[2] - 0.01)
    thumb = (wrist[0] + dx * 0.6, wrist[1] + dy * 0.6 - 0.03, wrist[2] - 0.02)
    return elbow, wrist, pinky, index, thumb


def make_frame(t):
    w = 2 * math.pi
    sway = 0.03 * math.sin(w * 0.25 * t)            # goyang torso kiri-kanan
    knee_flex = 0.05 * (1 + math.sin(w * 0.5 * t))  # lutut menekuk berirama

    pts = [None] * 33

    # Kepala dan wajah (ikut bergoyang bersama torso)
    hx, hy = sway * 1.3, -0.62
    pts[0] = (hx, hy, -0.08)                                  # hidung
    pts[1], pts[2], pts[3] = (hx + .015, hy - .03, -.07), (hx + .03, hy - .03, -.07), (hx + .045, hy - .03, -.06)
    pts[4], pts[5], pts[6] = (hx - .015, hy - .03, -.07), (hx - .03, hy - .03, -.07), (hx - .045, hy - .03, -.06)
    pts[7], pts[8] = (hx + .075, hy - .01, 0.0), (hx - .075, hy - .01, 0.0)  # telinga
    pts[9], pts[10] = (hx + .02, hy + .03, -.07), (hx - .02, hy + .03, -.07)  # mulut

    # Bahu
    l_sh = (0.18 + sway, -0.45, 0.0)
    r_sh = (-0.18 + sway, -0.45, 0.0)
    pts[11], pts[12] = l_sh, r_sh

    # Lengan mengayun bergantian (fase berlawanan)
    phase = w * 0.5 * t
    l = arm_points(l_sh, +1, 1.6 + 0.6 * math.sin(phase), 0.6 + 0.4 * math.sin(phase + 1), 0.04)
    r = arm_points(r_sh, -1, 1.6 + 0.6 * math.sin(phase + math.pi), 0.6 + 0.4 * math.sin(phase + math.pi + 1), 0.04)
    pts[13], pts[15], pts[17], pts[19], pts[21] = l
    pts[14], pts[16], pts[18], pts[20], pts[22] = r

    # Pinggul (titik nol koordinat dunia ada di tengah pinggul)
    pts[23], pts[24] = (0.10, 0.0, 0.0), (-0.10, 0.0, 0.0)

    # Kaki: lutut maju sedikit saat menekuk, pergelangan kaki tetap
    for side, (hip_i, knee_i, ankle_i, heel_i, toe_i) in ((+1, (23, 25, 27, 29, 31)), (-1, (24, 26, 28, 30, 32))):
        x = 0.11 * side
        pts[knee_i] = (x, 0.42 - knee_flex * 0.3, -0.03 - knee_flex)
        pts[ankle_i] = (x, 0.82, 0.0)
        pts[heel_i] = (x, 0.86, 0.05)
        pts[toe_i] = (x, 0.88, -0.10)

    world = [[round(p[0], 4), round(p[1], 4), round(p[2], 4), 0.99] for p in pts]
    # Koordinat gambar: proyeksi sederhana dari koordinat dunia
    image = [[round(0.5 + p[0] * 0.38, 4), round(0.52 + p[1] * 0.42, 4), round(p[2] * 0.5, 4), 0.99] for p in pts]
    return {"t": round(t, 4), "image": image, "world": world}


def main():
    frames = [make_frame(i / FPS) for i in range(int(DURATION * FPS))]
    data = {
        "meta": {
            "source": "sintetis (tools/make_sample.py)",
            "fps": FPS,
            "width": 1280,
            "height": 720,
            "recorded_at": "2026-11-02T00:00:00",
            "landmark_model": "mediapipe_pose_33",
            "coordinate_note": "image: x,y dinormalisasi 0-1; world: meter, titik nol di pinggul, y ke bawah",
            "frame_count": len(frames),
            "detected_frames": len(frames),
        },
        "frames": frames,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"Tersimpan: {OUT} ({len(frames)} frame)")


if __name__ == "__main__":
    main()
