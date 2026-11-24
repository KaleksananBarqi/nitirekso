---
name: release
description: "Lakukan rilis versi baru aplikasi Nitirekso secara otomatis dalam satu prompt: version bump multi-ekosistem (Node, Rust, Tauri, Mock IPC), changelog rapi, verifikasi multi-test Vitest, Cargo & Android check, git tag & push, GitHub release, CI/CD multi-platform (Windows, macOS, Linux, Android), dan dev-log Obsidian."
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
- Cantumkan sorotan multi-platform Windows, macOS, Linux, dan Android (`arm64-v8a` APK).

### 4. Quality Gate & Verifikasi Mutlak
Seluruh tes dan build wajib dijalankan berurutan dan harus 100% lulus:
```bash
npm run typecheck
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```
Jika NDK lokal terpasang, jalankan juga verifikasi kompilasi silang Android (lewati secara eksplisit bila NDK lokal tidak ditemukan, karena build penuh Android dijalankan pada job `build-android` di CI):
```bash
NDK_BIN=$(find "${ANDROID_HOME:-$HOME/Android/Sdk}/ndk" -maxdepth 5 -name "aarch64-linux-android29-clang" 2>/dev/null | head -n 1)
if [ -n "$NDK_BIN" ]; then
  CC_aarch64_linux_android="$NDK_BIN" AR_aarch64_linux_android="$(dirname "$NDK_BIN")/llvm-ar" \
    cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-linux-android
fi
```
> [!IMPORTANT]
> Jangan pernah membuat commit/tag rilis jika salah satu perintah di atas gagal. Selesaikan error terlebih dahulu.

### 5. Git Commit & Annotated Tag
1. **Verifikasi Pra-Commit & Pra-Tag Wajib:**
   - Pastikan berkas keystore Android (`*.jks`, `*.keystore`) dan output build Gradle (`src-tauri/gen/android/app/build/`) ter-ignore (`git check-ignore -v`) dan tidak muncul di `git status` sebelum `git add`.
   - Jalankan `gh secret list` sebelum membuat/push tag untuk memastikan 4 secret signing Android (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`) sudah aktif di GitHub; jangan pernah merilis APK *unsigned*.
2. Pastikan working tree bersih selain berkas rilis:
   ```bash
   git add CHANGELOG.md package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src/lib/ipc/mock-adapter.ts src/lib/ipc/ipc.test.ts
   git commit -m "chore(release): rilis vX.Y.Z - <deskripsi singkat rilis>"
   ```
3. Buat git tag resmi:
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z - <deskripsi singkat rilis>"
   ```
4. Push commit dan tag ke remote:
   ```bash
   git push origin main && git push origin vX.Y.Z
   ```

### 6. Publikasi GitHub Release & Pemantauan CI/CD
> [!NOTE]
> **Guardrail Workflow `.github/workflows/release.yml`:**
> - Dilarang memakai `${{ secrets.* }}` di ekspresi `if:` pada step/job YAML (gagal parse `0s`); oper lewat `env:` lalu cek di bash dan teruskan via `$GITHUB_ENV`.
> - Dilarang memakai `android-actions/setup-android@v3` (gagal `Failed to find package 'tools'`); gunakan `sdkmanager` bawaan runner Ubuntu.
> - Step koleksi artefak Android wajib menolak berkas `*-unsigned.apk` agar tidak pernah menerbitkan APK yang gagal diinstal.

1. Buat catatan rilis pada berkas sementara (misal `/tmp/release_notes_vX.Y.Z.md`) berisi sorotan fitur, daftar installer multi-platform, dan hasil tes.
2. Buat release di GitHub (bersifat idempoten terhadap job `publish` di workflow CI yang akan mengunggah biner bertanda tangan `minisign`, `latest.json`, dan `SHA256SUMS.txt` dengan `--clobber`):
   ```bash
   gh release create vX.Y.Z --title "nitirekso vX.Y.Z - <Judul Rilis>" --notes-file /tmp/release_notes_vX.Y.Z.md
   ```
3. Segera periksa status workflow multi-platform (`build` Windows/macOS/Linux, `build-android` APK `arm64-v8a`, dan job `publish`) di GitHub Actions untuk memastikan run tidak gagal di `0s` akibat galat sintaks workflow:
   ```bash
   gh run list --limit 3
   ```
4. Setelah workflow selesai sukses, verifikasi bahwa seluruh aset termasuk `nitirekso_X.Y.Z_arm64-v8a.apk`, `latest.json`, dan `SHA256SUMS.txt` telah terbit di GitHub Release:
   ```bash
   gh release view vX.Y.Z --json assets --jq '.assets[].name'
   ```

### 7. Integrasi Second Brain (Obsidian Dev Vault)
Simpan dev-log secara otomatis tanpa meminta konfirmasi:
- Panggil MCP tool `create_vault_file` dengan path:
  `Project Logs/YYYY-MM-DD - Rilis Nitirekso vX.Y.Z.md`
- Masukkan ringkasan rilis, daftar file yang dimodifikasi, tautan GitHub release, dan tags `#dev-log #release #nitirekso #tauri`.

### 8. Laporan Final ke Pengguna
Tampilkan ringkasan singkat dalam Bahasa Indonesia yang memuat tautan GitHub Release, tautan GitHub Actions CI/CD runner, serta konfirmasi keberhasilan seluruh tahapan.
