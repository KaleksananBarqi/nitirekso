# nitirekso Design System

> Presisi instrumen trading yang tenang dan editorial, terinspirasi oleh disiplin tata ruang Apple (`apple/DESIGN.md`) dan berakar penuh pada identitas **nitirekso** (*Niti Transaksi, Rekso Evaluasi*). Sistem ini memadukan `Plus Jakarta Sans`, `JetBrains Mono` (`tabular-nums`), dan aksen budaya Aksara Jawa (`ꦤꦶꦠꦶꦫꦼꦏ꧀ꦱ`) di atas kanvas Light Editorial (`#FFFFFF`, `#F5F5F7`) serta Deep Obsidian (`#0C0B14`, `#151322`), dengan satu aksen utama **Royal Amethyst** (`#7E22CE` / `#9333EA`) dan warisan candlestick **Gold** (`#CF9700`) serta **Teal** (`#45A9A9`) dari logo resmi.

Dial: ENERGY 2 / RHYTHM 3 / MOTION 1

> **Design Read:** Desktop trading journal showcase & precision analytical interface untuk trader kripto futures Indonesia, dengan bahasa visual *industrial editorial restraint* yang menonjolkan bukti tangkapan layar aplikasi nyata di atas panggung luas tanpa kebisingan dekorasi AI.

---

## 1. Visual Theme & Atmosphere

### Overall Aesthetic
**nitirekso** menerjemahkan ketenangan desain industrial ala Apple ke dalam ekosistem instrumen trading lokal (*offline-first*). Alih-alih mengandalkan orba glow ungu, tembok blur, dan kartu seragam khas halaman SaaS AI, antarmuka bertumpu pada panggung bersih, skala tipografi tegas, garis struktur `1px`, dan tangkapan layar desktop beresolusi penuh (`1442x932`).

### Mood & Feeling
- Tenang, presisi, dan dapat dipercaya untuk keputusan finansial
- Editorial dan jujur: menampilkan produk nyata, bukan klaim hiperbolis
- Terkendali: berani menyediakan ruang kosong struktural (*whitespace as structure*)
- Berkarakter budaya yang membumi (nilai Jawa *Niti* dan *Rekso*) tanpa terlihat kuno

### Design Density
- **Landing Page Publik (`docs/`):** Kepadatan **rendah ke sedang**. Modul besar, satu titik fokus per layar, jarak antar-bagian lega agar panggung produk bernapas.
- **Aplikasi Desktop (`src/`):** Kepadatan **sedang ke tinggi**. Padat data kuantitatif (`tabular-nums`), grid metrik rapi, dan kontras tinggi yang nyaman untuk sesi analisis panjang.

### Identity Motif
- **Garis Struktur & Panggung Produk:** Pemisahan bidang memakai pergeseran permukaan solid dan border halus `1px`, menempatkan layar aplikasi nyata di atas panggung khusus.
- **Aksen Amethyst Tunggal:** Royal Amethyst hadir hanya pada titik aksi utama dan penanda aktif, menjaga fokus visual tetap tajam.
- **Dual-Candlestick Heritage (`logo.svg`):** Motif batang candlestick Gold (`#CF9700`) dan Teal (`#45A9A9`) terbatas pada logo crest, penanda data grafis, atau aksen editorial filosofis.
- **Aksara Jawa (`ꦤꦶꦠꦶꦫꦼꦏ꧀ꦱ`):** Dipakai secara hemat pada momen filosofis (*Niti* dan *Rekso*), setara peran serif editorial pada sistem Apple.

---

## 2. Color Palette & Roles

Pembatasan palet mematuhi aturan **R-29**: warna netral (putih, abu-abu, obsidian) menjadi fondasi, ditambah **1 aksen utama** (Royal Amethyst), **2 aksen warisan logo** yang dibatasi ruang lingkupnya (Candlestick Gold & Teal), serta **2 warna semantik trading** khusus status profit/loss dan validasi.

### A. Brand & Accent Tokens

| Token | Light Mode | Dark Mode | Sumber & Peran |
|-------|------------|-----------|---------------|
| `--accent-primary` | `#7E22CE` | `#9333EA` | CTA utama, tautan fokus, penanda tab aktif (dari `branding.json`) |
| `--accent-primary-hover` | `#6B21A8` | `#7E22CE` | Status `:hover` dan `:active` tombol utama |
| `--accent-primary-text` | `#7E22CE` | `#C084FC` | Teks aksen ber-kontras tinggi pada latar kanvas/kartu |
| `--accent-tint-bg` | `#F3E8FF` | `#221738` | Latar chip/badge fungsional berpasangan dengan `--accent-tint-ink` |
| `--accent-tint-ink` | `#6B21A8` | `#E9D5FF` | Teks di atas `--accent-tint-bg` |
| `--crest-plum-start` | `#4E1F6E` | `#4E1F6E` | Gradien ikon resmi `logo.svg` (khusus mark logo) |
| `--crest-plum-end` | `#240638` | `#240638` | Gradien ikon resmi `logo.svg` (khusus mark logo) |
| `--candle-gold` | `#7A5900` | `#CF9700` | Warisan candlestick `logo.svg`; terbatas pada penanda brand/grafik |
| `--candle-teal` | `#0F766E` | `#45A9A9` | Warisan candlestick `logo.svg`; terbatas pada penanda brand/grafik |

### B. Light Mode Surfaces ("Editorial Paper & Aluminum Stage")
Menjadi **tema bawaan Landing Page Publik (`docs/index.html`)** agar panggung `#F5F5F7` mengangkat kontras tangkapan layar aplikasi desktop gelap secara alami tanpa memerlukan pendaran cahaya buatan.

| Token | Hex | Peran |
|-------|-----|-------|
| `--bg-canvas` | `#FFFFFF` | Kanvas utama halaman, panel konten bersih |
| `--bg-soft` | `#FBFBFD` | Bidang section sekunder bernuansa halus |
| `--bg-stage` | `#F5F5F7` | Panggung tangkapan layar produk, kartu elevasi ringan |
| `--bg-elevated` | `#EBEBF0` | Status hover kartu dan baris tabel sorotan |
| `--ink-primary` | `#1D1D1F` | Judul, teks utama, ikon aktif |
| `--ink-muted` | `#6E6E73` | Subjudul, metadata, label sekunder (versi accessible AA) |
| `--border-hairline` | `#D2D2D7` | Pembatas seksi non-interaktif dan bingkai halus |
| `--border-control` | `#7D7D82` | Border tombol sekunder, input, dan kontrol interaktif (rasio >= 3:1) |
| `--header-glass` | `rgba(255, 255, 255, 0.86)` | Latar sticky navbar (dipadukan dengan `backdrop-filter: blur(16px)`) |

### C. Dark Mode Surfaces ("Deep Obsidian Terminal")
Menjadi **tema bawaan Aplikasi Desktop (`src/`)** untuk kenyamanan mata sesi trading panjang, serta tersedia penuh melalui **Theme Toggle** pada landing page.

| Token | Hex | Peran |
|-------|-----|-------|
| `--bg-canvas` | `#0C0B14` | Kanvas utama Deep Obsidian (dari `branding.json`) |
| `--bg-soft` | `#100E1B` | Variasi bidang antar-section yang tenang |
| `--bg-stage` | `#151322` | Panggung produk, panel kartu utama (dari `branding.json`) |
| `--bg-elevated` | `#1C192E` | Status hover kartu dan header tabel (dari `branding.json`) |
| `--ink-primary` | `#F8F7FC` | Judul, teks utama, angka metrik (dari `branding.json`) |
| `--ink-muted` | `#9B98AE` | Teks pendukung, label, metadata (dari `branding.json`) |
| `--border-hairline` | `#262338` | Pembatas seksi non-interaktif (dari `branding.json`) |
| `--border-control` | `#756E99` | Border tombol sekunder, tab tidak aktif, dan kontrol interaktif (rasio >= 3:1) |
| `--header-glass` | `rgba(12, 11, 20, 0.86)` | Latar sticky navbar gelap |

### D. Trading Semantic Utility
Hanya digunakan pada data trading (PnL, Return, Status Sinkronisasi, Validasi), bukan sebagai dekorasi kartu pemasaran.

| Token | Light Mode | Dark Mode | Colorblind-Safe (`src/`) | Peran |
|-------|------------|-----------|--------------------------|-------|
| `--profit` | `#047857` | `#10B981` | `hsl(217 91% 55% / 65%)` | Profit positif, status `Verified`, status sinkron berhasil |
| `--loss` | `#B91C1C` | `#F43F5E` | `hsl(32 95% 52% / 60%)` | Rugi bersih, error validasi, peringatan |

### E. Matriks Kontras Terverifikasi WCAG AA (`contrast-check.py`)
Seluruh pasangan utama telah dihitung secara matematis agar memenuhi WCAG 2.x AA (`>= 4.5:1` teks normal, `>= 3.0:1` teks besar & batas kontrol):

| Pasangan (Latar / Depan) | Rasio | Status AA | Catatan |
|--------------------------|-------|-----------|---------|
| `#FFFFFF` / `#1D1D1F` | `16.83:1` | PASS | Teks utama Light Mode |
| `#F5F5F7` / `#1D1D1F` | `15.46:1` | PASS | Teks di atas panggung abu-abu |
| `#FFFFFF` / `#6E6E73` | `5.07:1` | PASS | Menggantikan `#86868B` Apple (`3.62:1` FAIL) |
| `#F5F5F7` / `#6E6E73` | `4.66:1` | PASS | Teks muted di atas stage Light |
| `#FFFFFF` / `#7E22CE` | `6.98:1` | PASS | Tautan & teks aksen Light |
| `#7E22CE` / `#FFFFFF` | `6.98:1` | PASS | Label tombol CTA utama Light |
| `#FFFFFF` / `#047857` | `5.48:1` | PASS | Profit/verified Light (menggantikan `#059669` `3.77:1` FAIL) |
| `#F5F5F7` / `#B91C1C` | `5.94:1` | PASS | Error/loss Light (menggantikan `#DC2626` `4.44:1` FAIL) |
| `#F5F5F7` / `#7D7D82` | `3.76:1` | PASS (3:1) | Border kontrol interaktif Light (juga `4.10:1` di `#FFFFFF`) |
| `#0C0B14` / `#F8F7FC` | `18.35:1` | PASS | Teks utama Dark Mode |
| `#151322` / `#9B98AE` | `6.53:1` | PASS | Teks muted di kartu Dark |
| `#0C0B14` / `#C084FC` | `7.40:1` | PASS | Teks aksen Amethyst Dark |
| `#9333EA` / `#FFFFFF` | `5.38:1` | PASS | Label tombol CTA utama Dark |
| `#0C0B14` / `#10B981` | `7.71:1` | PASS | Profit/verified Dark |
| `#0C0B14` / `#F43F5E` | `5.33:1` | PASS | Loss/error Dark |
| `#151322` / `#756E99` | `3.87:1` | PASS (3:1) | Border kontrol interaktif Dark |

### F. Aturan Wadah Logo 5 Exchange (`docs/assets/`)
Aset PNG exchange memiliki polaritas warna asli yang berlawanan (`bybit logo.png` & `Mexc Logo.png` berteks hitam; `BingX Logo.png` & `bitunix logo.png` berteks putih/terang; `binance logo.png` kuning).
- **Wadah Wajib (*Contrast-Safe Logo Tile*):** Jangan menaruh PNG mentah langsung di kanvas polos yang bertabrakan polaritasnya.
- **Implementasi Landing Page:** Bungkus setiap logo di kotak netral adaptif (contoh: untuk logo berteks gelap `bybit` dan `MEXC`, pakai wadah terang `#FFFFFF` dengan hairline border di kedua tema atau treatment kontras yang menjaga merek tetap utuh; untuk logo berteks putih `BingX` dan `Bitunix`, pakai wadah gelap `#151322` atau pill netral gelap di kedua tema sehingga 100% logo tetap terbaca tajam tanpa mengubah warna brand asli exchange).

---

## 3. Typography Rules

### Font Stack
- **Landing Page (`docs/`):**
```css
--font-sans: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-cultural: "Noto Sans Javanese", "Javanese Text", "Plus Jakarta Sans", serif;
--font-mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
```
- **Aplikasi Desktop (`src/`):** Karena kebijakan *offline-first* melarang panggilan CDN webfont eksternal, tetap gunakan system stack pada `src/styles/globals.css` (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` dan `ui-monospace, 'Cascadia Mono', Consolas, monospace`).

### Type Scale (Fluid `clamp()` untuk Landing Page)

| Elemen | Ukuran | Berat | Line Height | Letter Spacing | Warna Token |
|--------|--------|-------|-------------|----------------|-------------|
| Hero Display (`h1`) | `clamp(2.35rem, 5vw, 4.25rem)` | `700` | `1.06` | `-0.035em` | `--ink-primary` |
| Section Title (`h2`) | `clamp(1.75rem, 3.2vw, 2.65rem)` | `700` | `1.12` | `-0.025em` | `--ink-primary` |
| Feature / Card Title (`h3`) | `clamp(1.2rem, 1.8vw, 1.5rem)` | `600` | `1.22` | `-0.015em` | `--ink-primary` |
| Body Lead | `clamp(1.0625rem, 1.5vw, 1.25rem)` | `400` | `1.5` | `-0.01em` | `--ink-muted` |
| Body Default | `1rem` (`16px` atau `17px`) | `400` | `1.58` | `0` | `--ink-primary` / `--ink-muted` |
| Small / Meta | `0.875rem` (`14px`) | `500` | `1.45` | `0` | `--ink-muted` |
| Label / Kicker | `0.75rem` (`12px`) | `600` | `1.3` | `0.04em` | `--ink-muted` / `--accent-primary-text` |
| Tabular Metric | Sesuai konteks | `600` | `1.2` | `0` (`tabular-nums`) | `--ink-primary` / `--profit` / `--loss` |

### Typography Philosophy
- **Tenang dan Padat Makna:** Hindari teks heading dengan `linear-gradient` mengilap di seluruh kata. Kontras murni `--ink-primary` di atas `--bg-canvas` lebih berwibawa dan terbaca di segala layar.
- **Anti-Slop Typographic Guard (R-06):** Dilarang memakai `--font-mono` berukuran besar sebagai judul utama, dan batasi `letter-spacing` label uppercase maksimal `0.04em-0.06em`.

---

## 4. Component Stylings & Dose Caps

### Hierarki Border Radius (R-11)
Variasi radius digunakan sebagai penanda hierarki komponen (dilarang memaksa seluruh elemen menjadi kapsul `999px`):

| Komponen | Radius Token | Nilai | Tujuan Hierarki |
|----------|--------------|-------|-----------------|
| Primary & Secondary CTA Button | `--radius-pill` | `999px` | Aksi konversi utama bergaya Apple yang langsung dikenali |
| Product Stage & Window Frame | `--radius-stage` | `20px` (mobile `14px`) | Membingkai tangkapan layar aplikasi seperti perangkat keras |
| Content Card & Download Box | `--radius-card` | `16px` | Wadah informasi terstruktur tanpa sudut terlalu bulat |
| Tab Button, Input, Exchange Tile | `--radius-control` | `10px` | Kontrol antarmuka fungsional yang tegas |
| Technical Tag, OS Ext Badge | `--radius-tag` | `6px` | Penanda metadata ringkas (`.EXE`, `.DMG`, `MIT`) |

### Buttons
- Tinggi minimum seluruh tombol dan link kontrol adalah **`44px`** (R-03).
- **Primary Button:** Latar solid `--accent-primary`, teks `#FFFFFF`, border `none`, radius `999px`, tanpa `box-shadow` glow ungu. Hover menggeser latar ke `--accent-primary-hover`.
- **Secondary Button:** Latar `transparent` atau `--bg-canvas`, teks `--ink-primary` (atau `--accent-primary-text`), border `1px solid var(--border-control)`, radius `999px`.
- Panah (`→`) bukan hiasan default tombol (R-08); teks tombol harus menjelaskan aksi nyata (`Unduh untuk Windows (.exe)` bukan `Get Started →`).

### Product Stage & Native Window Frame
- Panggung screenshot (`dasbor.png`, `analytics.png`, dll.) memakai latar `--bg-stage`, radius `20px`, dan header window asli `nitirekso` berisi `assets/logo.svg` serta judul layar aktual.
- **Larangan R-05:** Dilarang memasang 3 bulatan merah/kuning/hijau palsu ala macOS window chrome.

### Glassmorphism, Shadow & Glow Caps (R-10, R-12, R-13)
- **Glassmorphism (R-10):** `backdrop-filter: blur(16px)` hanya boleh aktif pada **2 elemen maksimal**: sticky top navbar (`header`) dan overlay backdrop mobile drawer. Seluruh kartu, tab, dan tombol wajib solid matte.
- **Shadow (R-12):** Bayangan lembut netral hanya digunakan pada bingkai *Product Stage* agar terangkat dari kanvas (`0 16px 40px rgba(0, 0, 0, 0.08)` di Light; `0 24px 56px rgba(0, 0, 0, 0.48)` di Dark).
- **Glow (R-13):** Nol orba radial blur (`hero-glow-bg` dihapus), nol neon glow pada kartu maupun badge.

---

## 5. Layout Principles & Section Rhythm

### Spacing Scale

| Token | Desktop | Mobile (`< 640px`) | Penggunaan |
|-------|---------|--------------------|------------|
| `--space-1` | `4px` | `4px` | Jarak mikro ikon dan teks |
| `--space-2` | `8px` | `8px` | Celah antar-badge atau meta inline |
| `--space-3` | `12px` | `12px` | Gap kontrol kompak dan sel tabel padat |
| `--space-4` | `16px` | `16px` | Padding kontrol & gap list |
| `--space-5` | `24px` | `16px` | Padding internal kartu standar |
| `--space-6` | `32px` | `24px` | Jarak antar-blok konten dalam section |
| `--space-7` | `48px` | `32px` | Jarak antar-subbagian |
| `--space-8` | `64px` | `40px` | Padding vertikal section ringkas |
| `--space-9` | `96px` | `52px` | Ruang napas panggung Hero & section utama |

### RHYTHM 3 Composition Flow (Anti-Monotoni R-05)
Landing page disusun dengan ritme bervariasi yang mengikuti alur narasi produk:
1. **Sticky Header:** Ringkas (`height: 64px-72px`), tautan maksimal sesuai section nyata, Theme Toggle, GitHub, CTA `Unduh`.
2. **Hero Product Stage (Centered Display + Wide Stage):** Tanpa eyebrow capsule AI di atas H1. H1 tegas, subheadline singkat, aksi `Unduh` + `Lihat di GitHub`, daftar kompatibilitas OS datar, lalu screenshot `dasbor.png` berukuran lebar.
3. **5 Exchange Strip (Horizontal Rail / Compact Tiles):** Pemisah permukaan halus, 5 logo exchange dalam tile kontras-aman dengan keterangan jenis API *Read-Only*.
4. **Interactive Product Gallery (6 Real Screens):** Tab switcher keyboard-accessible di atas satu panggung besar yang menukar screenshot asli (`dasbor`, `trade log`, `journal trade`, `analytics`, `pnl share`, `pnl custom`) tanpa emoji di tag.
5. **Editorial Split: Filosofi & Pilar Arsitektur (Asymmetric 2-Column):** Kolom kiri menampilkan makna kultural *Niti (`ꦤꦶꦠꦶ`)* dan *Rekso (`ꦫꦼꦏ꧀ꦱ`)*; kolom kanan menjabarkan tiga prinsip kerja aplikasi (*Unified Sync*, *Offline-First SQLite*, *Execution Grade vs PnL*).
6. **Kapabilitas Rilis v1.9.0 (Flagship Spotlight + Structured Spec List):** Satu modul unggulan besar didampingi daftar spesifikasi teknis bernomor/terkelompok (bukan 10 kartu identik).
7. **Tabel Komparasi Jujur:** Perbandingan terbuka *nitirekso Desktop* vs *SaaS Cloud* vs *Spreadsheet* tanpa kolom harga fiktif.
8. **FAQ Terfokus + Multi-Platform Download Hub:** Accordion native `<details>` (pertanyaan riil pengguna) diikuti hub unduhan bertab `Windows` / `macOS` / `Linux` dan footer ringkas satu baris.

---

## 6. Depth & Elevation

Pemisahan kedalaman mengandalkan **kontras antar-permukaan** daripada tumpukan bayangan:
- **Lapisan 0 (`--bg-canvas`):** Kanvas dasar halaman.
- **Lapisan 1 (`--bg-soft` / `--bg-stage`):** Panggung section bergantian dan kartu diam (border `1px solid var(--border-hairline)`, tanpa shadow).
- **Lapisan 2 (`--bg-stage` Elevated Stage):** Bingkai Product Showcase dan Download Hub (`--shadow-stage`).
- **Lapisan 3 (`--header-glass`):** Sticky navbar melayang dengan blur terkendali (`z-index: 100`).

```css
/* Light Mode Elevation */
--shadow-stage: 0 16px 40px rgba(29, 29, 31, 0.08), 0 1px 3px rgba(29, 29, 31, 0.05);
--shadow-focus: 0 0 0 3px rgba(126, 34, 206, 0.35);

/* Dark Mode Elevation */
--shadow-stage: 0 24px 56px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04);
--shadow-focus: 0 0 0 3px rgba(192, 132, 252, 0.45);
```

---

## 7. Do's, Don'ts & Purpose-Gate Decisions (R-31)

### Do
- Tulis nama brand selalu dalam huruf kecil: **`nitirekso`** (kecuali awal kalimat bila tidak memungkinkan, tetap prioritaskan `nitirekso`).
- Verifikasi setiap klaim teknis terhadap repositori nyata (contoh: rilis v1.9.0 di `CHANGELOG.md`, `installMode` di `src-tauri/tauri.conf.json`).
- Gunakan tanda titik dua (`:`), koma (`,`), titik (`.`), atau tanda kurung `()` sebagai pengganti em dash.
- Uji seluruh pasangan warna di Light dan Dark Mode memakai `contrast-check.py`.

### Don't
- Dilarang menyertakan emoji dekoratif (`📊`, `🚀`, `💡`, `✨`, `⚡`) di judul, badge, bullet, maupun tombol.
- Dilarang menampilkan statistik pengguna, rating (`aggregateRating`), atau testimoni tanpa sumber terverifikasi (**R-17, R-18, R-36**).
- Dilarang memakai karakter em dash (`U+2014` atau `&mdash;`) pada teks antarmuka maupun copywriting (**R-02**).
- Dilarang memasang tautan mati (`href="#"`) atau item navbar tanpa section tujuan nyata (**R-24, R-26**).
- Dilarang menggunakan warna hex hardcoded di HTML inline yang merusak tema terang/gelap (**R-34**).

### Written Purpose Log (Wajib Antislop R-31)
- **Mengapa Light-First di Landing Page & Dark-First di Desktop App:** Tangkapan layar aplikasi asli sudah bernuansa gelap; kanvas terang `#FFFFFF`/`#F5F5F7` memberi bingkai kontras paling jernih bagi screenshot produk sekaligus membedakan landing page dari situs kripto gelap generik, sementara toggle gelap `#0C0B14` tetap tersedia penuh untuk preferensi malam (R-21).
- **Mengapa Royal Amethyst + Gold/Teal Terbatas:** Royal Amethyst adalah warna inti `branding.json` sebagai satu aksen aksi; Gold (`#CF9700`) dan Teal (`#45A9A9`) berasal langsung dari candlestick `logo.svg` sehingga hanya boleh muncul pada crest dan elemen visual trading tanpa melampaui batas palet R-29.
- **Mengapa Plus Jakarta Sans + Tabular Mono:** `Plus Jakarta Sans` merupakan tipografi wordmark resmi `nr` di `logo.svg`, sedangkan monospace `tabular-nums` memastikan kolom angka PnL dan R-Multiple sejajar secara vertikal tanpa dipakai sebagai judul hiasan (R-06).
- **Mengapa Variasi Radius:** `999px` pada CTA utama memberi affordance klik ala Apple, `20px` pada panggung screenshot menyerupai bingkai perangkat lunak, sedangkan `10px` dan `6px` menjaga kontrol tab dan tag teknis tetap tajam (R-11).
- **Mengapa Motion 1:** Pengguna target adalah trader yang menilai keandalan alat kerja; transisi cepat tanpa loop menjaga fokus pada data dan tangkapan layar nyata (R-19).

---

## 8. Responsive Behavior & Accessibility Contract

### Breakpoints Berbasis Konten (`antislop-layoutmobile`)
- **Mobile (`< 640px`):** Satu kolom penuh, padding vertikal section `40px-52px`, navigasi kolaps ke tombol Menu berlabel jelas (`aria-expanded`, `aria-controls`, tutup dengan `Escape`), gambar dan tabel tidak pernah memicu scroll horizontal (`overflow-x` pada wrapper tabel saja).
- **Tablet & Laptop Kecil (`640px - 1024px`):** Reflow dua kolom untuk blok filosofi, tabel download, dan grid spesifikasi; tidak memaksa grid 3-5 kolom menyempit.
- **Desktop (`>= 1025px`):** Kanvas maksimal `1160px-1200px` (`1280px` untuk header), navigasi satu baris penuh, panggung showcase lebar.

### Accessibility & Performance Mechanisms (R-03, R-32, R-39, R-40)
- **Touch Target:** Seluruh tombol, tab, link navigasi, dan `<summary>` memiliki tinggi/area klik minimal `44x44px` dengan jarak antar-target minimal `8px`.
- **Keyboard & Focus:** `cursor: pointer` pada seluruh kontrol aktif (`cursor: not-allowed` bila disabled), urutan `Tab` logis sesuai visual, tablist mendukung `ArrowLeft`/`ArrowRight`/`Home`/`End`, dan `:focus-visible` kontras tinggi `>= 3:1` di kedua tema.
- **Media & LCP (R-40):** Gambar hero (`dasbor.png`) dimuat langsung sebagai `<img>` HTML dengan `fetchpriority="high"`, tanpa `loading="lazy"`, dan seluruh gambar memiliki atribut `width` dan `height` eksplisit.
- **Motion Safety:** Seluruh transisi dibungkus atau dimatikan oleh `@media (prefers-reduced-motion: reduce)`.

---

## 9. Inventory Aset Terverifikasi & Agent Prompt Guide

### Aset di `docs/assets/` (Siap Pakai dengan Dimensi Eksplisit)

| Berkas | Dimensi Asli | Kegunaan |
|--------|--------------|----------|
| `docs/assets/logo.svg` | Vector `1080x1080` | Logo header, window frame header, watermark brand |
| `docs/assets/favicon.svg` | Vector `1080x1080` | Favicon halaman & Apple touch icon |
| `docs/assets/logo.png` | `512 x 512` | Open Graph / Twitter Card image |
| `docs/assets/screenshots/dasbor.png` | `1442 x 932` | Hero Product Stage (`fetchpriority="high"`) & Tab 1 |
| `docs/assets/screenshots/trade log.png` | `1442 x 932` | Tab 2 Showcase (Trade Log) |
| `docs/assets/screenshots/journal trade.png` | `1441 x 932` | Tab 3 Showcase (Jurnal & SOP) |
| `docs/assets/screenshots/analytics.png` | `1442 x 932` | Tab 4 Showcase (Analitik & Alpha ROI BTC) |
| `docs/assets/screenshots/pnl share.png` | `1442 x 932` | Tab 5 Showcase (Studio PnL Share) |
| `docs/assets/screenshots/pnl custom.png` | `1442 x 932` | Tab 6 Showcase (Kustomisasi Tema & Privasi) |
| `docs/assets/bybit logo.png` | `800 x 313` | Strip Integrasi Exchange (butuh tile kontras terang) |
| `docs/assets/binance logo.png` | `360 x 192` | Strip Integrasi Exchange |
| `docs/assets/BingX Logo.png` | `800 x 253` | Strip Integrasi Exchange (butuh tile kontras gelap) |
| `docs/assets/Mexc Logo.png` | `2084 x 2084` | Strip Integrasi Exchange (butuh tile kontras terang) |
| `docs/assets/bitunix logo.png` | `3064 x 699` | Strip Integrasi Exchange (butuh tile kontras gelap) |

### Scope Pemakaian Lintas Repositori
- **`docs/index.html` (Public Landing Page):** Memakai Light Editorial sebagai default + Dark Obsidian toggle, `Plus Jakarta Sans`, komposisi `RHYTHM 3`, dan seluruh aturan halaman web di atas.
- **`src/` (Desktop App Tauri + React):** Memakai Obsidian Dark (`src/styles/globals.css`) sebagai default + Light & Custom Color Schemes (`src/lib/customThemes.ts`), font system stack offline, dan tetap patuh pada aturan kontras AA, semantik aksesibilitas, serta skala ketertiban komponen.

### Agent Prompt Template
```text
Bangun atau ubah antarmuka nitirekso mengikuti DESIGN.md (Dial: ENERGY 2 / RHYTHM 3 / MOTION 1):
- Terapkan Light Editorial (#FFFFFF / #F5F5F7 / #1D1D1F) sebagai panggung default landing page dan Deep Obsidian (#0C0B14 / #151322 / #F8F7FC) sebagai Dark Mode setara WCAG AA.
- Pakai Royal Amethyst (#7E22CE light / #9333EA dark) hanya pada CTA utama dan penanda aktif; jaga kanvas bersih tanpa radial glow ungu atau gradient text.
- Gunakan tangkapan layar asli di docs/assets/screenshots/ dengan width/height eksplisit dan tile kontras-aman untuk 5 logo exchange.
- Variasikan komposisi antar-section, hilangkan emoji dekoratif dan em dash, dan verifikasi setiap kontrol interaktif serta breakpoint sebelum selesai.
```
