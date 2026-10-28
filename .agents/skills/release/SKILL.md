---
name: release
description: "Lakukan rilis versi baru aplikasi Nitirekso secara otomatis dalam satu prompt: version bump multi-ekosistem (Node, Rust, Tauri, Mock IPC), changelog rapi, verifikasi multi-test Vitest & Cargo, git tag & push, GitHub release, CI/CD multi-platform (Windows, macOS, Linux), dan dev-log Obsidian."
disable-model-invocation: false
---

# Nitirekso Release Runbook (Automated)

Skill ini dirancang **khusus untuk proyek Nitirekso** (Tauri v2 + Rust + React/TypeScript). Gunakan skill ini setiap kali ada instruksi rilis seperti `/release`, `lakukan rilis`, atau `rilis versi baru`.

## Prosedur Eksekusi Langkah-demi-Langkah

### 1. Penentuan Nomor Versi
1. Baca versi saat ini dari `package.json` dan `src-tauri/tauri.conf.json`.
2. Tentukan nomor versi baru sesuai *Semantic Versioning* (`vX.Y.Z`):
   - Jika pengguna menyebutkan versi spesifik, gunakan versi tersebut.
   - Jika tidak, tentukan berdasarkan jenis perubahan (Major / Minor / Patch).

### 2. Sinkronisasi Seluruh Berkas Versi Proyek
Perbarui string versi pada seluruh berkas berikut secara konsisten:
- `package.json`: `"version": "X.Y.Z"`
- `src-tauri/Cargo.toml`: `version = "X.Y.Z"`
- `src-tauri/tauri.conf.json`: `"version": "X.Y.Z"`
- `src/lib/ipc/mock-adapter.ts`: ubah nilai `'<versi-lama>-mock'` menjadi `'X.Y.Z-mock'`
- `src/lib/ipc/ipc.test.ts`: ubah ekspektasi versi mock menjadi `'X.Y.Z-mock'`

Perbarui kedua lockfile resmi:
```bash
npm install --package-lock-only
cargo check --manifest-path src-tauri/Cargo.toml
```

### 3. Pembaruan `CHANGELOG.md`
Tambahkan entri rilis baru di paling atas daftar versi pada `CHANGELOG.md`:
- Header: `## [X.Y.Z] - YYYY-MM-DD`
- Kategori perubahan yang rapi dalam Bahasa Indonesia:
  - `### 🚀 Perubahan Arsitektur Utama` (jika ada pembaruan deep modules)
  - `### 🚀 Fitur Baru` (fitur baru bagi pengguna)
  - `### 🐛 Perbaikan Bug`
  - `### 🛠️ Peningkatan & Optimasi Sistem`
- Cantumkan sorotan multi-platform Windows, macOS, dan Linux.

### 4. Quality Gate & Verifikasi Mutlak
Seluruh tes dan build wajib dijalankan berurutan dan harus 100% lulus:
```bash
npm run typecheck
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```
> [!IMPORTANT]
> Jangan pernah membuat commit/tag rilis jika salah satu perintah di atas gagal. Selesaikan error terlebih dahulu.

### 5. Git Commit & Annotated Tag
1. Pastikan working tree bersih selain berkas rilis:
   ```bash
   git add CHANGELOG.md package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src/lib/ipc/mock-adapter.ts src/lib/ipc/ipc.test.ts
   git commit -m "chore(release): rilis vX.Y.Z - <deskripsi singkat rilis>"
   ```
2. Buat git tag resmi:
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z - <deskripsi singkat rilis>"
   ```
3. Push commit dan tag ke remote:
   ```bash
   git push origin main && git push origin vX.Y.Z
   ```

### 6. Publikasi GitHub Release & Pemantauan CI/CD
1. Buat catatan rilis pada berkas sementara (misal `/tmp/release_notes_vX.Y.Z.md`) berisi sorotan fitur, daftar installer multi-platform, dan hasil tes.
2. Buat release di GitHub:
   ```bash
   gh release create vX.Y.Z --title "nitirekso vX.Y.Z - <Judul Rilis>" --notes-file /tmp/release_notes_vX.Y.Z.md
   ```
3. Periksa status pemicuan workflow multi-platform di GitHub Actions:
   ```bash
   gh run list --limit 2
   ```

### 7. Integrasi Second Brain (Obsidian Dev Vault)
Simpan dev-log secara otomatis tanpa meminta konfirmasi:
- Panggil MCP tool `create_vault_file` dengan path:
  `Project Logs/YYYY-MM-DD - Rilis Nitirekso vX.Y.Z.md`
- Masukkan ringkasan rilis, daftar file yang dimodifikasi, tautan GitHub release, dan tags `#dev-log #release #nitirekso #tauri`.

### 8. Laporan Final ke Pengguna
Tampilkan ringkasan singkat dalam Bahasa Indonesia yang memuat tautan GitHub Release, tautan GitHub Actions CI/CD runner, serta konfirmasi keberhasilan seluruh tahapan.
