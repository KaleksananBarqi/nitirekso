# 0001 — Sync Vault Berbasis Operation Log + Local Cache SQLite

Status: accepted

Menempatkan berkas SQLite mentah langsung di folder sinkronisasi seperti Syncthing berisiko tinggi menimbulkan kerusakan data akibat mode WAL (`-wal`/`-shm`), penguncian berkas serentak antar-perangkat, serta keterbatasan Scoped Storage / SAF pada Android saat mengakses penyimpanan bersama.

Kami memutuskan memisahkan **Local Cache** (SQLite internal per perangkat sebagai mesin query cepat) dari **Sync Vault** (folder pilihan pengguna berisi *append-only operation log* per `device_id` di `ops/<device_id>/` dan media *content-addressed* di `media/<sha256>.<ext>`), dengan resolusi konflik *field-level Last-Write-Wins* berbasis HLC, identitas lintas perangkat UUID (UUIDv5 deterministik dari `exchange:external_id` untuk hasil **Exchange Sync**, UUIDv4 untuk entitas lain), dan *tombstone* `deleted_at`.

Alternatif menempatkan satu berkas SQLite tunggal mode `DELETE` di folder Syncthing ditolak karena mengharuskan penggunaan bergantian secara ketat, rentan konflik file Syncthing, dan tetap membutuhkan mekanisme salin masuk/keluar di Android. Abstraksi trait `VaultStorage` memisahkan logika sinkronisasi dari sistem berkas sehingga implementasi Android SAF dapat disambungkan kemudian tanpa mengubah mesin merge.
