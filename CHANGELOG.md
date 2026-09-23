# Changelog

Semua perubahan penting pada proyek **Aplikasi Trading Journal Otomatis** dicatat di file ini.
Format mengikuti panduan [Keep a Changelog](https://keepachangelog.com/id/1.0.0/) dan menganut [Semantic Versioning](https://semver.org/lang/id/).

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
