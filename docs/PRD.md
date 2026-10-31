# PRD: Digitalisasi Tari dengan Motion Capture Berbasis Computer Vision

2 November 2026 · Muchamad Zovanka Al-Maizani
Versi daring (bisa dikomentari): https://claude.ai/artifact/GFG5Amv78mhs6nDwoG6hX9

## 1. Ringkasan dan latar belakang

Proyek ini membangun aplikasi Python di VS Code yang membaca gerakan penari dari webcam atau video, mengekstrak kerangka tubuh dengan computer vision, lalu menggerakkan karakter 3D sebagai animasi. Nama kerja: **TariCap**.

Konteksnya tugas mata kuliah Kemandirian Digital: mendemonstrasikan bagaimana teknologi mendigitalisasi seni tari. Motion capture profesional memakai kostum bermarker dan banyak kamera, sehingga mahal dan jarang tersedia di kampus. Pose estimation berbasis kamera biasa menawarkan versi murah dari proses yang sama, dan itu yang ingin didemonstrasikan.

Argumen yang ingin ditunjukkan demo: gerak tari yang sebelumnya hanya hidup dalam tubuh penari dan rekaman video bisa disimpan sebagai **data** (koordinat sendi per frame). Begitu menjadi data, gerak itu bisa diarsipkan, dianalisis, diputar ulang pada avatar, dan dibagikan.

## 2. Tujuan, non-tujuan, dan metrik keberhasilan

Keberhasilan diukur dari satu hal: di depan kelas, gerakan penari (live atau dari video) muncul pada avatar 3D dengan jeda yang terasa wajar, dan datanya bisa disimpan lalu diputar ulang.

**Tujuan**

1. Menangkap pose tubuh 33 titik dari webcam atau file video dengan computer vision.
2. Menyimpan gerak sebagai file data (JSON) per frame, sebagai bukti "tari menjadi data".
3. Menggerakkan avatar 3D dari data tersebut, baik real-time maupun playback.
4. Menjalankan pipeline yang sama pada video tari dari dataset publik, termasuk tari tradisional Indonesia.

**Non-tujuan (di luar lingkup tugas)**

- Akurasi setara mocap optik studio. Pose estimation satu kamera punya batas yang diakui di bagian risiko.
- Tracking jari dan ekspresi wajah secara detail. Bisa jadi fitur tambahan kalau waktu cukup.
- Melatih model pose estimation sendiri. Kita memakai model pretrained.
- Aplikasi siap rilis publik dengan akun pengguna.

**Metrik (target usulan, bisa direvisi)**

| Metrik | Target | Cara ukur |
| --- | --- | --- |
| Kecepatan capture | ≥ 15 FPS di laptop biasa | Penghitung FPS di overlay OpenCV |
| Kelengkapan deteksi | ≥ 90% frame punya pose terdeteksi | `detected_frames / frame_count` di metadata JSON |
| Kehalusan animasi | Tidak ada lompatan sendi yang terlihat saat demo | Filter smoothing aktif, dicek visual |
| Reproduksibilitas | Demo bisa dijalankan ulang dari README dalam ≤ 10 menit | Teman sekelompok mencoba dari nol |
| Kejelasan demo | Durasi 3 sampai 5 menit, alur dipahami audiens | Gladi bersih sebelum presentasi |

## 3. Pengguna dan skenario demo

Pengguna utama adalah kelompok kita sebagai presenter; audiensnya dosen dan teman sekelas yang belum tentu paham computer vision.

**Skenario A: live capture (inti demo, sekitar 2 menit)**

1. Satu anggota berdiri 2 sampai 3 meter dari webcam, seluruh badan masuk frame.
2. Layar kiri menampilkan video dengan kerangka (skeleton) tergambar; layar kanan menampilkan avatar 3D.
3. Anggota memperagakan beberapa gerak tari sederhana; avatar mengikuti.
4. Tekan tombol rekam, gerak tersimpan ke file JSON.

**Skenario B: digitalisasi arsip tari (sekitar 1,5 menit)**

1. Buka video dari dataset tari Bali (misalnya gerak agem atau seledet).
2. Pipeline yang sama mengekstrak pose dari video itu.
3. Avatar memeragakan ulang gerak tari tersebut, tanpa penari hadir di ruangan.

**Skenario C: bukti "tari sebagai data" (sekitar 1 menit)**

1. Buka file JSON hasil rekaman dan tunjukkan isinya: koordinat sendi per frame.
2. Putar ulang file itu pada avatar, bisa dengan kecepatan lambat untuk menunjukkan detail.
3. Opsional: grafik sudut siku atau lutut terhadap waktu.

## 4. Kebutuhan fungsional

Enam fitur wajib sudah cukup untuk demo lengkap; sisanya dikerjakan hanya kalau waktu tersisa. Kolom terakhir menunjukkan status saat ini (diperbarui 2 November 2026, setelah viewer browser dua panel).

| ID | Fitur | Prioritas | Kriteria selesai | Status |
| --- | --- | --- | --- | --- |
| F1 | Input webcam dan file video (.mp4) | Wajib | `--source 0` atau `--source video.mp4` | Ada (Python), dan di browser: **Mulai kamera** (pilih kamera, cermin) serta **Proses video** frame demi frame |
| F2 | Deteksi pose 33 landmark per frame (MediaPipe Pose Landmarker) | Wajib | Landmark 2D (gambar) dan 3D (world) tersedia tiap frame | Ada (Python), dan di browser dengan @mediapipe/tasks-vision 1.2.0 lokal (GPU, cadangan CPU; model full/lite) |
| F3 | Overlay skeleton di video | Wajib | Garis antarsendi tergambar, ada penghitung FPS | Ada; di browser jadi panel **1 · Tangkapan** dengan FPS, jumlah titik, dan model di keterangan |
| F4 | Smoothing gerak (filter) | Wajib | Getaran sendi berkurang jelas dibanding data mentah | Ada (One Euro, ringan untuk panel 1 dan rekaman) |
| F5 | Rekam ke file JSON per sesi | Wajib | Metadata (fps, sumber, tanggal) dan frame berisi 33 titik x, y, z, visibility | Ada; browser menulis format yang identik dengan `capture/recorder.py`, plus video .webm kedua panel |
| F6 | Viewer avatar 3D yang memutar JSON | Wajib | Avatar VRM bergerak mengikuti file rekaman di browser | Ada; panel **2 · Animasi halus** dengan avatar CC0 bawaan (AvatarSample_D) |
| F7 | Mode real-time lewat WebSocket | Sebaiknya | Avatar mengikuti penari live | Ada; ditambah jalur kamera langsung di browser tanpa Python |
| F8 | Batch processing video dataset | Sebaiknya | Satu folder video menjadi satu folder JSON | Ada (Python); satu video juga bisa lewat **Proses video** di browser |
| F9 | Kontrol playback (play, pause, 0,25x sampai 2x) | Sebaiknya | Tombol berfungsi di viewer | Ada; kedua panel ikut diputar, jejak dibangun ulang saat menggeser posisi |
| F10 | Ekspor BVH lalu render di Blender | Tambahan | File .bvh bisa di-import ke Blender | Belum |
| F11 | Grafik sudut sendi terhadap waktu | Tambahan | Plot matplotlib untuk sendi pilihan | Ada |
| F12 | Perbandingan dua penari (skor kemiripan DTW) | Tambahan | Skor muncul untuk dua file JSON | Belum |
| F13 | Jejak gerak (motion trail) | Sebaiknya | Jalur sendi terpilih tergambar di video (2D) dan di avatar (3D), panjang 2/5/15 detik atau tanpa batas, bisa dihapus, bisa disimpan sebagai PNG | Ada |
| F14 | Tahap penghalusan (refinement) avatar | Sebaiknya | Filter kedua yang lebih kuat, slerp antartulang, batas rotasi tulang, tahan pose terakhir; kekuatan Mati/Ringan/Kuat bisa diganti saat demo | Ada |

## 5. Arsitektur dan pipeline teknis

Pipeline terdiri dari dua lapisan: Python menangkap dan menyimpan gerak, browser menerjemahkannya ke rotasi tulang avatar. Data mengalir ke avatar lewat dua jalur, live (WebSocket) atau playback (file JSON).

```
┌─ Python di VS Code (folder capture/) ──────────────────────────────────────┐
│                                                                            │
│  Sumber input ──► Pose Landmarker ──► Smoothing ──────► Recorder           │
│  webcam / .mp4    MediaPipe, 33 titik  One Euro Filter   sesi → file JSON  │
│                   2D + world 3D            │             tari sebagai data │
└────────────────────────────────────────────┼──────────────────┼────────────┘
                                 live: WebSocket      playback: file JSON
┌─ Browser (folder viewer/) ─────────────────┼──────────────────┼────────────┐
│                                            ▼                  ▼            │
│  Kontrol playback ──────────────────► Kalidokit ──────────► three-vrm      │
│  play, pause, 0,25x–2x               landmark → rotasi      avatar VRM     │
│                                      tulang (Euler)         (sampel CC0)   │
└────────────────────────────────────────────────────────────────────────────┘
```

File JSON di tengah pipeline adalah inti argumen demo: semua yang terjadi setelahnya hanya membaca data, sehingga gerak yang sama bisa diputar ulang kapan saja.

**Rincian tiap tahap**

1. **Sumber input:** OpenCV membaca frame dari webcam atau file MP4.
2. **Pose Landmarker:** MediaPipe menghasilkan 33 landmark per frame, dalam koordinat gambar (0 sampai 1) dan koordinat world 3D (meter, berpusat di pinggul).
3. **Smoothing:** filter meredam getaran kecil antarframe; frame tanpa deteksi ditandai `null` dan viewer menahan pose terakhir.
4. **Recorder:** setiap frame ditulis ke JSON beserta timestamp.
5. **Kalidokit:** landmark 2D dan world 3D diubah menjadi rotasi tulang (lengan, torso, pinggul, kaki).
6. **three-vrm:** rotasi diterapkan ke tulang humanoid avatar VRM, lalu dirender di browser.
7. **Opsional:** JSON dikonversi ke BVH dan di-retarget ke karakter Mixamo di Blender untuk render video berkualitas tinggi.

## 6. Rekomendasi aset animasi publik

Rekomendasi utama: avatar format **VRM** dari sampel resmi VRoid Studio (lisensi CC0), dirender dengan three.js + `@pixiv/three-vrm`, dan digerakkan oleh **Kalidokit**. Kombinasi ini sudah terbukti untuk kasus "MediaPipe menggerakkan avatar", sehingga kita tidak perlu menulis matematika rotasi tulang dari nol.

| Opsi | Format | Lisensi | Kelebihan | Kekurangan | Peran di proyek |
| --- | --- | --- | --- | --- | --- |
| [VRoid Studio sample models](https://opengameart.org/content/vroid-studio-cc0-models) (AvatarSample, base male/female) | .vrm | CC0, bebas dipakai dan diubah | Rig humanoid standar, langsung cocok dengan Kalidokit, ringan di browser | Gaya anime, kurang "Nusantara" | **Utama** |
| [VRoid Studio](https://hub.vroid.com) (buat sendiri) | .vrm | Milik kita sendiri | Bisa didandani menyerupai busana tari, gratis | Butuh 1 sampai 2 jam desain | Peningkatan visual |
| [Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) (X Bot / Y Bot) | .fbx | Bebas royalti, file mentah tidak boleh diredistribusi | Standar industri, cocok untuk Blender | Retargeting dari MediaPipe lebih repot | Jalur Blender (F10) |
| [Quaternius / Kenney](https://app.cinevva.com/guides/free-character-animations-rigging) | .glb / .fbx | CC0 | Bebas total, gaya low-poly | Rig tidak standar VRM | Cadangan |

**Mengapa VRM lebih cocok untuk konteks ini**

- Kalidokit menerima landmark MediaPipe Pose (33 titik) dan menghitung rotasi Euler tiap tulang untuk model VRM. Ini memotong pekerjaan tersulit, yaitu retargeting.
- VRM menyimpan izin penggunaan di dalam file, sehingga status lisensi bisa ditunjukkan saat presentasi.
- Jalan di browser, sehingga demo cukup membuka satu halaman lokal tanpa instal software 3D.

**Catatan untuk tari:** dokumentasi Kalidokit menyebut kalkulasi kaki masih dalam pengembangan. Gerak tangan, lengan, dan torso (misalnya ulap-ulap, agem) akan tampil lebih meyakinkan daripada footwork. Pilih gerak demo yang dominan tubuh bagian atas.

**Soal keterwakilan budaya:** avatar bergaya anime bisa mengundang kritik bahwa tari tradisional "dipakaikan" estetika lain. Dua jalan keluar: buat avatar sendiri di VRoid Studio dengan warna busana yang terinspirasi kostum tari, atau angkat isu ini secara eksplisit di presentasi sebagai keterbatasan digitalisasi.

## 7. Rekomendasi dataset

Temuan penting: Kaggle tidak punya dataset gerak tari (motion sequence) yang benar-benar kuat. Dataset tari terbaik untuk proyek ini ada di Mendeley Data dan situs resmi AIST++, sementara Kaggle paling berguna untuk data gambar pose tari.

**Pilihan dari Kaggle**

| Dataset | Isi | Kegunaan di proyek | Catatan |
| --- | --- | --- | --- |
| [Indian Dance Form Classification](https://www.kaggle.com/datasets/aditya48/indian-dance-form-classification) | 599 gambar, 8 tari klasik India | Uji ketahanan pose estimator pada kostum dan pose tari yang rumit | Gambar diam, tidak bisa jadi animasi |
| [Bharatnatyam Dance Poses](https://www.kaggle.com/datasets/pranavmanoj/bharatnatyam-dance-poses) | 9 pose bharatanatyam berlabel, sudah diaugmentasi | Fitur tambahan: klasifikasi pose tari dari landmark | Gambar diam, augmentasi bisa membuat data kurang alami |
| ["Dance Motion Capture Dataset (DMCD)"](https://www.kaggle.com/datasets/zara2099/aist-dance-motion-capture-dataset) | Mengaku AIST++, tapi file yang tercantum adalah CSV 7.000 baris berisi fitur "IoT" | **Hindari** | Deskripsi tidak cocok dengan isi; kemungkinan data sintetis |

**Pilihan terbaik di luar Kaggle**

| Dataset | Isi | Kegunaan di proyek | Lisensi / akses |
| --- | --- | --- | --- |
| [Video Balinese dance, perempuan](https://data.mendeley.com/datasets/s2gv9d6gpb) (STIKOM Bali) | 1.740 video MP4, 13 gerak dasar, 9 penari | **Utama untuk Skenario B** | Artikel di Data in Brief berlisensi CC BY 4.0; cek lisensi file di Mendeley |
| [Video Balinese dance, laki-laki](https://data.mendeley.com/datasets/tr9py7hzj4) | 828 video, 11 gerak dasar, 4 penari | Pelengkap: variasi gerak putra | Sama seperti di atas |
| [AIST++](https://google.github.io/aistplusplus_dataset/download.html) (Google) | 1.408 sekuens, 10 genre, keypoints 3D (N, 17, 3) dan SMPL | Pembanding "ground truth" | Wajib setuju Terms of Use AIST Dance DB |
| [Motorica Dance Dataset](https://github.com/simonalexanderson/MotoricaDanceDataset) | 6 jam mocap optik, 8 gaya, BVH | Contoh output mocap profesional | Cek ketentuan di repo |

**Rekomendasi kombinasi**

1. Dataset Balinese dance sebagai bahan utama, karena paling dekat dengan tema digitalisasi seni tari Indonesia dan sudah berbentuk video.
2. AIST++ untuk satu slide perbandingan: hasil webcam kita versus data 3D hasil rekonstruksi multi-kamera.
3. Kalau tugas mewajibkan tautan Kaggle: pakai Indian Dance Form sebagai uji gambar, atau unggah subset video Bali ke Kaggle sebagai dataset kita sendiri, dengan atribusi dan setelah memastikan lisensinya mengizinkan redistribusi.

## 8. Tech stack, struktur folder, dan kebutuhan non-fungsional

Python menangani semua computer vision dan penyimpanan data; browser hanya menampilkan avatar.

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Bahasa capture | Python 3 (versi yang didukung paket mediapipe, cek PyPI) | Ekosistem computer vision paling lengkap |
| Pose estimation | MediaPipe Pose Landmarker (`pose_landmarker_full.task`) | 33 landmark, keluaran koordinat gambar dan world 3D |
| Video I/O | OpenCV (`opencv-python`) | Baca webcam dan MP4, gambar overlay |
| Smoothing | One Euro Filter (NumPy) | Mengurangi getaran tanpa membuat gerak terlambat jauh |
| Komunikasi real-time | `websockets` (Python) | Kirim pose per frame ke browser (F7) |
| Viewer 3D | three.js 0.170 + `@pixiv/three-vrm` 3.5.5 + `kalidokit` 1.1.5, disimpan lokal di `viewer/vendor/` | Render VRM dan hitung rotasi tulang, tanpa butuh internet saat demo |
| Editor | VS Code + ekstensi Python dan Live Server | Satu workspace untuk Python dan HTML |
| Opsional | Blender 4.x | Render hasil BVH berkualitas tinggi (F10) |

**Format file rekaman (JSON)**

```json
{
  "meta": {"source": "webcam", "fps": 30, "width": 960, "height": 540, "recorded_at": "2026-11-10T09:00:00", "landmark_model": "mediapipe_pose_33"},
  "frames": [
    {"t": 0.0, "image": [[0.51, 0.32, -0.10, 0.99], ...], "world": [[0.02, -0.55, -0.08, 0.99], ...]},
    {"t": 0.033, "image": null, "world": null}
  ]
}
```

**Kebutuhan non-fungsional**

- **Performa:** jalan di laptop tanpa GPU khusus; pakai model `lite` bila FPS di bawah target.
- **Privasi:** rekaman wajah teman hanya disimpan atas izin; file JSON landmark tidak memuat gambar wajah.
- **Keterbacaan kode:** fungsi pendek, nama variabel jelas, komentar menjelaskan alasan langkah.
- **Portabilitas:** semua dependensi tercatat di `requirements.txt`; viewer cukup dibuka lewat server lokal.
- **Atribusi:** README mencantumkan sumber avatar, dataset, dan library beserta lisensinya.

## 9. Milestone, risiko, dan pertanyaan terbuka

Urutan kerja dibuat supaya setiap tahap sudah menghasilkan sesuatu yang bisa didemokan.

**Milestone (tanggal menyusul setelah deadline diketahui)**

1. **M1 Skeleton di layar:** webcam + MediaPipe + overlay skeleton + FPS (F1 sampai F3).
2. **M2 Tari menjadi data:** smoothing dan rekaman JSON (F4, F5). Titik minimum demo.
3. **M3 Avatar bergerak:** viewer VRM memutar file JSON (F6, F9).
4. **M4 Arsip tari Bali:** batch extract video dataset, pilih 2 sampai 3 gerak terbaik (F8).
5. **M5 Real-time:** WebSocket dari Python ke viewer (F7).
6. **M6 Poles demo:** gladi, slide, README, atribusi. Fitur tambahan (F10 sampai F12) hanya jika ada sisa waktu.

**Risiko dan mitigasi**

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Kedalaman (sumbu z) dari satu kamera tidak akurat | Avatar terlihat condong atau memutar aneh | Pakai world landmarks, penari menghadap kamera, akui keterbatasan di presentasi |
| Kaki dan footwork kurang stabil di Kalidokit | Gerak kaki avatar kaku atau bergetar | Pilih gerak dominan tangan dan torso |
| Kostum, kain, atau kipas menutupi sendi | Deteksi hilang di beberapa frame | Viewer menahan pose terakhir; uji dulu pada video dataset Bali |
| Gerak halus (seledet mata, jari) tidak tertangkap model 33 titik | Makna gerak hilang | Jelaskan sebagai batas teknologi; Hand/Face Landmarker sebagai pengembangan lanjut |
| Laptop lambat saat live demo | FPS turun | Model lite, `--max-width 640`, siapkan rekaman JSON cadangan |
| Lisensi dataset atau avatar tidak jelas | Masalah atribusi | Catat lisensi tiap aset di README sebelum dipakai |
| Pencahayaan ruang kelas buruk | Deteksi turun | Uji di ruangan presentasi; siapkan video cadangan |

**Pertanyaan terbuka**

- [ ] Kapan deadline tugas dan berapa durasi presentasi?
- [ ] Apakah dosen mewajibkan dataset dari Kaggle secara spesifik, atau dataset publik mana pun boleh?
- [ ] Tugas individu atau kelompok? Siapa mengerjakan bagian Python dan siapa bagian viewer?
- [ ] Apakah ada teman yang bisa menari secara langsung untuk Skenario A?
- [ ] Avatar sampel CC0 atau avatar buatan sendiri dengan nuansa busana tari?
