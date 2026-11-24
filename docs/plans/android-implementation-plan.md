# Rencana Implementasi `nitirekso` Android (Tauri v2 Full Feature Parity)

Dokumen ini adalah panduan eksekusi bertahap dan siap pakai untuk agent berikutnya agar implementasi target Android `nitirekso` berjalan deterministik, tanpa regresi desktop, dan selaras penuh dengan arsitektur yang disepakati.

## 0. Konteks & Dokumen Wajib Baca Sebelum Eksekusi

Sebelum mengubah kode apa pun, baca dokumen berikut:
1. [GLOSSARY.md](../../GLOSSARY.md) — istilah kanonik domain (`Sync Vault`, `Local Cache`, `Device Sync`, `Exchange Sync`, `Local Snapshot`, `Vault Passphrase`).
2. [ADR-0001](../adr/0001-sync-vault-oplog-and-local-sqlite-cache.md) — pemisahan `Local Cache` SQLite dan `Sync Vault` append-only oplog + trait `VaultStorage`.
3. [ADR-0002](../adr/0002-vault-passphrase-for-synced-credentials.md) — enkripsi kredensial lintas perangkat via Argon2id + AES-256-GCM.
4. [ADR-0003](../adr/0003-offline-only-local-snapshot-no-cloud-backup.md) — kebijakan 100% *offline-only* tanpa cloud.
5. [ADR-0004](../adr/0004-android-tauri-saf-and-native-media-pipeline.md) — keputusan arsitektur Android (Tauri v2 monorepo, SAF, tanpa `ffmpeg`, foreground sync, Android Keystore, `allowBackup="false"`).
6. [DESIGN.md](../../DESIGN.md) & [AGENTS.md](../../AGENTS.md) — arah visual, token warna WCAG AA, dan aturan kualitas UI (`antislop-ui`, `antislop-layoutmobile`, `antislop-human`).

## Aturan Non-Negosiable (Guardrails)

- **Monorepo Tauri v2:** Tidak membuat repo atau aplikasi native terpisah; seluruh engine Rust & UI React dibagi antara Desktop dan Android.
- **Full Feature Parity sejak v1:** Dashboard, TradeLog, Journal/Checklist/Screenshot, **Exchange Sync** (5 bursa), **Device Sync** (Syncthing), AI Insights, **Local Snapshot**, Export CSV/JSON, dan Share Card (gambar + video MP4) wajib berfungsi di Android.
- **Target OS & ABI:** `minSdk = 29` (Android 10+), rilis `arm64-v8a` (`aarch64-linux-android`).
- **Patuh Scoped Storage:** Dilarang memakai `MANAGE_EXTERNAL_STORAGE`. Semua akses folder bersama (**Sync Vault** & **Local Snapshot**) wajib via **Android SAF (`ACTION_OPEN_DOCUMENT_TREE`)** dengan *persisted URI permission*.
- **Tanpa Bundel FFmpeg di Android:** Gunakan `WebCodecs` + `mp4-muxer` + Android native `MediaMuxer`.
- **Offline-Only Security:** `android:allowBackup="false"` wajib di `AndroidManifest.xml`; `.device-secret` dibungkus **Android Keystore (hardware-backed)**.
- **Nol Regresi Desktop:** Setelah setiap fase, `npm run typecheck`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, dan `npm run build` wajib lulus 100%.

---

## Fase 0 — Prasyarat Environment Lokal Linux & Inisialisasi Proyek Android

**Tujuan:** Menyiapkan toolchain Android minimal di Linux (tanpa Android Studio penuh) dan menghasilkan kerangka `src-tauri/gen/android/`.

### Langkah Eksekusi
1. **Pasang JDK 17** (OpenJDK 17) dan set `JAVA_HOME`:
   - Pastikan `java -version` menampilkan versi `17.x`.
2. **Pasang Android Command-Line Tools & SDK/NDK** di `$HOME/Android/Sdk`:
   - Komponen minimum via `sdkmanager`:
     - `platform-tools` (`adb`)
     - `platforms;android-35` (atau SDK terbaru yang kompatibel dengan Tauri v2.12+)
     - `build-tools;35.0.0`
     - `ndk;27.2.12479018` (atau r27 LTS terbaru)
   - Set environment variable persisten (`~/.bashrc` / `~/.zshrc`):
     ```bash
     export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
     export ANDROID_HOME="$HOME/Android/Sdk"
     export NDK_HOME="$ANDROID_HOME/ndk/<versi-ndk-terpasang>"
     export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
     ```
3. **Tambahkan Rust target Android:**
   ```bash
   rustup target add aarch64-linux-android
   # Opsional jika suatu saat butuh emulator x86_64:
   # rustup target add x86_64-linux-android
   ```
4. **Inisialisasi kerangka Android Tauri v2:**
   ```bash
   npx tauri android init
   ```
   - Periksa direktori hasil `src-tauri/gen/android/`.
   - Verifikasi `applicationId` = `com.nitirekso.app` dan `debugApplicationIdSuffix` = `.debug` (sesuai `src-tauri/tauri.conf.json`).
   - Pastikan `minSdk = 29` di `src-tauri/gen/android/app/build.gradle.kts`.
   - Tambahkan `android:allowBackup="false"` dan `android:fullBackupContent="false"` di `src-tauri/gen/android/app/src/main/AndroidManifest.xml`.

### Kriteria Selesai Fase 0
- `adb devices` mendeteksi HP Android fisik (atau environment siap pakai).
- `rustup target list --installed` memuat `aarch64-linux-android`.
- `src-tauri/gen/android/` terbentuk bersih dengan `minSdk = 29` dan `allowBackup="false"`.

---

## Fase 1 — Refactor Backend Rust Cross-Platform (`src-tauri/`)

**Tujuan:** Menghilangkan seluruh ketergantungan desktop-only di Rust agar `cargo check --target aarch64-linux-android` lulus bersih, sekaligus membuka jalur plug-in untuk `SafVaultStorage`.

### 1.1 Pembaruan `src-tauri/Cargo.toml`
- **TLS murni Rust untuk `reqwest`:**
  Ubah `reqwest = { version = "0.12", features = ["json", "stream"] }` menjadi:
  ```toml
  reqwest = { version = "0.12", default-features = false, features = ["json", "stream", "rustls-tls-webpki-roots"] }
  ```
- **Ganti `opener` → `tauri-plugin-opener`:**
  - Hapus `opener = "0.7"` dari `[dependencies]`.
  - Tambahkan `tauri-plugin-opener = "2"` di `[dependencies]` (dan `@tauri-apps/plugin-opener` di `package.json` jika dipanggil dari frontend, serta daftarkan izin di `src-tauri/capabilities/`).
- **Gate `rfd` khusus desktop:**
  - Pindahkan `rfd = "0.15"` ke `[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`.
- **Hapus ketergantungan wajib `dirs` di mobile:**
  - Pindahkan `dirs = "6.0"` ke desktop-only atau jadikan fallback internal saja setelah `AppPaths` menggunakan `app.path().app_data_dir()`.

### 1.2 Sentralisasi Path Data Aplikasi (`AppPaths`)
Saat ini `dirs::data_dir()` dipakai langsung di 3 modul (di Android mengembalikan `None`):
- `src-tauri/src/db/mod.rs` (`get_db_path()`)
- `src-tauri/src/credentials/mod.rs` (`credentials_dir()`)
- `src-tauri/src/logging/mod.rs` (`get_log_dir()`)

**Rencana perubahan:**
- Buat modul kecil (mis. `src-tauri/src/app_paths.rs`) dengan `OnceLock<PathBuf>` yang diinisialisasi satu kali di `lib.rs` dalam `.setup(|app| ...)` menggunakan `app.path().app_data_dir()`:
  - **Desktop:** pertahankan kompatibilitas mundur lokasi lama (`dirs::data_dir()/nitirekso/...` dan migrasi legacy Electron) agar data pengguna desktop yang sudah ada tidak berpindah lokasi!
  - **Android:** gunakan `app.path().app_data_dir()` langsung (`/data/user/0/com.nitirekso.app/files/`):
    - SQLite: `<app_data_dir>/data/trading-journal.sqlite`
    - Credentials: `<app_data_dir>/credentials/`
    - Logs: `<app_data_dir>/logs/app.log`
    - Device secret: `<app_data_dir>/data/.device-secret`
- Perbarui `db/mod.rs`, `credentials/mod.rs`, dan `logging/mod.rs` untuk membaca dari `app_paths`.

### 1.3 Penyatuan Enkripsi Kredensial Lokal (`credentials/mod.rs` + `vault/crypto.rs`)
- Di `src-tauri/src/credentials/mod.rs`, `derive_key()` saat ini memakai `std::env::var("USERNAME").or_else(|_| std::env::var("USER"))`. Di Android ini selalu fallback `"default_user"`.
- **Rencana perubahan:**
  - Tambahkan dukungan kunci berbasis `.device-secret` (memakai `vault::crypto::load_or_create_device_secret` yang pada Android dibungkus Android Keystore di Fase 2).
  - **Kompatibilitas mundur Desktop:** saat membaca file kredensial lama (`.bin`), coba dekripsi dengan skema baru dulu; jika gagal pada desktop, fallback dekripsi dengan skema lama lalu re-encrypt otomatis ke skema baru.
  - Tambahkan trait/abstraksi `DeviceSecretStore` di `vault/crypto.rs` agar Desktop memakai file `.device-secret` lokal dan Android menyambungkan wrapper Android Keystore (Fase 2C).

### 1.4 Abstraksi Dinamis `VaultStorage` di `VaultState`
Saat ini `src-tauri/src/vault/engine.rs` (`active_storage(&self) -> Option<FsVaultStorage>`) dan `src-tauri/src/commands/vault.rs` (`FsVaultStorage::new(...)`) masih hardcode `FsVaultStorage`.
- Ubah `active_storage(&self)` agar mengembalikan `Option<Arc<dyn VaultStorage>>` (atau factory `create_vault_storage(app: &AppHandle, vault_uri_or_path: &str) -> Result<Arc<dyn VaultStorage>, String>`):
  - Jika `vault_path` berawalan `content://` (Android SAF URI) → kembalikan `SafVaultStorage` (diimplementasikan di Fase 2A).
  - Jika path sistem berkas biasa (Desktop) → kembalikan `FsVaultStorage`.
- Pastikan seluruh unit test `vault/engine.rs` tetap lulus tanpa perubahan logika merge HLC/oplog.

### 1.5 Penggantian `opener` & Guard `rfd`
- `src-tauri/src/app_utils/mod.rs` (`open_external_url`): gunakan `tauri_plugin_opener::OpenerExt` (`app.opener().open_url(trimmed, None::<&str>)`).
- `src-tauri/src/logging/mod.rs` (`open_log_folder`): di desktop gunakan `app.opener().open_path(...)`; di Android kembalikan aksi bagikan file log via Share Sheet (Fase 2B) atau pesan informatif.
- `src-tauri/src/export/mod.rs`, `src-tauri/src/commands/video.rs`, `src-tauri/src/commands/backup.rs`, `src-tauri/src/commands/vault.rs`: bungkus semua pemanggilan `rfd::FileDialog` dengan `#[cfg(not(any(target_os = "android", target_os = "ios")))]` dan sediakan cabang `#[cfg(target_os = "android")]` yang memanggil bridge Fase 2.

### Verifikasi Fase 1
```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-linux-android
```

---

## Fase 2 — Plugin Kotlin Native Android (`SafVaultStorage`, `MediaMuxer`, `MediaStore`, `AndroidKeyStore`)

**Tujuan:** Membuat satu plugin Tauri lokal yang rapi (mis. `src-tauri/plugins/tauri-plugin-nitirekso-android/` atau langsung di modul plugin Android Tauri v2) untuk menjembatani Rust ↔ Android Kotlin SDK.

### 2A. SAF Bridge (`SafVaultStorage` + Local Snapshot)
**API Kotlin Plugin (`NitireksoAndroidPlugin.kt`):**
1. `pickDirectoryTree() -> { uri: String?, displayName: String? }`
   - Memicu `Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)` dengan flags `FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION | FLAG_GRANT_PERSISTABLE_URI_PERMISSION`.
   - Saat hasil diterima, panggil `contentResolver.takePersistableUriPermission(uri, READ | WRITE)`.
2. Operasi `VaultStorage` via `DocumentFile.fromTreeUri(context, treeUri)` & `ContentResolver`:
   - `safEnsureLayout(treeUri, deviceId)` — pastikan subfolder `ops/<device_id>` dan `media/` ada.
   - `safReadMeta(treeUri)` & `safWriteMeta(treeUri, bytesBase64)` — baca/tulis `vault.json` (tulis ke file sementara lalu rename/replace, aman terhadap Syncthing).
   - `safListRemoteOpFiles(treeUri, localDeviceId)` — iterasi `ops/<dev>/*.jsonl`, abaikan `.syncthing.*`, `~syncthing~*`, `*.tmp`, dan dotfile.
   - `safReadOpLines(treeUri, deviceId, fileName, fromLine)` — baca baris mulai indeks `fromLine` via `BufferedReader`.
   - `safAppendOpLines(treeUri, deviceId, dateStr, maxFileBytes, lines)` — cek ukuran file aktif `<YYYY-MM-DD>-<seq>.jsonl` (rotasi otomatis saat `>= 1 MB`), lalu append dengan mode `"wa"` (`contentResolver.openOutputStream(docUri, "wa")`).
   - `safHasMedia(treeUri, fileName)`, `safWriteMedia(treeUri, fileName, bytesBase64)`, `safReadMedia(treeUri, fileName)`.
3. Operasi **Local Snapshot** via SAF:
   - `safWriteSnapshotTree(treeUri, snapshotFolderName, manifestFiles)` — menyalin hasil staging SQLite Online Backup API + JSON portabel + `screenshots/` + `media/` dari `cache_dir` internal ke subfolder baru di dalam `treeUri`.
   - `safReadSnapshotTree(treeUri)` — menyalin balik arsip snapshot pilihan pengguna ke `cache_dir` internal agar fungsi `restore_backup_from_path` di Rust dapat memulihkannya tanpa duplikasi logika restore!

**Implementasi Rust (`src-tauri/src/vault/saf_storage.rs`, `#[cfg(target_os = "android")]`):**
- Struct `SafVaultStorage { app: AppHandle, tree_uri: String }` yang mengimplementasikan trait `VaultStorage` dengan memanggil command plugin Kotlin di atas secara sinkron/blocking-safe (hindari deadlock main thread).

### 2B. MediaMuxer, MediaStore, & Android Share Sheet
1. **`muxAudioVideoMp4(videoTempPath, audioTempPath?, outTempPath)`:**
   - Menggunakan `android.media.MediaExtractor` + `android.media.MediaMuxer` (bawaan API 18+, 0 MB tambahan).
   - Menggabungkan trek video H.264 dari `mp4-muxer` dengan trek audio AAC (looping sesuai durasi video jika audio lebih pendek, mirip perilaku `ffmpeg -stream_loop -1 -shortest`).
   - Di `src-tauri/src/video/mod.rs`: tambahkan cabang `#[cfg(target_os = "android")]` pada `remux_mp4_with_faststart` yang memanggil `MediaMuxer` bridge (bukan `Command::new("ffmpeg")`).
2. **`saveToMediaStore(sourceTempPath, fileName, mimeType, collection)`:**
   - Untuk gambar Share Card (`image/png`) → `MediaStore.Images.Media` (`Pictures/nitirekso`).
   - Untuk video Share Card (`video/mp4`) → `MediaStore.Video.Media` (`Movies/nitirekso`).
   - Untuk export CSV/JSON/Log → `MediaStore.Downloads` (`Downloads/nitirekso`).
   - Memakai `MediaStore` API Android 10+ (tidak butuh izin `WRITE_EXTERNAL_STORAGE`!).
3. **`shareFile(sourceTempPath, mimeType, title)`:**
   - Ekspos file sementara di `cacheDir/shared/` via `androidx.core.content.FileProvider` (`authority = "${applicationId}.fileprovider"`).
   - Luncurkan `Intent.createChooser(Intent(ACTION_SEND), title)` dengan `FLAG_GRANT_READ_URI_PERMISSION`.
   - Dipakai untuk tombol "Bagikan" pada Share Card, Export CSV/JSON, dan kirim file log dari halaman `ErrorLog`.

### 2C. Android Keystore & Hardening
1. **`wrapSecret(plaintextB64) -> ciphertextB64` & `unwrapSecret(ciphertextB64) -> plaintextB64`:**
   - Buat/ambil kunci AES-256-GCM non-ekstrak di `AndroidKeyStore` dengan alias `nitirekso_device_master_key` (`KeyGenParameterSpec`, `PURPOSE_ENCRYPT | PURPOSE_DECRYPT`, `BLOCK_MODE_GCM`, `ENCRYPTION_PADDING_NONE`).
   - `.device-secret` yang tersimpan di `<app_data_dir>/data/.device-secret.ks` hanya berupa ciphertext terbungkus `AndroidKeyStore`.
2. **Audit `AndroidManifest.xml`:**
   - `android:allowBackup="false"`
   - `android:usesCleartextTraffic="false"` (kecuali debug dev server bila perlu lewat `src/debug/AndroidManifest.xml`)
   - Hanya izin `android.permission.INTERNET` dan `android.permission.ACCESS_NETWORK_STATE`. Tidak ada `READ_MEDIA_IMAGES`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE`, maupun `REQUEST_INSTALL_PACKAGES`.

### Verifikasi Fase 2
- Build debug APK: `npx tauri android build --apk --debug --target aarch64` (atau `npx tauri android dev`).
- Tes di HP fisik via ADB:
  - Pilih folder Syncthing lewat SAF picker → buat trade → cek file `ops/<device_id>/YYYY-MM-DD-001.jsonl` & `vault.json` muncul di folder Syncthing.
  - Simpan gambar/video Share Card → muncul di Galeri + bisa dibagikan lewat Android Share Sheet.
  - Buat **Local Snapshot** ke folder SAF → uji restore.

---

## Fase 3 — Adaptasi Frontend React Responsive Mobile & Updater Android (`src/`)

**Tujuan:** Membuat seluruh antarmuka `nitirekso` nyaman dipakai satu tangan di layar HP (`360px–430px`) tanpa merusak pengalaman desktop (`1024px+`), mengikuti [DESIGN.md](../../DESIGN.md) dan aturan `antislop-ui` + `antislop-layoutmobile` + `antislop-human`.

### 3.1 Deteksi Platform & Safe Area
- Tambahkan utilitas `src/lib/platform.ts` (`isAndroid()`, `isMobilePlatform()`) berdasarkan deteksi Tauri/user-agent agar perilaku spesifik Android (tombol Share Sheet, banner APK update, label folder SAF) bersih dan mudah diuji di Vitest.
- Di `src/styles/globals.css`:
  - Tambahkan utility/padding safe-area (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) untuk status bar & gesture navigation bar Android.
  - Pastikan semua target sentuh interaktif mobile minimal `44×44px` (`min-h-11`).

### 3.2 Navigasi Mobile (`src/components/AppShell.tsx`)
- Desktop (`md:` / `>= 768px`): tetap sidebar kiri `w-56` seperti sekarang.
- Mobile (`< 768px`):
  - Sembunyikan sidebar kiri; tampilkan **Top Compact Header** (logo `nitirekso`, indikator status sync/update ringkas, tombol menu/overflow untuk `Error Logs` & `About`).
  - Tampilkan **Bottom Navigation Bar** tetap di bawah dengan 5 tab utama:
    1. `Dashboard`
    2. `Trade Log`
    3. `Journal`
    4. `Analytics`
    5. `Settings`
  - Tambahkan `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` pada area konten mobile agar konten terbawah tidak tertutup bottom nav.

### 3.3 Adaptasi Per Halaman & Komponen
1. **`TradeLog.tsx`:**
   - `< 768px`: tampilkan daftar transaksi sebagai **Card List** (simbol, arah LONG/SHORT, PnL dengan `PnlValue` tabular, tanggal, badge grade/tag) alih-alih tabel horizontal sempit. Filter bar dibuat kolapsibel / horizontal scroll rapi tanpa overflow.
2. **`TradeEditor.tsx` & `JournalEntry.tsx`:**
   - `< 768px`: tampil sebagai **full-screen sheet** dengan header sticky (tutup + simpan).
   - Input screenshot tetap memakai `<input type="file" accept="image/*">` (Android 10+ WebView otomatis membuka **Android Photo Picker** tanpa izin ekstra).
3. **`Dashboard.tsx` & `Analytics.tsx`:**
   - Grid `MetricCard` reflow mulus (`grid-cols-2` di mobile, `grid-cols-4` di desktop).
   - Pastikan container chart `lightweight-charts` memiliki `touch-action: pan-y` atau tinggi yang proporsional agar pengguna bisa scroll halaman vertikal tanpa terjebak di chart.
4. **`SharePnlModal.tsx` & `ShareAnalyticsModal.tsx`:**
   - `< 768px`: full-screen sheet; preview menyesuaikan lebar layar; tambahkan tombol **"Simpan ke Galeri"** (`MediaStore`) dan **"Bagikan"** (Android Share Sheet).
5. **`DeviceSyncPanel.tsx` & `BackupPanel.tsx`:**
   - Di Android, tampilkan nama folder SAF yang ramah dibaca (bukan mentah `content://com.android.externalstorage...` penuh jika panjang; potong rapi dengan tooltip/detail).
   - Tombol pilih folder memanggil SAF picker; tidak ada teks atau instruksi yang mengasumsikan desktop explorer.
6. **Foreground Device Sync Trigger (`src/App.tsx`):**
   - Selain `window.addEventListener('focus', ...)`, tambahkan `document.addEventListener('visibilitychange', ...)` (saat `document.visibilityState === 'visible'`) dengan throttle 5 detik agar **Device Sync** otomatis berjalan setiap kali pengguna kembali ke aplikasi Android.
7. **In-App Updater Android (`src/lib/update/updateService.ts` & `src/routes/About.tsx`):**
   - Pada Android, lewati `tauri-plugin-updater`; panggil `check_for_updates` (GitHub Releases API yang sudah ada di `app_utils/mod.rs`).
   - Jika ada versi lebih baru, tampilkan banner/pill pembaruan + tombol **"Unduh APK"** yang membuka URL aset `.apk` (atau halaman release) lewat `open_external_url` (`tauri-plugin-opener`).
   - Di `About.tsx`, cantumkan catatan singkat bahwa pengguna Android juga dapat melacak rilis otomatis melalui **Obtainium**.

### Verifikasi Fase 3
```bash
npm run typecheck
npm test
npm run build
```
- Jalankan **Delivery Gate `antislop`** (termasuk verifikasi responsivitas di viewport `375px`, `768px`, `1280px` dan kontras WCAG AA).

---

## Fase 4 — Signing Keystore, CI/CD `release.yml`, & Pembaruan Skill `release`

**Tujuan:** Mengotomatiskan build APK `arm64-v8a` tertandatangani di GitHub Actions setiap push tag `v*`, sekaligus memperbarui skill `release`.

### 4.1 Pembuatan Android Release Keystore Permanen (Dilakukan User / Dipandu Wizard)
1. Generate keystore satu kali:
   ```bash
   keytool -genkeypair -v \
     -keystore nitirekso-release.jks \
     -alias nitirekso \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Wajib simpan salinan offline aman** (`nitirekso-release.jks` + passwordnya) — jangan pernah commit ke git!
3. Konversi ke base64 (`base64 -w 0 nitirekso-release.jks`) dan pasang 4 GitHub Secrets di repo `KaleksananBarqi/nitirekso`:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

### 4.2 Konfigurasi Gradle Signing (`src-tauri/gen/android/app/build.gradle.kts`)
- Tambahkan `signingConfigs { create("release") { ... } }` yang membaca path keystore & kredensial dari environment variable (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) saat release build.
- Pastikan `versionCode` diturunkan secara deterministik dari SemVer (mis. `major * 10000 + minor * 100 + patch`, contoh `1.12.0` → `11200`) agar setiap rilis selalu memiliki `versionCode` lebih tinggi secara otomatis tanpa lupa bump manual.

### 4.3 Tambah Job `Build (Android)` di `.github/workflows/release.yml`
- Runner: `ubuntu-22.04` (atau `ubuntu-24.04`).
- Langkah utama:
  1. Checkout, Setup Node 22 (`npm ci --ignore-scripts`).
  2. Setup JDK 17 (`actions/setup-java@v4`, `temurin`).
  3. Setup Android SDK (`android-actions/setup-android@v3`) + pasang `ndk;27.x`, `platforms;android-35`, `build-tools;35.0.0`.
  4. Setup Rust stable dengan target `aarch64-linux-android`.
  5. Decode `ANDROID_KEYSTORE_BASE64` ke file sementara di runner.
  6. Jalankan `npx tauri android build --apk --target aarch64`.
  7. Salin APK tertandatangani dengan nama konsisten, mis. `nitirekso_<version>_arm64-v8a.apk`, ke `dist-artifacts/` agar otomatis ikut diunggah ke GitHub Release dan masuk `SHA256SUMS.txt` di job `publish`.
  8. Hapus file keystore sementara di langkah `if: always()`.

### 4.4 Pembaruan `.agents/skills/release/SKILL.md`
Perbarui skill `release` agar:
- Deskripsi & catatan rilis mencakup **4 platform** (Windows, macOS, Linux, dan **Android `arm64-v8a` APK**).
- Quality gate menambahkan verifikasi `cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-linux-android` (jika target terpasang) dan pemantauan job `Build (Android)` di GitHub Actions.
- Checklist verifikasi aset GitHub Release memastikan berkas `nitirekso_X.Y.Z_arm64-v8a.apk` terbit beserta entri checksum-nya di `SHA256SUMS.txt`.

---

## Fase 5 — Matriks Verifikasi End-to-End di HP Fisik (ADB + Syncthing-Fork)

Sebelum rilis v1 Android dinyatakan siap, verifikasi seluruh skenario berikut di HP Android fisik (Android 10+ `arm64-v8a`):

| # | Skenario Pengujian | Ekspektasi |
|---|---|---|
| 1 | Cold start & instalasi APK release tertandatangani | App terbuka mulus, SQLite **Local Cache** terbuat di `app_data_dir`, tidak ada crash WebView |
| 2 | Hubungkan **Sync Vault** via SAF ke folder Syncthing-Fork | Picker SAF muncul, izin bertahan setelah app ditutup paksa (*force stop*) & dibuka ulang |
| 3 | **Device Sync** 2 arah (Linux Desktop ↔ Android via Syncthing-Fork) | Trade baru, edit jurnal/checklist/tag, soft-delete, dan media screenshot sinkron bersih tanpa konflik |
| 4 | **Vault Passphrase** & sinkronisasi kredensial Exchange/AI | Input passphrase 1x di Android → API key 5 bursa & AI terdekripsi dan langsung aktif |
| 5 | **Exchange Sync** dari Android | Penarikan trade & saldo dari API bursa via `rustls-tls` sukses tanpa error SSL |
| 6 | Lampirkan screenshot jurnal | `<input type="file" accept="image/*">` membuka Android Photo Picker tanpa prompt izin storage, tersimpan ke `media/<sha256>.<ext>` |
| 7 | Share Card Gambar & Video MP4 (+ audio opsional) | Render sukses via `WebCodecs`/`mp4-muxer` + `MediaMuxer`, tersimpan ke Galeri (`MediaStore`) dan bisa dibagikan via Android Share Sheet |
| 8 | **Local Snapshot** (Backup & Restore) via SAF | Snapshot terbuat rapi di folder pilihan user; restore memulihkan seluruh trade, jurnal, dan media |
| 9 | Export CSV/JSON & Error Log | File tersimpan ke `Downloads/nitirekso` atau dibagikan via Share Sheet |
| 10 | UI Mobile Responsif (`360px–430px`) | Bottom Nav tidak tertutup gesture bar, nol horizontal overflow, semua tombol nyaman disentuh, chart bisa digulir |
| 11 | In-App Updater Check & Keamanan | Deteksi versi baru GitHub Releases membuka tautan APK; `adb shell dumpsys package com.nitirekso.app` mengonfirmasi `ALLOW_BACKUP` = false dan nol izin storage sensitif |

---

## Catatan Handoff untuk Agent Berikutnya

- Kerjakan **satu fase per sesi/PR** agar mudah diverifikasi dan tidak mencampur refactor Rust dengan UI mobile atau CI.
- Jika **Fase 0** (instalasi JDK 17 / Android SDK / NDK) memerlukan langkah sudo atau setup lingkungan di mesin pengguna, gunakan pendekatan bertahap yang jelas atau bantu pengguna menjalankan perintah setup dengan aman.
- Setelah setiap fase besar selesai, perbarui catatan progres di Obsidian (`Project Logs/`) sesuai aturan Second Brain.
