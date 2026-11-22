# 0003 — Kebijakan Offline-Only: Penghapusan Total Google Drive dan Pertahankan Local Snapshot

Status: accepted

`nitirekso` dirancang dengan prinsip *local-first* yang ketat dan menolak ketergantungan penyimpanan daring milik pihak ketiga yang menyimpan data finansial atau kredensial pengguna di server eksternal.

Kami memutuskan menghapus seluruh integrasi Google Drive (aliran OAuth loopback, token terenkripsi, `clientId`, serta opsi mode cloud di antarmuka) dan merapikan fitur cadangan menjadi **Local Snapshot** murni ke folder lokal pilihan pengguna untuk arsip darurat *point-in-time*, berdampingan dengan **Device Sync** via Syncthing.

Alternatif mempertahankan opsi Google Drive OAuth secara pasif ditolak karena menambah permukaan serangan, kode mati yang tidak terpakai, dan bertentangan dengan prinsip anti-online aplikasi; penghapusan penuh tidak sulit dibalik bila di masa depan dibutuhkan, namun keputusan ini menyengaja ketiadaan jalur sinkronisasi cloud pada repositori.
