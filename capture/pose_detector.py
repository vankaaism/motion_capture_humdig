"""
pose_detector.py
Membungkus MediaPipe Pose Landmarker supaya bagian lain program cukup memanggil
satu fungsi: detect(frame, timestamp_ms).

Keluaran tiap frame:
- image_lm : array (33, 4) berisi x, y, z, visibility dalam koordinat gambar.
             x dan y bernilai 0 sampai 1 (relatif terhadap lebar dan tinggi gambar).
- world_lm : array (33, 4) berisi x, y, z, visibility dalam koordinat dunia (meter),
             titik nol di tengah pinggul. Sumbu y positif mengarah ke bawah.
Jika tidak ada orang terdeteksi, keduanya bernilai None.
"""

from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np


class PoseDetector:
    def __init__(self, model_path, min_confidence=0.5):
        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(
                f"Model tidak ditemukan: {model_path}\n"
                "Jalankan dulu: python tools/download_model.py"
            )

        BaseOptions = mp.tasks.BaseOptions
        PoseLandmarker = mp.tasks.vision.PoseLandmarker
        PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
        RunningMode = mp.tasks.vision.RunningMode

        # Mode VIDEO dipakai untuk webcam maupun file video.
        # Syaratnya: timestamp tiap frame harus selalu naik.
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=RunningMode.VIDEO,
            num_poses=1,  # demo ini fokus pada satu penari
            min_pose_detection_confidence=min_confidence,
            min_pose_presence_confidence=min_confidence,
            min_tracking_confidence=min_confidence,
        )
        self.landmarker = PoseLandmarker.create_from_options(options)
        self.last_timestamp_ms = -1

    def detect(self, frame_bgr, timestamp_ms):
        # MediaPipe menolak timestamp yang sama atau mundur, jadi kita jaga agar selalu naik.
        timestamp_ms = int(timestamp_ms)
        if timestamp_ms <= self.last_timestamp_ms:
            timestamp_ms = self.last_timestamp_ms + 1
        self.last_timestamp_ms = timestamp_ms

        # OpenCV membaca gambar dalam urutan warna BGR, MediaPipe butuh RGB.
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

        result = self.landmarker.detect_for_video(mp_image, timestamp_ms)

        if not result.pose_landmarks:
            return None, None

        image_lm = self._to_array(result.pose_landmarks[0])
        world_lm = self._to_array(result.pose_world_landmarks[0])
        return image_lm, world_lm

    @staticmethod
    def _to_array(landmarks):
        # Ubah daftar objek landmark menjadi array NumPy (33 baris x 4 kolom).
        rows = []
        for lm in landmarks:
            visibility = lm.visibility if lm.visibility is not None else 0.0
            rows.append([lm.x, lm.y, lm.z, visibility])
        return np.array(rows, dtype=np.float32)

    def close(self):
        self.landmarker.close()
