# nitirekso

Glosarium bahasa domain untuk sistem penyimpanan lokal, sinkronisasi antar-perangkat, dan pencadangan pada `nitirekso`.

## Language

**Sync Vault**:
Folder lokal pilihan pengguna yang dipantau aplikasi sinkronisasi eksternal (seperti Syncthing) berisi berkas operation log per perangkat dan berkas media immutable untuk pertukaran data antar-perangkat.
_Avoid_: folder backup, cloud folder, Google Drive folder

**Local Cache**:
Basis data SQLite internal pada setiap perangkat yang berfungsi sebagai indeks query cepat dan tempat kerja lokal, yang isinya selalu dapat dibangun ulang dari Sync Vault.
_Avoid_: database tersinkron, cloud database

**Device Sync**:
Pertukaran dan penggabungan perubahan data jurnal, pengaturan, media, dan kredensial terenkripsi antar-perangkat milik pengguna melalui Sync Vault.
_Avoid_: sync, backup sync

**Exchange Sync**:
Penarikan riwayat transaksi, eksekusi, biaya pendanaan, dan saldo akun dari API bursa kripto secara read-only ke perangkat lokal.
_Avoid_: sync, auto-backup

**Local Snapshot**:
Arsip cadangan point-in-time mandiri ke folder lokal pilihan pengguna untuk pemulihan darurat tanpa ketergantungan jaringan atau pihak ketiga.
_Avoid_: cloud backup, Google Drive backup, sync folder

**Vault Passphrase**:
Sandi rahasia buatan pengguna yang dipakai untuk menurunkan kunci enkripsi kredensial di dalam Sync Vault sehingga rahasia API tetap terlindungi lintas perangkat tanpa server pusat.
_Avoid_: password akun, token cloud, kunci OS
