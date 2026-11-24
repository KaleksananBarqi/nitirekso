# 0005 — Neo-Quant Bento Shell, Unified Theme Engine (34 Preset Jawa), dan Arekan Localization

Status: accepted

Untuk menghilangkan tampilan kaku (*box-in-box* border `1px` seragam, teks campur aduk Inggris-Indonesia, dan skema warna parsial) serta menyelaraskan identitas produk lintas ekosistem dengan `trawangan` baik di Desktop maupun Android, kami menetapkan tiga pilar antarmuka baru untuk `nitirekso`:

1. **Neo-Quant Bento Shell:** Mengganti pemisahan border keras seragam dengan permukaan tonal di atas lapisan dasar (`--bg-shell`), hierarki Bento di Dashboard, halaman Settings bertab 5 kategori, *Modern Toggle Switch*, indikator aktif bilah aksen kiri, dan target sentuh minimal `44px` di layar mobile.
2. **Unified Theme Engine (34 Theme Preset):** Menyatukan mode Gelap/Terang/Sistem dengan 34 preset bawaan (32 preset Jawa dari `warna.md` yang selaras dengan `trawangan` + 2 preset bawaan `nitirekso`: *Obsidian Amethyst* gelap & *Kertas Editorial* terang) serta tema kustom pengguna. Setiap preset menurunkan seluruh token surface, foreground, muted, border, dan kontras tombol `--on-primary` secara deterministik lolos WCAG 2.1 AA (`>= 4.5:1`), dengan memori preset gelap/terang terpisah untuk mode `system` dan *override* Colorblind-Safe yang tetap independen.
3. **Arekan Localization (`jv`, `id`, `en`):** Mengadopsi mesin pelokalan 3 bahasa dengan Basa Jawa Ngoko Arekan (`jv`) sebagai bahasa bawaan, disertai Bahasa Indonesia (`id`) dan English (`en`), tersimpan di SQLite `settings` (tersinkron Sync Vault), sambil mempertahankan istilah trading teknis baku (`Win Rate`, `Profit Factor`, `Drawdown`, `Funding Fee`, `R-Multiple`, `Long/Short`).

## Consequences

- Empat preset lama (`cyberpunk-neon`, `emerald-flow`, `tokyo-night`, `binance-gold`) digantikan koleksi 34 preset baru dengan fallback aman ke default apabila ID lama masih tersimpan di pengaturan pengguna; tema kustom buatan pengguna tetap dipertahankan.
- Seluruh komponen UI wajib menggunakan token CSS semantik (`--bg-shell`, `--background`, `--card`, `--primary`, `--primary-foreground`, `--profit`, `--loss`) dan fungsi translasi `t()` alih-alih string atau warna hardcoded.
- Lingkup tahap ini difokuskan pada aplikasi (`src/`); halaman publik (`docs/index.html`) dan README multibahasa menyusul setelah aset tangkapan layar terbaru tersedia.
