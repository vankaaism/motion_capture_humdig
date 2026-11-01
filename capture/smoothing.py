"""
smoothing.py
Pose estimation dari kamera biasa selalu sedikit "bergetar": posisi sendi melompat
beberapa piksel antarframe walaupun penari diam. Filter di sini meredam getaran itu.

Kita memakai One Euro Filter (Casiez dkk., 2012). Logikanya:
- Saat gerakan lambat, filter menghaluskan dengan kuat, sehingga getaran kecil hilang.
- Saat gerakan cepat, filter melonggar, sehingga gerak tari tidak terasa terlambat.

Dua parameter yang bisa diatur:
- min_cutoff : makin kecil, makin halus saat diam (tapi makin "lengket").
- beta       : makin besar, makin cepat filter mengejar gerakan cepat.
"""

import math

import numpy as np


class OneEuroFilter:
    def __init__(self, min_cutoff=1.0, beta=0.3, d_cutoff=1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self.x_prev = None   # nilai hasil filter sebelumnya
        self.dx_prev = None  # kecepatan hasil filter sebelumnya
        self.t_prev = None   # waktu frame sebelumnya (detik)

    @staticmethod
    def _alpha(cutoff, dt):
        # Mengubah frekuensi cutoff menjadi bobot campuran (0 sampai 1).
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def reset(self):
        self.x_prev = None
        self.dx_prev = None
        self.t_prev = None

    def __call__(self, x, t):
        """x: array NumPy (bentuk apa saja), t: waktu dalam detik."""
        x = np.asarray(x, dtype=np.float32)

        # Frame pertama: belum ada riwayat, kembalikan apa adanya.
        if self.x_prev is None:
            self.x_prev = x.copy()
            self.dx_prev = np.zeros_like(x)
            self.t_prev = t
            return x

        dt = t - self.t_prev
        if dt <= 0:
            dt = 1e-3
        self.t_prev = t

        # 1) Perkirakan kecepatan, lalu haluskan kecepatannya.
        dx = (x - self.x_prev) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self.dx_prev

        # 2) Cutoff naik saat gerakan cepat (bagian "adaptif" dari filter ini).
        cutoff = self.min_cutoff + self.beta * np.abs(dx_hat)
        tau = 1.0 / (2 * math.pi * cutoff)
        a = 1.0 / (1.0 + tau / dt)

        # 3) Campurkan nilai baru dengan nilai lama.
        x_hat = a * x + (1 - a) * self.x_prev

        self.x_prev = x_hat
        self.dx_prev = dx_hat
        return x_hat


class PoseSmoother:
    """Menyimpan dua filter: satu untuk koordinat gambar, satu untuk koordinat dunia.
    Hanya kolom x, y, z yang dihaluskan; kolom visibility dibiarkan."""

    def __init__(self, min_cutoff=1.0, beta=0.3):
        self.image_filter = OneEuroFilter(min_cutoff, beta)
        self.world_filter = OneEuroFilter(min_cutoff, beta)

    def __call__(self, image_lm, world_lm, t):
        if image_lm is None or world_lm is None:
            return image_lm, world_lm

        image_out = image_lm.copy()
        world_out = world_lm.copy()
        image_out[:, :3] = self.image_filter(image_lm[:, :3], t)
        world_out[:, :3] = self.world_filter(world_lm[:, :3], t)
        return image_out, world_out
