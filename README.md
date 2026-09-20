# nitirekso (ꦤꦶꦠꦶꦫꦼꦏ꧀ꦱ) — Aplikasi Trading Journal Otomatis & Analitik Kripto Futures

[![Website](https://img.shields.io/badge/Website-Landing%20Page-9333ea?style=flat-square)](https://kaleksananbarqi.github.io/nitirekso/)
[![Platform](https://img.shields.io/badge/Platform-Electron%20%7C%20Windows%20Desktop-7928ca?style=flat-square)](https://github.com/KaleksananBarqi/nitirekso)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Tailwind%20v4-blue?style=flat-square)](https://react.dev/)
[![Database](https://img.shields.io/badge/Database-SQLite%20(Local%20WAL)-10b981?style=flat-square)](https://sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b.svg?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/Verifikasi-349%2F349%20Passed-emerald?style=flat-square)](plans/SESSION.md)

> **"Niti Transaksi, Rekso Evaluasi"**
> 
> *Aplikasi Trading Journal Otomatis, Offline-First, dan 100% Privat untuk Evaluasi Disiplin Trading Kripto Futures (MEXC & Bitunix).*

---

## 📖 Filosofi Nama: nitirekso

Nama **nitirekso** berakar dari kearifan bahasa Jawa:
* **Niti (ꦤꦶꦠꦶ)**: Memiliki arti *menulis, mencatat, memeriksa, dan meneliti secara saksama*. Dalam trading, tidak ada perbaikan tanpa pencatatan data yang jujur dan presisi atas setiap eksekusi.
* **Rekso (ꦫꦼꦏ꧀ꦱ)**: Memiliki arti *menjaga, merawat, dan memelihara*. Dalam trading, menjaga modal (*capital preservation*) dan merawat kedisiplinan mental adalah kunci bertahan dalam jangka panjang.

**nitirekso** hadir untuk membantu trader mencatat histori transaksi tanpa repot mengetik ulang (*read-only sync*), mengevaluasi kualitas eksekusi secara objektif, serta merawat psikologi dari bahaya *revenge trading* dan FOMO di semua kondisi market.

---

## 🖼️ Tangkapan Layar (Preview Aplikasi)

> *Tangkapan layar resolusi tinggi dapat diletakkan di folder `docs/assets/screenshots/`.*

| Dashboard & Saldo Real-Time | Trade Log & Filter Mendalam |
|:---:|:---:|
| ![Dashboard nitirekso](docs/assets/screenshots/dashboard.png) | ![Trade Log nitirekso](docs/assets/screenshots/trade-log.png) |

| Analitik Kinerja & Kalender Heatmap | Jurnal Manual & Catatan Emosi |
|:---:|:---:|
| ![Analytics nitirekso](docs/assets/screenshots/analytics.png) | ![Journal Entry nitirekso](docs/assets/screenshots/journal-entry.png) |

---

## 🚀 Mengapa Memilih nitirekso? (Keunggulan Utama)

1. **100% Privat & Offline-First (Local Database)**  
   Data jurnal finansial dan trading Anda tersimpan di mesin lokal dalam database SQLite terenkripsi. Tidak ada database server pihak ketiga, tidak ada cloud telemetry, dan tidak ada pelacak analytics yang membaca portofolio Anda.
2. **Koneksi API Read-Only Tanpa Risiko**  
   Hanya memerlukan izin baca (*read-only*). Aplikasi tidak memiliki kapabilitas mengeksekusi order, membatalkan order, ataupun melakukan penarikan dana (*withdrawal*). Kredensial diamankan menggunakan `safeStorage` bawaan sistem operasi (Windows DPAPI).
3. **Eksekusi vs Hasil (Execution Grade A/B/C/D)**  
   nitirekso memisahkan *grade eksekusi* dari *profit/loss*. Eksekusi sesuai rencana trading bisa saja berakhir rugi (*good loss*); sebaliknya, melanggar aturan bisa saja menghasilkan cuan beruntung (*bad win*). nitirekso melatih Anda mengevaluasi proses, bukan sekadar hasil.
4. **Generator Kartu Pamer PnL Estetik (Canvas Native)**  
   Buat kartu pamer performa berkualitas tinggi (Retina 2x) dalam 5 pilihan tema visual (*Cyberpunk Neon, Obsidian Gold, Emerald Mint, Sunset Synth, Minimal Dark*) dan 3 aspek rasio (`1:1`, `9:16`, `16:9`) untuk media sosial.
5. **Wawasan Pola Trading Berbasis AI**  
   Integrasi opsional dengan model AI (kompatibel OpenAI Chat Completions) untuk mendeteksi kelemahan psikologis, kebocoran modal, dan saran perbaikan dari catatan jurnal Anda.

---

## 📊 Rangkuman Fitur Lengkap

### 1. Sinkronisasi Otomatis & Saldo Akun (MEXC & Bitunix)
- **MEXC Futures**: Penarikan posisi tertutup, histori fills, funding fee, dan saldo ekuitas akun real-time via CCXT certified engine.
- **Bitunix Futures**: Integrasi REST resmi untuk posisi tertutup, order historis, dan saldo margin futures.
- **Idempotent Engine**: Sinkronisasi berulang aman 100%, tidak menciptakan entri duplikat.
- **Widget Saldo Live**: Menampilkan Total Equity, Free Margin, Floating PnL, dan rincian saldo per exchange langsung di Dashboard.

### 2. Jurnal Transaksi & Evaluasi Psikologi
- Catatan tesis pre-trade dan review post-trade.
- Sistem tagging fleksibel multi-nilai (misal: `#Breakout`, `#FOMO`, `#NewsTrade`).
- Pelacak emosi trader sebelum dan sesudah eksekusi.
- Checklist disiplin SOP trading.
- Lampiran screenshot chart (disimpan secara lokal dan aman dari path traversal).
- Perhitungan otomatis Risk-to-Reward Rencana (`plannedRr`) dari Entry, Stop Loss, dan Take Profit.

### 3. Analitik Trading & Visualisasi Data
- **Equity & Drawdown Curve**: Memakai `lightweight-charts` v5 yang responsif dan interaktif.
- **Heatmap Kalender PnL**: Mengetahui hari paling menguntungkan dan hari rawan rugi.
- **Metrik Utama Finansial**: Net PnL, Win Rate %, Profit Factor, Expectancy, Average Win/Loss Ratio.
- **Histogram Distribusi R-Multiple**: Memetakan rasio risiko-imbalan aktual dari setiap trade yang ditutup.
- **Filter Global Lintas Halaman**: Filter berdasarkan exchange, simbol koin, setup tag, tanggal, dan rentang PnL.

### 4. Ekspor & Backup Mandiri
- **Ekspor Jurnal**: Format **CSV** (UTF-8 BOM siap Excel), **JSON**, dan cetak dokumen **PDF** beresolusi tinggi via offscreen Chromium renderer.
- **Backup Google Drive Dual-Mode**:
  - *Mode 1 (Folder Lokal)*: 1-Klik sinkron ke folder Google Drive desktop tanpa ribet setup API.
  - *Mode 2 (OAuth PKCE Direct)*: Sinkronisasi cadangan langsung ke cloud via OAuth aman.

---

## 🛠️ Panduan Menjalankan & Pengembangan

### Prasyarat
- Node.js versi 18+ (LTS disarankan)
- NPM versi 9+

> **Bebas Kompilasi C++:** Proyek ini **tidak membutuhkan Visual Studio C++ Build Tools**. Modul `better-sqlite3@13` menggunakan prebuilt **N-API** binary yang kompatibel dengan Electron.

### Langkah Instalasi
```bash
# Clone repository
git clone https://github.com/KaleksananBarqi/nitirekso.git
cd nitirekso

# Pasang dependensi
npm install

# Buka aplikasi dalam mode development
npm run dev
```

### Membuat Installer Desktop (.exe)
```bash
# Menghasilkan installer mandiri di folder release/
npm run dist
```
Hasil installer berformat `release/nitirekso-Setup-<versi>.exe` yang dapat langsung dipasang tanpa perlu terminal, Docker, atau database server eksternal.

---

## 🧪 Rangkaian Uji & Verifikasi Otomatis

nitirekso dilengkapi **349 pengujian otomatis** untuk menjamin kestabilan mutlak data finansial:

```bash
npm run verify              # Rangkaian lengkap (Typecheck + Semua Fase)
npm run verify:fase1        # 45 checks — Database SQLite & isolasi jurnal manual
npm run verify:fase2        # 66 checks — Mapper MEXC & idempotensi sinkronisasi
npm run verify:fase3        # 63 checks — Request signing Bitunix & isolasi multi-exchange
npm run verify:metrics      # 93 checks — Kalkulasi metrik trading terverifikasi
npm run verify:packaged     # 31 checks — Integritas installer & native addons
npm run verify:acceptance   # 51 checks — Kriteria penerimaan acceptance criteria
```

---

## 🔒 Standar Keamanan & Privasi

- **Penyimpanan Kredensial**: Menggunakan modul `safeStorage` bawaan Electron yang memanfaatkan enkripsi tingkat OS (Windows DPAPI). Kredensial API tidak pernah disimpan dalam bentuk plaintext.
- **Alur Data Satu Arah**: Kredensial hanya mengalir dari Renderer ke Main Process. Tampilan UI tidak pernah dapat membaca kembali kunci API rahasia Anda.
- **Content Security Policy (CSP)**: `connect-src 'none'` pada renderer memastikan tidak ada skrip jahat yang dapat membocorkan data trading Anda ke internet.
- **Mode Sembunyikan PnL (Hide P&L)**: Satu klik tombol mata untuk menyembunyikan nominal dolar saat Anda ingin berbagi layar (*screen sharing*) atau merekam video.

---

## 📁 Struktur Direktori

```text
nitirekso/
├── build/                 # Resource icon aplikasi & installer (.ico, .png)
├── electron/              # Main Process Electron (Node.js runtime)
│   ├── ai/                # Integrasi OpenAI API untuk evaluasi trading
│   ├── backup/            # Mesin backup lokal & Google Drive
│   ├── credentials/       # Pengelolaan kredensial via OS safeStorage
│   ├── db/                # Koneksi SQLite, skema, dan migrasi database
│   ├── exchanges/         # Adapter API exchange (MEXC & Bitunix)
│   ├── ipc/               # Komunikasi antar-proses IPC bertipe aman
│   ├── screenshots/       # Pengelolaan file gambar screenshot lokal
│   └── sync/              # Mesin sinkronisasi data riwayat transaksi
├── src/                   # Renderer Process (React 19 + Tailwind CSS v4)
│   ├── assets/            # Logo SVG & Favicon resmi nitirekso
│   ├── components/        # Komponen UI, modal pamer PnL, dan visualisasi chart
│   ├── hooks/             # Custom hooks (useTheme, useTrades, useHidePnl)
│   ├── routes/            # Halaman Dashboard, TradeLog, Journal, Analytics, Settings
│   └── styles/            # Token CSS HSL (Royal Amethyst & Deep Obsidian)
├── shared/                # Kontrak tipe domain & antarmuka data
├── docs/                  # Panduan tagging Git & dokumentasi
└── plans/                 # Rencana arsitektur, data model, dan log fase proyek
```

---

## ❓ Tanya Jawab Umum (FAQ)

### 1. Apakah menghubungkan API MEXC dan Bitunix ke nitirekso aman?
**Sangat aman.** nitirekso hanya meminta izin *Read-Only* (hanya baca) untuk menyinkronkan data riwayat posisi tertutup, funding fee, dan saldo ekuitas. Aplikasi tidak memiliki kapabilitas untuk membuat order, mengubah posisi, ataupun mengeksekusi penarikan dana (*withdrawal*). Kunci API Anda dienkripsi secara lokal di sistem operasi menggunakan Windows DPAPI (`safeStorage`).

### 2. Mengapa memilih software jurnal otomatis offline dibanding Google Sheets atau Excel?
Spreadsheet manual menuntut trader mengetik ulang harga entry, exit, komisi, dan funding fee satu per satu setelah sesi trading yang melelahkan. Hal ini rawan salah ketik (*human error*) dan sering ditinggalkan setelah beberapa hari. nitirekso menarik data resmi exchange secara instan dalam 1 klik, menghitung Risk to Reward (RR) secara otomatis, dan memvisualisasikan kalender heatmap tanpa perlu rumus Excel rumit.

### 3. Apakah nitirekso menyimpan data histori trading saya di cloud?
**Tidak.** nitirekso mengusung arsitektur *100% Offline-First*. Seluruh database SQLite tersimpan secara lokal di komputer Anda (`%APPDATA%/nitirekso`). Tidak ada server cloud perantara, tidak ada pelacak analytics, dan tidak ada pihak ketiga yang dapat mengintip portofolio Anda.

### 4. Apa arti pemisahan Execution Grade (A/B/C/D) dengan hasil PnL?
Dalam trading kripto futures, profit bisa saja terjadi akibat melanggar rencana trading (*bad win* / faktor hoki), sementara kerugian wajar bisa terjadi meskipun SOP telah dipatuhi (*good loss*). nitirekso melatih Anda menilai kepatuhan terhadap proses eksekusi, bukan sekadar nominal dolar, demi menjaga psikologi trading yang tahan banting.

### 5. Di mana saya bisa mengunduh installer nitirekso?
Anda dapat mengunduh installer mandiri `.exe` versi terbaru langsung dari halaman [GitHub Releases](https://github.com/KaleksananBarqi/nitirekso/releases) atau mengunjungi [Landing Page Resmi](https://kaleksananbarqi.github.io/nitirekso/).

---

## 🌐 Repositori Resmi

Repositori resmi proyek telah disinkronkan ke:
* **GitHub**: [https://github.com/KaleksananBarqi/nitirekso](https://github.com/KaleksananBarqi/nitirekso)
* **Remote Git**:
  ```bash
  git remote set-url origin https://github.com/KaleksananBarqi/nitirekso.git
  ```

---

## 📜 Lisensi

Didistribusikan di bawah lisensi **MIT License**. Hak cipta © 2026 **nitirekso**. Bebas digunakan dan dikembangkan untuk keperluan personal maupun edukasi trading.
