# Montion Capture Humdig

Motion capture tari dengan computer vision: kamera biasa membaca gerak penari, gerak itu disimpan sebagai data (koordinat 33 titik tubuh per frame), lalu dihidupkan kembali pada avatar 3D.

Proyek tugas Kemandirian Digital: demonstrasi digitalisasi seni tari. Rancangan lengkap ada di [`docs/PRD.md`](docs/PRD.md).

```
kamera / video ──► MediaPipe Pose ──► smoothing ──► panel 1: Tangkapan (video + kerangka + jejak)
 (browser atau      33 titik/frame       │      ├──► file JSON (rekaman, "tari sebagai data")
  Python)                                │      └──► penghalusan ──► panel 2: Animasi halus (avatar VRM)
```

## Cara tercepat: kamera di browser

Tidak perlu venv atau `pip install`. Cukup Python bawaan (untuk server lokal) dan Chrome, Edge, atau Safari.

```bash
# dari folder taricap/
python3 -m http.server 8000
```

Buka **http://localhost:8000/viewer/** lalu klik **Mulai kamera** dan izinkan akses kamera. Berdirilah 2 sampai 3 meter dari kamera sehingga seluruh badan terlihat.

Layar terbagi dua, dan keduanya tampil bersamaan:

1. **Tangkapan** (kiri): video dengan kerangka hasil deteksi (cyan), titik sendi (magenta), dan jejak gerak (kuning). Inilah "yang dilihat komputer": data mentah, sedikit bergetar.
2. **Animasi halus** (kanan): avatar 3D memperagakan gerak yang sama setelah melewati tahap penghalusan. Inilah gerak tari yang sudah menjadi animasi.

Tanpa kamera? Klik **Muat contoh sintetis**: kedua panel dan jejak gerak langsung bisa dicoba.

> **macOS:** jika kamera tidak muncul atau izin ditolak, buka **System Settings > Privacy & Security > Camera** dan aktifkan untuk browser yang dipakai (Chrome, Safari, dsb.), lalu muat ulang halaman. Tutup juga Zoom, Meet, FaceTime, atau Photo Booth, karena kamera hanya bisa dipakai satu aplikasi.

Kamera di browser hanya bekerja dari `http://localhost` atau HTTPS. Jangan buka lewat `file://` atau alamat IP jaringan.

### Pintasan keyboard

| Tombol | Fungsi |
| --- | --- |
| `R` | Mulai / berhenti merekam (JSON + video .webm kedua panel) |
| `C` | Hapus jejak gerak |
| `V` | Ganti tampilan: berdampingan → tangkapan saja → animasi saja (untuk proyektor kecil) |
| `S` | Simpan gambar PNG kedua panel (untuk slide) |
| `Spasi` | Putar / jeda rekaman |
| Klik dua kali panel avatar | Kembalikan sudut kamera 3D |

Di layar sempit (lebar di bawah 1000 px) kedua panel ditumpuk atas-bawah.

### Fitur viewer

- **Kamera:** pilihan kamera (jika lebih dari satu), **Cermin** (aktif bawaan), model pose **Full** atau **Lite**. Model dibaca dari `models/` dulu (jalan tanpa internet), baru dari server Google jika file lokal tidak ada. MediaPipe memakai GPU, otomatis pindah ke CPU jika GPU gagal.
- **Jejak gerak:** pilih sendi (tangan kanan/kiri, kaki kanan/kiri, kepala; masing-masing berwarna), panjang jejak 2, 5, 15 detik atau tanpa batas (maksimal 2000 titik per sendi). Jejak tampil di panel 1 dan sebagai garis 3D yang menempel pada tulang tangan avatar di panel 2.
- **Kekuatan penghalusan** (Mati / Ringan / Kuat), hanya untuk avatar: filter One Euro kedua yang lebih kuat, transisi antartulang dengan *slerp* quaternion, pembatasan rotasi tulang (ayunan dan puntiran per sendi), dan menahan pose terakhir saat deteksi hilang. Geser ke **Mati** saat demo untuk menunjukkan bedanya.
- **Rekam (`R`):** JSON berisi landmark hasil deteksi (bukan hasil penghalusan avatar), formatnya identik dengan `capture/recorder.py`. Setelah berhenti, `rekaman_YYYYMMDD_HHMMSS.json` terunduh dan langsung diputar ulang di kedua panel. Bersamaan direkam juga `taricap_YYYYMMDD_HHMMSS.webm` berisi kedua panel sebagai cadangan video demo.
- **Proses video:** pilih file video (misalnya klip dataset tari Bali). Video dianalisis frame demi frame (tidak ada frame terlewat walau laptop lambat), direkam otomatis, dan JSON terunduh saat video selesai. Video diproses tanpa suara.
- **Rekaman JSON** dan **live WebSocket dari Python** tetap tersedia. Hanya satu sumber yang aktif: menyalakan kamera menghentikan pemutaran dan live, dan sebaliknya.


## Isi folder

| Folder / file | Isi |
| --- | --- |
| `capture/main.py` | Program utama: webcam atau video, deteksi pose, rekam, kirim live |
| `capture/pose_detector.py` | Pembungkus MediaPipe Pose Landmarker |
| `capture/smoothing.py` | One Euro Filter untuk meredam getaran |
| `capture/recorder.py` | Simpan sesi gerak ke JSON |
| `capture/ws_server.py` | Server WebSocket untuk viewer live |
| `capture/drawing.py` | Gambar kerangka dan info di jendela video |
| `tools/download_model.py` | Unduh model MediaPipe |
| `tools/batch_extract.py` | Satu folder video menjadi satu folder JSON |
| `tools/plot_angles.py` | Grafik sudut sendi terhadap waktu |
| `tools/make_sample.py` | Buat rekaman sintetis untuk menguji viewer |
| `viewer/` | Halaman web: kamera dan MediaPipe di browser, three.js + three-vrm + Kalidokit (semua library lokal di `viewer/vendor/`, tidak perlu internet) |
| `viewer/js/` | Modul viewer: `detector.js` (MediaPipe), `camera.js`, `capture-view.js` (panel 1), `trail.js` + `trail-ribbon.js` (jejak 2D/3D), `refine.js` (penghalusan), `avatar-stage.js` (panel 2), `recorder.js`, `composite.js` (PNG/WebM), `player.js`, `live-socket.js`, `ui.js` |
| `viewer/avatars/avatar.vrm` | Avatar bawaan (VRoid AvatarSample D, CC0) |
| `data/recordings/contoh_gerak_sintetis.json` | Contoh rekaman (sintetis) |
| `.vscode/launch.json` | Tombol Run siap pakai di VS Code |

## 1. Jalur Python (opsional): persiapan sekali saja

Jalur ini dibutuhkan untuk `capture/main.py`, batch video, dan grafik. Demo kamera di browser di atas tidak membutuhkannya.

Butuh Python 3 versi yang didukung paket `mediapipe` (cek halaman PyPI-nya; versi Python terbaru kadang belum didukung).

```bash
# di terminal VS Code, dari folder taricap/
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
python tools/download_model.py
```

## 2. Coba viewer dulu (tanpa kamera)

Viewer harus dibuka lewat server lokal, karena browser memblokir modul JavaScript dari `file://`.

```bash
python -m http.server 8000
```

Buka **http://localhost:8000/viewer/** lalu klik **Muat contoh sintetis**. Kerangka akan bergerak.

Alternatif: pasang ekstensi Live Server di VS Code, buka folder `taricap/` sebagai workspace, klik kanan `viewer/index.html` lalu "Open with Live Server".

## 3. Motion capture

```bash
# webcam, dengan efek cermin
python capture/main.py --mirror

# tekan R untuk mulai/berhenti merekam, Q untuk keluar
# hasil tersimpan di data/recordings/rekaman_YYYYMMDD_HHMMSS.json
```

Muat file JSON itu di viewer lewat **Muat rekaman JSON**.

### Live: avatar mengikuti penari secara langsung

```bash
python capture/main.py --mirror --ws
```

Di viewer, klik **Sambung live**.

### Dari video dataset (misalnya tari Bali)

```bash
# satu video
python capture/main.py --source data/raw_videos/agem_kanan.mp4 --record

# satu folder sekaligus
python tools/batch_extract.py data/raw_videos data/recordings/bali
```

Semua perintah di atas juga tersedia di panel Run and Debug VS Code (`.vscode/launch.json`).

## 4. Avatar 3D

Viewer sudah membawa avatar: **AvatarSample_D** (karakter 千駄ヶ谷渋 / Sendagaya Shibu) dari sampel resmi VRoid Studio, lisensi **CC0**, disimpan di `viewer/avatars/avatar.vrm`.

- Sumber: [VRoid Studio CC0 models di OpenGameArt](https://opengameart.org/content/vroid-studio-cc0-models), berkas `avatarsample_d_0.zip` (pembuat: VRoid Project; diunggah oleh pengguna "hecko"). Lisensi di halaman itu: CC0. Halaman tersebut menjelaskan model ini dirilis VRoid di bawah CC0 (sampel A sampai C sengaja tidak disertakan karena syaratnya lebih ketat).
- Metadata di dalam file VRM (VRM 0.x) juga mengizinkan semuanya: dipakai siapa saja, komersial, modifikasi, redistribusi, tanpa wajib kredit.
- Rincian di `viewer/avatars/README.md`.

Avatar lain bisa dimuat lewat **Muat avatar .vrm**. Viewer selalu menampilkan avatar sebagai bayangan dari panel 1: dengan **Cermin** aktif, mengangkat tangan kanan membuat avatar mengangkat tangan di sisi layar yang sama. Untuk avatar bawaan, **Koreksi sumbu VRM** harus mati (bawaan). Nyalakan hanya jika lengan avatar lain bergerak terbalik.

## 5. Grafik untuk slide

```bash
python tools/plot_angles.py data/recordings/contoh_gerak_sintetis.json --joints siku_kiri siku_kanan --save grafik_siku.png
```

## Opsi `capture/main.py`

| Opsi | Fungsi |
| --- | --- |
| `--source 0` | Indeks webcam (0, 1, ...) atau path video |
| `--record` | Rekam otomatis sejak awal |
| `--ws` / `--port 8765` | Aktifkan viewer live |
| `--mirror` | Balik gambar seperti cermin |
| `--no-smooth` | Matikan filter (untuk membandingkan data mentah vs halus saat demo) |
| `--no-window` | Tanpa jendela video, proses file lebih cepat |
| `--model models/pose_landmarker_lite.task` | Pakai model lain |
| `--max-width 960` | Perkecil frame besar supaya lebih cepat |

## Masalah umum

| Gejala | Penyebab dan solusi |
| --- | --- |
| `Model tidak ditemukan` | Jalankan `python tools/download_model.py` |
| `pip install mediapipe` gagal | Versi Python terlalu baru; buat venv dengan versi yang didukung |
| FPS rendah | Pakai model `lite`, `--max-width 640`, tutup aplikasi lain |
| Viewer kosong, tombol contoh gagal | Viewer dibuka lewat `file://`; jalankan `python -m http.server 8000` dari folder `taricap/` |
| "Sambung live" gagal | Pastikan `capture/main.py --ws` sedang berjalan |
| Kaki avatar kaku atau bergetar | Batas Kalidokit dan kamera tunggal; pilih gerak dominan tubuh atas |
| "Izin kamera ditolak" di browser | macOS: System Settings > Privacy & Security > Camera, aktifkan untuk browser; lalu izinkan di bilah alamat |
| "Kamera sedang dipakai aplikasi lain" | Tutup Zoom, Meet, FaceTime, Photo Booth, atau tab lain yang memakai kamera |
| "Kamera hanya bisa dipakai dari localhost" | Buka lewat `http://localhost:8000/viewer/`, bukan `file://` atau alamat IP |
| Avatar terlambat mengikuti gerak | Turunkan **Kekuatan penghalusan** ke Ringan |
| FPS rendah di browser | Pilih model **Lite**, tutup tab lain |

## Atribusi dan lisensi

- [MediaPipe](https://ai.google.dev/edge/mediapipe) (Apache 2.0), model Pose Landmarker dari Google.
- [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.2.0 (Apache 2.0), disimpan lokal di `viewer/vendor/mediapipe/`. Model `pose_landmarker_full.task` dan `pose_landmarker_lite.task` dari Google (Apache 2.0).
- [three.js](https://threejs.org) 0.170.0 (MIT), [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) 3.5.5 (MIT), [Kalidokit](https://github.com/yeemachine/kalidokit) 1.1.5 (MIT). Salinan lisensi di `viewer/vendor/`.
- Avatar: AvatarSample_D, VRoid Project, CC0 ([OpenGameArt](https://opengameart.org/content/vroid-studio-cc0-models)).
- One Euro Filter: Casiez, Roussel, dan Vogel (2012), CHI.
- Dataset: tulis sumber serta lisensinya di sini sebelum presentasi.

## Catatan teknis viewer

- **Arah cermin avatar.** Kalidokit mengharapkan pose dari kamera cermin (selfie). Viewer selalu memberi Kalidokit pose yang dicerminkan, sehingga avatar memperagakan pose persis seperti yang tampak di panel 1. Ini diuji dengan mengukur arah setiap ruas lengan dan kaki avatar terhadap kerangka (rata-rata kemiripan kosinus 0,98), dan dengan kamera uji: tangan yang terangkat di panel 1 selalu berada di sisi layar yang sama dengan tangan avatar yang terangkat (25 dari 25 sampel). Dengan cara ini **Koreksi sumbu VRM** tidak dibutuhkan untuk avatar bawaan, jadi bawaannya mati.
- **Cermin** di browser sama dengan `--mirror` di Python: data yang terekam adalah data versi cermin. Rekaman dari kamera browser mencatat `(cermin)` di `meta.source`.
- **File JSON** dari browser ditulis persis seperti `json.dump` Python (urutan kunci, pemisah, `1.0`, 4 desimal), jadi `tools/plot_angles.py` dan alat Python lain bisa langsung membacanya.
- **Penghalusan** hanya mengubah avatar. Panel 1 dan file JSON memakai smoothing ringan yang sama dengan `capture/main.py` (One Euro, `min_cutoff=1.0`, `beta=0.3`).
