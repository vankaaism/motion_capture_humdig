# Model

Folder ini menyimpan model MediaPipe Pose Landmarker (file `.task`). Model tidak ikut di zip karena ukurannya besar; unduh dengan:

```
python tools/download_model.py          # pose_landmarker_full.task (default)
python tools/download_model.py lite     # lebih ringan untuk laptop lambat
```

Jika skrip gagal (misalnya jaringan kampus memblokir), unduh manual dari halaman resmi MediaPipe Pose Landmarker dan simpan di folder ini dengan nama yang sama.
