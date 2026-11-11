# Panduan Agen Repositori nitirekso

Dokumen ini mengarahkan alur kerja agen untuk proyek desktop trading journal **nitirekso** (Tauri v2 + Rust + React 19 + landing page statis di `docs/`).

## Aturan Routing UI & Desain

- **Untuk seluruh pekerjaan UI, landing page (`docs/`), atau komponen frontend (`src/`):** baca [DESIGN.md](DESIGN.md) terlebih dahulu sebagai arah identitas, palet terverifikasi WCAG AA, tipografi, dan ritme tata letak.
- **Filter kualitas UI wajib:** terapkan aturan `antislop` dan `antislop-ui` (beserta `antislop-human`, `antislop-layoutmobile`, dan `antislop-copywriting` bila menyentuh aksesibilitas, responsivitas, atau teks publik) sesuai mode sesi aktif, lalu jalankan Delivery Gate sebelum menyatakan tugas selesai.
- **Sumber kebenaran brand & aset:** gunakan token identitas di [branding.json](branding.json), variabel tema aplikasi di [src/styles/globals.css](src/styles/globals.css), dan aset grafis serta tangkapan layar asli di [docs/assets/](docs/assets/).

## Konteks Proyek & Batas Keamanan Fakta

- **Identitas brand:** selalu tulis **`nitirekso`** dengan huruf kecil. Makna nama: *Niti* (meneliti & mencatat secara saksama) dan *Rekso* (menjaga modal & merawat kedisiplinan).
- **Kejujuran klaim & data:** periksa fakta teknis langsung terhadap [package.json](package.json), [CHANGELOG.md](CHANGELOG.md), dan [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) sebelum menuliskan nomor versi, tipe installer, metrik, atau daftar fitur di UI publik.
- **Kebijakan aset offline desktop (`src/`):** aplikasi desktop dilarang memuat font atau skrip CDN eksternal; font di `src/styles/globals.css` wajib memakai system stack. Pembatasan CDN eksternal ini tidak berlaku untuk halaman web publik di `docs/`.

## Perintah Verifikasi Utama

- Periksa skrip build, typecheck, dan pengujian unit di [package.json](package.json) (`npm run typecheck`, `npm test`, `npm run build`).
- Untuk perubahan Rust backend di `src-tauri/`, verifikasi kompilasi dan uji melalui `cargo test` di dalam direktori `src-tauri/`.
- Untuk perubahan landing page di `docs/index.html`, verifikasi kontras warna menggunakan skrip pemeriksa kontras `antislop-human`, validasi sintaks JS/JSON-LD, dan periksa responsivitas di breakpoint mobile, tablet, serta desktop.
