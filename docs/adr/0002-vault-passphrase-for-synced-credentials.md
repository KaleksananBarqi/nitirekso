# 0002 — Enkripsi Kredensial Lintas Perangkat Memakai Vault Passphrase

Status: accepted

Sebelumnya kredensial API bursa dan kunci AI disimpan di `credentials/*.bin` dengan kunci AES-256-GCM yang diturunkan dari variabel lingkungan username OS (`USER`/`USERNAME`), sehingga berkas tersebut tidak portabel antar-perangkat (misalnya dari Desktop Linux/Windows ke Android).

Kami memutuskan mengenkripsi kredensial tersinkron di dalam **Sync Vault** memakai AES-256-GCM dengan kunci utama yang diturunkan menggunakan Argon2id dari **Vault Passphrase** buatan pengguna; pada tiap perangkat pengguna cukup memasukkan *passphrase* sekali dan kunci turunannya disimpan secara lokal di perangkat agar operasional harian tidak terganggu.

Alternatif memakai kunci statis di dalam biner aplikasi ditolak karena membuka risiko kebocoran API key apabila salinan folder Syncthing jatuh ke pihak lain, sedangkan opsi menyimpan kredensial hanya secara lokal per perangkat ditolak karena pengguna menginginkan sinkronisasi menyeluruh lintas perangkat tanpa input ulang setiap kunci.
