# Changelog

Semua perubahan penting pada proyek **Aplikasi Trading Journal Otomatis** dicatat di file ini.
Format mengikuti panduan [Keep a Changelog](https://keepachangelog.com/id/1.0.0/) dan menganut [Semantic Versioning](https://semver.org/lang/id/).

## [1.7.3] - 2026-10-05

### 🐛 Perbaikan Bug & Optimasi Render Video
- **Eliminasi Kedipan Gelap / Flickering ("LAP-LAP") pada Ekspor Video MP4**:
  - Mengatasi kedipan gelap (frame tidak termuat/hitam) saat mengekspor kartu PnL dengan wallpaper video bergerak pada rasio 9:16 TikTok maupun rasio asli.
  - Menghapus pembatasan *premature timeout* 35ms yang memotong proses *decoding* video Chromium di tengah jalan, menggantinya dengan sinkronisasi deterministik event `seeked` resmi W3C beserta *safety timeout* proporsional (800ms).
  - Mengimplementasikan sistem pertahanan *Defensive Last-Frame Cache* (`lastValidBgCanvasRef`) pada kanvas kartu dan modul komposisi frame blur 9:16 (`share-frame.ts`), memastikan frame valid sebelumnya dipertahankan jika GPU menunda decoding sehingga tidak ada frame hitam yang terselip sama sekali.
  - Mempertahankan keutuhan penuh pipa ekspor audio latar belakang dan remuxing MP4 tanpa gangguan.

---

## [1.7.2] - 2026-10-05

### 🚀 Fitur Baru & Peningkatan Audio-Visual
- **Ekspor Audio Video Latar Belakang (Audio Muxing Pipeline)**:
  - Menyertakan trek audio dari wallpaper video kustom (MP4/WebM) ke dalam berkas MP4 hasil ekspor secara otomatis via FFmpeg remuxing di Node.js Main Process.
  - Membantu konten kreator dan trader mengekspor klip PnL lengkap dengan musik latar atau efek suara wallpaper tanpa bisu.
  - Perlindungan pemetaan trek audio opsional (`-map 1:a:0?`) sehingga video latar tanpa suara tetap terekspor secara mulus tanpa kegagalan.

### 🐛 Perbaikan Bug
- **Sinkronisasi Frame-Accurate Deterministik Audio & Visual**:
  - Mengatasi masalah *audio-visual desync* / *drift* di pertengahan hingga akhir video yang sebelumnya terjadi karena pemutaran video latar secara *wall-clock* (`vid.play()`) tidak sejalan dengan waktu virtual kanvas.
  - Menambahkan `FrameRenderContext` pada engine ekspor deterministik untuk mengontrol posisi video latar secara presisi per frame: `(i / fps) % vid.duration` dengan sinkronisasi event `seeked`.
- **Dekode Data URL Mandiri & Kelonggaran CSP**:
  - Mengimplementasikan `mediaUrlToBytes` yang mendekode payload base64 secara mandiri di memori tanpa bergantung pada network fetch Chromium yang sebelumnya diblokir oleh aturan ketat CSP `connect-src`.
  - Memperbarui direktif `connect-src` di `index.html` dengan menyertakan skema `data:` dan `blob:` untuk keandalan jangka panjang.
- **Penyelarasan Tipe IPC & Penanganan Safe-Access Array**:
  - Menyelaraskan kontrak antarmuka `remuxVideoMp4` di `ipc-contract.ts` dan `preload.ts` agar mendukung transmisi buffer audio sekunder opsional.
  - Menangani strict checking `noUncheckedIndexedAccess` pada TypedArray Float32 di modul ekspor video.

---

## [1.7.1] - 2026-10-05

### 🐛 Perbaikan Bug & Peningkatan Kompatibilitas Media Sosial
- **Lossless MP4 +faststart Remuxing (Solusi Video Terbaca 3 Detik di TikTok)**:
  - Mengatasi masalah video hasil ekspor yang dipotong menjadi 3 detik saat diunggah ke TikTok akibat struktur *Fragmented MP4 (fMP4)* bawaan Chromium `MediaRecorder` yang memiliki durasi header `0` dan fragmen awal berdurasi ~3.42 detik.
  - Mengintegrasikan modul background remuxer via IPC Node.js Main Process (`ffmpeg -c copy -movflags +faststart`) yang secara otomatis menyatukan fragmen fMP4 menjadi Standard Linear MP4 dengan atom `moov` utuh di awal berkas.
  - Proses berjalan instan (~50ms) secara *lossless* tanpa re-encode (kualitas dan frame rate 100% terjaga) sebelum berkas diunduh.
  - Menyertakan *defensive cleanup* berkas sementara dan *graceful fallback* jika sistem tidak memiliki enkoder eksternal.

---

## [1.7.0] - 2026-10-05

### 🚀 Fitur Baru
- **Format Frame Portrait 9:16 (Siap TikTok, Instagram Reels, & YouTube Shorts)**:
  - Opsi ekspor kartu PnL dalam kanvas portrait vertikal 1080×1920 yang dirancang khusus untuk platform media sosial tanpa terpotong (*anti-crop*).
  - Latar belakang blur adaptif dinamis dengan pilihan sumber: blur dari kartu PnL (`card-blur`), blur dari video/gambar wallpaper kustom (`wallpaper-blur`), atau warna solid minimalis (`solid`).
  - Safe-zone cerdas untuk antarmuka TikTok (Top HUD profil & Bottom HUD deskripsi/audio) memastikan teks metrik trade tetap terbaca jelas di tengah layar.
- **Generator Caption Otomatis (Caption Maker) Ramah SEO Media Sosial**:
  - Panel pembuatan caption otomatis langsung di modal Share PnL berbasis data riil transaksi (Simbol, Posisi Long/Short, PnL, ROI, R-Multiple, Durasi Holding, Setup, Rating Eksekusi, dan Emosi).
  - Pembedaan narasi cerdas antara skenario Menang (fokus pada disiplin eksekusi, RR, dan edukasi) dan Kalah (evaluasi objektif, pengendalian risiko, dan refleksi psikologis).
  - Dilengkapi rekomendasi tagar SEO relevan (#tradingjournal, #kripto, #cryptoindonesia, dll) dan tombol salin caption ke clipboard sekali klik.
- **Pengaturan Latar Belakang & Dimming Inline di Modal Share PnL**:
  - Kontrol intensitas peredupan wallpaper (*dimming* 0–95%) dan arah gradien pencahayaan (*Top-Right*, *Uniform*, *Bottom-Left*, dll) langsung dari modal Share PnL tanpa perlu navigasi ke halaman Settings.
  - Kemudahan mengganti atau menghapus wallpaper kustom secara instan langsung dari bilah kontrol modal.
- **Opsi Durasi Fleksibel untuk Ekspor Video**:
  - Pilihan durasi perekaman video: 15 Detik, 30 Detik, 60 Detik, serta opsi pintar **Sesuai Durasi Sumber** yang otomatis menyesuaikan panjang rekaman dengan durasi video wallpaper (misal 63 detik) hingga 5 menit.

### 🐛 Perbaikan Bug & Peningkatan Kualitas
- **Dual-Clock Rendering Engine (Solusi Video Freeze Detik 14/15)**:
  - Mengatasi masalah video hasil ekspor membeku di detik ke-14/15 akibat *background throttling* agresif oleh Chromium/Electron saat jendela kehilangan fokus.
  - Mengimplementasikan Dual-Clock Engine yang menggabungkan `requestAnimationFrame` dengan fallback timer presisi tinggi `setTimeout`, menjamin perekaman kanvas video tetap berjalan mulus meskipun jendela aplikasi diminimalkan.
  - Pemanggilan deterministik `videoTrack.requestFrame()` pada setiap frame yang digambar untuk mencegah *clock desync* antara trek audio dan video.
  - Peningkatan interval timeslice `MediaRecorder` ke 1000ms dan pembatasan frekuensi pelaporan progress UI (200ms *throttle*) guna mengurangi beban komputasi *main thread* secara drastis.
- **Continuous Background Video Playback Guard**:
  - Penjaga otomatis yang memastikan video latar belakang tetap diputar tanpa jeda selama proses perekaman kanvas berlangsung.

---

## [1.6.0] - 2026-10-01

### 🚀 Fitur Baru
- **Analytics VS ROI BTC (Alpha Benchmark)**:
  - Bandingkan performa return portofolio trading Anda langsung terhadap strategi *Buy & Hold* Bitcoin (BTC) pada rentang waktu trading yang sama secara objektif (*apple-to-apple*).
  - Penarikan data kline historis harian BTCUSDT otomatis via IPC Node.js Main Process dengan ketahanan failover 4 tingkat (Binance Spot &rarr; Binance Vision &rarr; Kraken &rarr; CoinGecko) yang kebal terhadap pembatasan CSP Chromium dan blokir ISP.
  - Grafik garis ganda *Equity Curve* terformat persentase (Portfolio % vs BTC %) dengan indikator status performa dinamis (*Outperformed BTC* / *Alpha Positif*).
- **Video Wallpaper & Ekspor Video HQ (MP4 / WebM)**:
  - Dukungan latar belakang wallpaper animasi video kustom (MP4 / WebM hingga 25MB) pada kartu Share PnL dengan pemutaran otomatis (*looping*).
  - Perekaman animasi kartu secara mulus langsung dari HTML5 Canvas menggunakan MediaRecorder API ke berkas video resolusi tinggi TrueColor tanpa *color banding* untuk postingan media sosial.
- **Ekspor GIF Animasi Offline (Pure TypeScript GIF89a)**:
  - Fitur ekspor kartu Share PnL berlatar video menjadi GIF animasi mandiri secara offline dengan kompresi LZW murni tanpa dependensi library C++ atau native node-gyp.
- **Background Dimming Gradient Terarah**:
  - Kontrol kepekatan dan arah gradien pencahayaan kartu Share PnL (Top-Right ala bursa kripto tier-1, Top-Bottom, Left-Right, Radial Glow, dan Flat Dimming) dengan pratinjau instan di Settings dan Modal Ekspor.
- **Kustomisasi Tema Warna Penuh & Template Kartu**:
  - Kebebasan penuh merancang, memberi nama, dan menyimpan skema warna aplikasi (aksen utama, profit hijau, loss merah, latar belakang, dan permukaan kartu) yang diinjeksi seketika ke variabel CSS root tanpa *reload*.
  - Generator skema warna kartu Share PnL mandiri dengan color picker interaktif untuk gradien background awal/akhir, warna aksen, dan border kartu.
- **Dukungan Input Desimal Natural Rencana Risiko**:
  - Peningkatan kontrol `NumberInput` di formulir rencana risiko trade agar menerima angka berkoma atau bertitik (misal `14.05` atau `0.5%`) secara responsif tanpa menghapus posisi kursor.

### 🐛 Perbaikan Bug & Peningkatan Kualitas
- **Bypass CSP IPC Outbound**:
  - Mengalihkan pengambilan harga benchmark BTC dari Renderer Process ke Node.js Main Process via channel IPC `btc:klines` untuk mengatasi error koneksi akibat Content Security Policy ketat.
- **Pratinjau Responsif Kartu di Settings**:
  - Memperbaiki tata letak kartu pratinjau di halaman Settings agar tidak terpotong vertikal/horizontal pada layar resolusi standar.
- **Pembersihan & Idempotensi Tipe Media Storage**:
  - Memperbaiki penanganan resolusi tipe media saat menyimpan wallpaper kustom ke `localStorage` untuk mencegah error tipe data `undefined`.

---

## [1.5.3] - 2026-09-25

### 🚀 Fitur Baru
- **Metrik Kuantitatif & Manajemen Risiko Profesional**:
  - Menghadirkan kalkulasi murni metrik risiko kuantitatif: **Total R** (akumulasi kelipatan risiko), **Expectancy R** (nilai harapan matematis per trade dalam satuan R), **Recovery Factor** (rasio pemulihan laba bersih terhadap *Max Drawdown* nominal), serta **Max Consecutive Streak** (rekor kemenangan dan kekalahan beruntun).
  - Integrasi panel grid metrik kuantitatif di **Dashboard** (sejajar di bawah drawdown) dan **Analytics** (tersinkronisasi secara dinamis dengan filter rentang waktu dan exchange).
- **Studio Share Analytics dengan Bento Grid 8-Slot**:
  - Pembaruan tata letak kartu analitik pamer performa dengan arsitektur **8-Bento Grid** modern yang rapi dan padat informasi: Win Rate, Total PnL, Profit Factor, Total Trades, Total R, Recovery Factor, Max Streak, dan Expectancy R.
  - Kompatibel dengan semua preset rasio (16:9 Landscape, 1:1 Square, 4:5 Feed).

### 🐛 Perbaikan Bug & Peningkatan Kualitas Visual
- **Penyelarasan Presisi Canvas 2x Retina & Pratinjau DOM**:
  - Memperbaiki proporsi grafik kurva ekuitas (ditingkatkan menjadi 320px pada rasio 4:5 vertikal) untuk menghilangkan celah kosong (*empty gap*) di bawah kartu.
  - Menjamin hasil gambar ekspor PNG dan salin ke clipboard memiliki tata letak yang 100% identik dan kembar dengan pratinjau antarmuka (*What You See Is What You Get*).
- **Pembersihan Residu Exchange pada Modal Share Analytics**:
  - Menghapus kontrol pemilih exchange yang tidak relevan pada modal analitik portofolio umum, mencegah munculnya placeholder logo exchange yang membingungkan.
- **Hardening Privasi Finansial**:
  - Penyamaran nominal PnL (*privacy mode*) kini diterapkan secara konsisten pada seluruh slot kartu performa saat opsi sensor aktif.

---

## [1.5.2] - 2026-09-23

### 🐛 Perbaikan Bug & Peningkatan Stabilitas
- **Ketahanan Runner Migrasi SQLite (Idempotent & Self-Healing)**:
  - Memperbaiki eksekusi migrasi skema database agar secara otomatis mendeteksi dan mengabaikan error `duplicate column name` saat menambahkan kolom baru (`raw_payload`, `positions_synced`, `fills_synced`, `funding_synced`).
  - Mencegah *silent crash* dan kegagalan startup pada pengguna Windows yang memperbarui dari versi sebelumnya.
- **Startup Error Guard & Native OS Dialog**:
  - Menambahkan penanganan error fatal saat pembukaan aplikasi menggunakan dialog native OS (`dialog.showErrorBox`).
  - Menghilangkan fenomena *silent ghost crash* di Windows dengan menampilkan pesan diagnostik yang jelas, jaminan integritas data pengguna, dan lokasi berkas log jika inisialisasi lingkungan bermasalah.
- **Resolusi Path Log Dini**:
  - Menata urutan inisialisasi identitas aplikasi (`app.setName('nitirekso')`) di Main Process sebelum pemanggilan modul logging dini.
  - Memastikan seluruh log startup langsung mengarah ke `%APPDATA%\nitirekso\logs\app.log` dengan aman tanpa menunggu event `app.isReady()`.

---

## [1.5.1] - 2026-09-23

### 🐛 Perbaikan Bug & Peningkatan Stabilitas
- **Pemulihan Kolom Skema Sinkronisasi (Migrasi Database 006)**:
  - Mengembalikan kolom yang sempat terlewat pasca migrasi exchange baru: `trades.raw_payload`, `sync_state.positions_synced`, `sync_state.fills_synced`, dan `sync_state.funding_synced`.
  - Mencegah *silent error* dan *rollback* SQLite saat proses sinkronisasi menyimpan status riwayat trade.
- **Normalisasi Mapping & Penentuan Harga Bitunix Futures**:
  - Memperbaiki parsing arah posisi (`side`) Bitunix agar mendukung nilai `BUY`/`SELL` di samping `LONG`/`SHORT`.
  - Memperbaiki pemetaan harga eksekusi fill untuk order bertipe `MARKET` (mengambil `avgPrice` sebelum `price`) sehingga harga entry/exit dan perhitungan PnL akurat serta tidak bernilai 0.
- **Peningkatan Observabilitas & Logging Sinkronisasi**:
  - Menambahkan logging diagnostik komprehensif pada level IPC dan engine sinkronisasi per-exchange.
  - Membungkus pembaruan `sync_state` dalam blok penanganan error khusus agar kegagalan parsial tetap melaporkan alasan error secara transparan ke user interface dan log file.

---

## [1.5.0] - 2026-09-23

### 🚀 Fitur Baru
- **Dukungan 3 Exchange Baru (Bybit, Binance, BingX)**:
  - Integrasi adapter read-only CCXT untuk **Bybit** (Linear Futures V5), **Binance** (USDT-M Futures), dan **BingX** (Swap Perpetual).
  - Penarikan riwayat posisi tertutup, trade fills, realized PnL bersih, biaya transaksi, funding rate/fee, dan saldo margin futures secara otomatis.
  - Migrasi skema database SQLite (`005_add_exchanges.sql`) yang memperluas batasan exchange pada tabel `trades` dan `sync_state`.
  - Panduan interaktif dan form kredensial aman di halaman Settings untuk kelima exchange dengan jaminan izin *read-only*.
- **Aset Logo Bawaan Exchange & Pengaturan Kode Referral**:
  - Pustaka logo resmi exchange bawaan (`MEXC`, `Bitunix`, `Bybit`, `Binance`, `BingX`) kini terintegrasi langsung di aplikasi tanpa perlu unggah manual.
  - Form pengaturan referral per-exchange yang intuitif di menu Settings: pengguna cukup mengisi kode referral exchange masing-masing.
  - Logo resmi exchange dan badge kode referral otomatis terpampang di kartu visual Share PnL sesuai exchange asal trade.
- **Watermark Logo nitirekso di Share PnL**:
  - Rendering ikon logo resmi nitirekso di pojok kanan bawah kartu Share PnL, berdampingan dengan tipografi *"nitirekso Trading Journal"*, baik pada pratinjau DOM maupun ekspor Canvas resolusi tinggi Retina 2x.
- **Unifikasi Sinkronisasi Trade & Saldo (Unified Sync UX)**:
  - Menyatukan alur sinkronisasi data transaksi dan saldo exchange menjadi satu aksi terpadu (`window.api.runSync()`), menghilangkan kebingungan pemisahan UI/UX "Sync Now" dan "Sinkron Saldo".
  - Tombol pada widget saldo diubah menjadi *"↻ Sinkron Sekarang"*, memicu pembaruan menyeluruh untuk trade dan saldo akun sekaligus.
  - Sistem *event bus* global (`app:sync-complete`) memastikan widget saldo dan daftar trade selalu ter-refresh bersamaan dari tombol mana pun yang diklik (sidebar, dashboard, atau settings).
  - Chip rincian saldo akun kini merender dinamis seluruh exchange yang terkonfigurasi lengkap dengan logo dan ketersediaan margin.

### 🐛 Perbaikan Bug
- **Interaksi Pemilihan Tag Emosi di Trade Editor**:
  - Memperbaiki bug form reset yang menyebabkan badge emosi terkunci setelah dipilih.
  - Pilihan tag emosi kini bersifat toggle (klik ulang untuk membatalkan) dan disediakan tombol pembersih tag emosi.

---

## [1.4.0] - 2026-09-22

### 🚀 Fitur Baru
- **Menu & Halaman About Komprehensif**:
  - Identitas aplikasi dan nomor versi dinamis melalui IPC `getAppVersion`.
  - Pemeriksa pembaruan otomatis via IPC `checkForUpdates` langsung ke GitHub Releases API dengan pratinjau changelog rilis terbaru.
  - Tautan langsung ke repositori GitHub proyek.
  - Kartu donasi kopi via Saweria (`https://saweria.co/arthex1204`) dengan QR visual dan tombol buka di browser eksternal.
  - Tombol cepat donasi *"☕ Beliin Aku Kopi"* di footer navigasi sidebar `AppShell`.
  - Jaminan privasi 100% lokal (*zero telemetry, zero tracking*).
  - Pintasan keyboard global `Ctrl+1` s.d. `Ctrl+6` untuk navigasi cepat antar halaman.
- **Preset Periode Cepat di Halaman Analytics**:
  - Filter rentang waktu instan: Hari Ini, 7 Hari Terakhir, 30 Hari Terakhir, Bulan Ini, Bulan Lalu, dan Semua Periode.
  - Tampilan ringkasan statistik dan badge tanggal aktif yang dinamis.
  - Label periode otomatis terintegrasi dan dikirim ke kartu ekspor Share Analytics.
- **Modernisasi Share Analytics (Paritas Penuh dengan Share PnL)**:
  - 6 Preset tema visual bawaan (*Default Pro, Neon Cyber, Minimal Light, Sunset Orange, Obsidian Gold, Pastel Mint*).
  - Fitur simpan kombinasi kustom sebagai template pribadi dan hapus template.
  - Galeri gambar latar (*wallpaper*) multi-background serta dukungan unggah gambar lokal.
  - Pengalih rasio aspek fleksibel: 16:9 (Landscape), 1:1 (Square), dan 4:5 (Feed/Story).
  - Slot input kutipan / catatan evaluasi trader.
  - Render canvas resolusi tinggi Retina 2x untuk hasil ekspor tajam tanpa blur.
  - Integrasi salin clipboard, simpan PNG, dan bagikan langsung ke X (Twitter).

### 🐛 Perbaikan Bug & Peningkatan UX
- **Perbaikan Berbagi ke X (Twitter)**:
  - Memperbaiki kegagalan pembukaan URL Twitter pada modal Share PnL dan Share Analytics akibat pembatasan sandbox Electron. Menggunakan IPC handler `openExternalUrl` berbasis `shell.openExternal` dengan validasi aman skema URL.
- **Kejelasan UI/UX Indikator Skema Warna vs Wallpaper**:
  - Tombol skema warna kini tetap menampilkan *ring highlight* aktif dan badge `(Aksen)` / `✓` meskipun wallpaper latar sedang menyala.
  - Menambahkan tombol **"Warna Tema Polos"** untuk mempermudah mengembalikan latar ke gradien tema asli.
  - Menambahkan tip panduan kontekstual di studio kustomisasi.
- **Instalasi & Eksekusi Tanpa Run as Administrator**:
  - Mengubah konfigurasi NSIS pada `electron-builder.yml` (`perMachine: false`, `allowElevation: false`, `requestedExecutionLevel: asInvoker`) sehingga installer dan aplikasi berjalan normal pada ruang pengguna (`%LOCALAPPDATA%\Programs`) tanpa perlu meminta hak akses Administrator / UAC prompt saat dibuka pertama kali.

---

## [1.3.0] - 2026-09-20

### 🚀 Rebranding Menyeluruh & Ekosistem nitirekso
- **Identitas Baru nitirekso (ꦤꦶꦠꦶꦫꦼꦏ꧀ꦱ)**:
  - *"Niti Transaksi, Rekso Evaluasi"* — pembaruan filosofi nama, logo resmi, dan aset ikon aplikasi desktop (`build/icon.ico` & `build/icon.png`).
  - Pembaruan remote URL dan referensi repositori ke `KaleksananBarqi/nitirekso`.

### 🖼️ Showcase Galeri Interaktif & Tangkapan Layar
- **Section Showcase Interaktif di Landing Page**:
  - Penambahan galeri showcase `#showcase` di `docs/index.html` dengan tab switcher instan (Trade Log, Jurnal & SOP, Kartu PnL Flex, Studio Kustomisasi).
  - Tampilan mockup frame jendela desktop gelap dengan lampu kontrol macOS dan info bar fitur interaktif.
- **Tangkapan Layar Resolusi Tinggi di README**:
  - Tabel preview 2x2 komprehensif menampilkan fungsionalitas Trade Log, Jurnal Evaluasi, Kartu Pamer PnL Flex, dan Studio Kustomisasi.
- **Perbaikan Git Tracking Aset Dokumentasi**:
  - Whitelist folder `docs/assets/screenshots/` di `.gitignore` dan normalisasi berkas screenshot ke nama kebab-case.

### ⚙️ Automasi CI/CD & Rilis Multi-Platform (Windows, macOS, Linux)
- **Workflow Rilis Matriks Otomatis (`.github/workflows/release.yml`)**:
  - Trigger otomatis saat push tag versi (`v*`) dan trigger manual (`workflow_dispatch`).
  - Quality Gate: verifikasi typecheck TypeScript otomatis sebelum build di setiap runner.
  - **Dukungan Tiga Platform Utama**:
    - **Windows**: Installer mandiri NSIS (`nitirekso-Setup-<version>.exe`) di runner `windows-latest`.
    - **macOS**: Paket DMG dan ZIP (`nitirekso-<version>-mac-arm64.dmg`, `nitirekso-<version>-mac-x64.dmg`, `.zip`) untuk Apple Silicon (M1/M2/M3/M4) dan Intel di runner `macos-latest`.
    - **Linux**: Paket AppImage portabel dan berkas instalasi Debian/Ubuntu (`nitirekso-<version>-linux-x64.AppImage`, `nitirekso-<version>-linux-x64.deb`) di runner `ubuntu-latest`.
  - Ekstraksi catatan rilis otomatis dari `CHANGELOG.md` menggunakan skrip `scripts/extract-release-notes.cjs`.
  - Agregasi seluruh binary installer dan publikasi rilis idempotent dengan flag `--clobber`.

---

## [1.2.1] - 2026-09-20

### 🚀 Fitur Baru & Peningkatan Branding Share PnL
- **Kustomisasi Logo Exchange & Kode Referral per Exchange**:
  - Dukungan unggah logo kustom (PNG transparan disarankan, JPG, SVG, WebP) terpisah untuk masing-masing exchange (**MEXC** & **Bitunix**).
  - Slot input kode referral khusus untuk MEXC dan Bitunix di menu Settings.
  - Tampilan badge `Ref: [KODE]` beraksen biru langit (`#38bdf8`) presisi di bawah logo exchange pada kartu pamer PnL, baik di HTML live preview maupun Canvas export HQ (1080px).
  - Kalkulasi tinggi header Canvas dinamis (`headerH`) otomatis menyesuaikan saat kode referral aktif untuk memastikan tidak ada tabrakan layout dengan teks Symbol / Direction.
- **Kustomisasi Judul Brand Utama & Sub-label Badge**:
  - Pengguna bebas mengatur teks brand utama (default: `"SHARENYA"`) dan sub-label badge (default: `"JOURNAL"`) langsung dari Pengaturan.
  - Pengukuran lebar teks dinamis (`ctx.measureText`) pada Canvas menjamin badge sub-label bergeser secara rapi dan proporsional mengikuti panjang judul brand.
- **Penyederhanaan Pilihan Exchange (Fokus MEXC & Bitunix)**:
  - Opsi exchange dikunci secara ketat hanya untuk MEXC dan Bitunix sesuai kapabilitas sinkronisasi saat ini.
- **Kustomisasi Avatar, Wallpaper Transparan/Kustom & Teks Adaptif**:
  - Pengaturan avatar trader dan handle tersimpan terpusat di Settings.
  - Fitur unggah custom image background dengan slider peredupan (*dimming overlay* 0-100%).
  - Pilihan tema estetik termasuk *Glass Transparan* beraksen neon cyan/pink.
  - Opsi adaptif untuk menampilkan teks tesis dan review secara penuh tanpa terpotong (Auto-Flow Y Canvas).

---

## [1.2.0] - 2026-09-19

### 🚀 Fitur Baru
- **Sinkronisasi Saldo Real-Time dari Exchange**:
  - Dukungan penarikan saldo akun futures dari **MEXC** (via CCXT swap balance) dan **Bitunix** (via REST `/api/v1/futures/account`).
  - Skema database baru (Migrasi `004_account_balances.sql`) dan repository balance untuk menyimpan total ekuitas, free margin, used margin, dan unrealized PnL secara lokal.
  - Widget interaktif `AccountBalanceWidget` di Dashboard dengan status pembaruan real-time, chip rincian per exchange, dan tombol refresh instan.
- **Generator Kartu Pamer PnL + Tesis Tiap Trade (`SharePnlModal`)**:
  - Generator kartu visual performa beresolusi tinggi (Retina 2x) berbasis HTML5 Canvas native.
  - 5 Tema visual estetik: *Cyberpunk Neon*, *Obsidian Gold*, *Emerald Mint*, *Sunset Synth*, dan *Minimal Dark*.
  - 3 Format rasio: `1:1` (Square untuk IG/Telegram feed), `9:16` (Story/TikTok/Reels), dan `16:9` (Twitter/X landscape).
  - Tesis pre-trade & review post-trade terintegrasi dengan live text editor sebelum diekspor.
  - Pilihan logo exchange kustom: MEXC, Bitunix, Binance, Bybit, atau tanpa logo.
  - Aksi 1-klik: **Salin Gambar ke Clipboard** (langsung bisa Ctrl+V di chat/medsos) dan **Unduh PNG**.
  - Tombol **✨ Pamer** terintegrasi di Trade Log, Journal Entry, dan card Trade Terakhir di Dashboard.
- **Generator Kartu Pamer Full Analytics (`ShareAnalyticsModal`)**:
  - Kartu laporan performa komprehensif: Net PnL, Win Rate %, Visual Win/Loss Bar, Profit Factor, Expectancy, Total Trades, dan Max Drawdown.
  - Mini Kurva Equity Glowing neon dengan efek gradient visual.
  - **Mode Privasi**: Toggle untuk menyembunyikan nominal uang ($) sehingga user bisa pamer winrate dan rasio tanpa mengungkap besaran modal.
  - Tombol pintas **📊 Pamer Analytics** di header Dashboard dan Analytics.
- **Penyederhanaan Backup Google Drive (Dual-Mode)**:
  - **Mode 1 (Folder Lokal Google Drive — Rekomendasi/1-Klik)**: Cukup pilih folder Google Drive lokal (misal `G:\My Drive\TradingBackup`). Backup otomatis disalin dan disinkronkan oleh Google Drive for Desktop **tanpa perlu API key / GCP project sama sekali**.
  - **Mode 2 (Cloud OAuth Direct)**: Form input Google OAuth Client ID terintegrasi langsung di UI Settings tanpa perlu edit file `.env` atau restart app.

### 🛡️ Peningkatan & Perbaikan
- Penambahan komponen `Modal` reusable di `src/components/ui.tsx`.
- Pengujian otomatis menyeluruh: 267 dari 267 tes lulus 100% (`verify:fase1`, `verify:fase2`, `verify:fase3`, `verify:metrics`).
- Typecheck TypeScript bersih 0 error.

---

## [1.1.0] - 2026-09-19

### 🚀 Fitur Baru
- Lampirkan screenshot gambar pada catatan jurnal trade.
- Perhitungan rasio Risk:Reward (RR) Rencana otomatis dari Stop Loss dan Take Profit.
- Sistem kustom tagging multi-nilai dengan autocomplete dan chip tag.
- Ekspor jurnal ke format CSV (UTF-8 BOM), JSON, dan PDF.
- Backup Google Drive satu arah via OAuth 2.0 PKCE.
- Panel Wawasan AI berbasis OpenAI-compatible completions API untuk evaluasi psikologi dan kelemahan eksekusi.

---

## [1.0.3] - 2026-09-18
- Rilis baseline awal Trading Journal Otomatis (MEXC + Bitunix).
- Verifikasi 5 fase arsitektur dasar dan packaging installer desktop Windows NSIS.
