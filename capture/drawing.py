"""
drawing.py
Menggambar kerangka (skeleton) dan info layar di atas video.
Daftar sambungan ditulis sendiri supaya tidak bergantung pada modul lama MediaPipe.
Nomor titik mengikuti 33 landmark MediaPipe Pose (0 = hidung, 11/12 = bahu, dst.).
"""

import cv2

# Pasangan titik yang dihubungkan dengan garis.
POSE_CONNECTIONS = [
    # wajah (garis sederhana)
    (0, 2), (0, 5), (2, 7), (5, 8), (9, 10),
    # badan
    (11, 12), (11, 23), (12, 24), (23, 24),
    # lengan kiri (sisi kiri penari)
    (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    # lengan kanan
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    # kaki kiri
    (23, 25), (25, 27), (27, 29), (29, 31), (27, 31),
    # kaki kanan
    (24, 26), (26, 28), (28, 30), (30, 32), (28, 32),
]

LEFT_POINTS = {11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31}
RIGHT_POINTS = {12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32}

COLOR_LEFT = (80, 200, 255)    # oranye-kuning (format BGR)
COLOR_RIGHT = (255, 160, 60)   # biru
COLOR_CENTER = (230, 230, 230)


def draw_skeleton(frame, image_lm, min_visibility=0.3):
    if image_lm is None:
        return
    h, w = frame.shape[:2]

    # Ubah koordinat 0-1 menjadi piksel.
    points = []
    for x, y, _z, vis in image_lm:
        points.append((int(x * w), int(y * h), vis))

    for a, b in POSE_CONNECTIONS:
        xa, ya, va = points[a]
        xb, yb, vb = points[b]
        if va < min_visibility or vb < min_visibility:
            continue
        if a in LEFT_POINTS and b in LEFT_POINTS:
            color = COLOR_LEFT
        elif a in RIGHT_POINTS and b in RIGHT_POINTS:
            color = COLOR_RIGHT
        else:
            color = COLOR_CENTER
        cv2.line(frame, (xa, ya), (xb, yb), color, 2, cv2.LINE_AA)

    for i, (x, y, vis) in enumerate(points):
        if vis < min_visibility:
            continue
        cv2.circle(frame, (x, y), 4, (255, 255, 255), -1, cv2.LINE_AA)


def draw_hud(frame, fps, recording, detected, ws_clients=None):
    lines = [f"FPS: {fps:.1f}", "Pose: terdeteksi" if detected else "Pose: tidak ada"]
    if ws_clients is not None:
        lines.append(f"Viewer live: {ws_clients}")
    lines.append("[R] rekam  [Q] keluar")

    y = 28
    for text in lines:
        cv2.putText(frame, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(frame, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
        y += 24

    if recording:
        h, w = frame.shape[:2]
        cv2.circle(frame, (w - 30, 30), 10, (0, 0, 255), -1)
        cv2.putText(frame, "REC", (w - 80, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)
